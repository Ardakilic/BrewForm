## Context

The recipe domain in `apps/api/src/modules/recipe/` follows the project's
standard 3-layer pattern: `model.ts` (data access) → `service.ts` (business
logic) → `index.ts` (HTTP controller). AGENTS.md and `mem:conventions` codify
the layering rule: **services import from model files, never from
`drizzle-orm` directly**. Every recipe service function except `createRecipe`
already complies. `createRecipe` is the sole outlier — it imports `db`, six
schema tables, and `eq` from `drizzle-orm`, and runs an inline
`db.transaction` that inserts the recipe row, its first version, optional
taste notes / equipment / additional preparations / version photos, and
updates `currentVersionId`.

The model layer already owns analogous transactions: `model.forkRecipe`
(`model.ts:352-475`) wraps a multi-table insert + `forkCount` increment in
`db.transaction`; `model.toggleLike` (`model.ts:591-625`) wraps an
upsert-or-delete + counter update. Both return typed objects. `forkRecipe` is
the closest analogue to `createRecipe` and is the template D29 follows.

### Codebase facts (verified)

- `service.ts:15` — `import { db } from '@brewform/db';` (used only by
  `createRecipe`'s transaction).
- `service.ts:16-23` — schema-table imports (`recipes`, `recipeVersions`,
  `recipeTasteNotes`, `recipeEquipment`, `recipeAdditionalPreparations`,
  `recipeVersionPhotos`). Used only inside the `createRecipe` transaction.
- `service.ts:24` — `import { eq } from 'drizzle-orm';` (used only by the
  `tx.update(recipes).where(eq(recipes.id, r.id))` at `service.ts:288`).
- `service.ts:203-208` — the `TODO(D29)` marker, which names every import to
  remove and points to `plans/D29-recipe-service-drizzle-orm-import.md`.
- `service.ts:209-291` — the `db.transaction(async (tx) => { ... })` block.
  Inserts `recipes` (with `currentVersionId: null`), inserts `recipeVersions`
  (versionNumber 1), conditionally inserts the four child tables, then
  `UPDATE recipes SET currentVersionId = version.id`. Returns
  `{ ...r, versions: [version] }` (a *bare* shape with no nested relations).
- `service.ts:293` — `const finalRecipe = await model.findById(recipe.id);`
  reloads the full relational shape. The transaction result is used **only**
  for `recipe.id` at this line.
- `service.ts:295-308` — post-transaction side effects:
  `notifyFollowersOfNewRecipe` (fired-and-forgotten IIFE with `.catch()` when
  `visibility === 'public'`) and `evaluateBadges` (fired-and-forgotten
  `.catch()`). Both read `finalRecipe` (the `findById` result), **not** the
  transaction result.
- `service.ts:311` — `return finalRecipe;` (the function's actual return to
  the controller is the rich `findById` shape, not the bare transaction
  shape).
- `service.ts:117-132` — `checkEquipmentCompatibility`: a pure function over
  in-memory arrays. The file docstring's "except for the compatibility
  validation helper" carve-out is outdated.
- `model.ts:352-475` — `forkRecipe`: the preferred-pattern template. Owns a
  full `db.transaction`, returns a manually-assembled rich object
  (`{ ...newRecipe, versions: [{ ...newVersion, tasteNotes, equipment,
  additionalPreparations, versionPhotos }] }`). Note: `forkRecipe`'s return is
  still *thinner* than `findById` (it omits `author`, `photos`, `forkedFrom`)
  — D29's helper avoids that shortfall by calling `findById` after the
  transaction.
- `model.ts:10-44` — `model.ts` imports. Already include `db`, all six
  affected schema tables, `eq`, `sql`. Zero new imports are required for the
  move.
- `index.ts:271-299` — the `POST /api/v1/recipes` route. `describeRoute`
  (lines 273-281) has only `tags`, `summary`, `security`, and bare
  `201`/`403` description strings — no `requestBody`, no response `content`/
  `schema`, no `401`. The route passes `openapi.coverage.test.ts` only because
  `/api/v1/recipes` is not in the test's `IN_SCOPE_BASE_PATHS` array (verified:
  the coverage test enforces the 401-on-guarded rule only for in-scope base
  paths; `/api/v1/recipes`, `/api/v1/auth`, `/api/v1/admin` are all absent).

### Stakeholders

- **API (`apps/api/`)** — primary, all code changes live here.
- **Shared package (`packages/shared/`)** — new `RecipeDetailOutputSchema` +
  test registration. No shape change to input schemas.
- **Web app, DB package** — unaffected. No migration.
- **OpenAPI consumers** — the generated spec at `/api/v1/openapi.json` and
  the Scalar UI at `/api/v1/docs` become more accurate for `POST /recipes`.

## Goals / Non-Goals

**Goals:**

- Restore the layering rule: `service.ts` imports zero symbols from
  `drizzle-orm` or `@brewform/db/schema`.
- Encapsulate the `createRecipe` transaction in a model helper that owns the
  full multi-table insert and returns the rich relational shape.
- Preserve the exact wire response of `POST /api/v1/recipes` (the `findById`
  rich shape) — zero observable behavioral change for clients.
- Fix the `createRecipe` route's OpenAPI `describeRoute` to be AGENTS.md-
  compliant (request body + response schema + error envelopes).
- Add net-new test coverage for the create path (currently none exists at the
  service, model, or HTTP level for `createRecipe`).
- Pass `make fmt`, `make check`, `make check-tests`, `make lint`, and
  `make test-api` with zero regressions.

**Non-Goals:**

- **Fix the `tds` drop.** `RecipeCreateObjectSchema.tds` (recipe.ts:43) is
  accepted on the wire and validated, but the current transaction at
  `service.ts:218-247` never writes `tds` to `recipeVersions`. This is a
  pre-existing bug. The helper preserves the drop verbatim (the move is
  mechanical); fixing the bug is a separate change. See Open Questions.
- **Fix `coffeeVarietyId` / `coffeeVarietyName`.** These columns exist on
  `recipeVersions` but are intentionally absent from `RecipeCreateObjectSchema`
  (variety linkage happens through `beanId` or a separate update flow). The
  helper does not add them.
- **Populate `photoIds` from the controller.** `RecipeCreateInput.photoIds`
  (`service.ts:50-52`) is currently dead on the create route — the controller
  passes `body` straight through without setting `photoIds`. The helper
  preserves the branch for contract parity; making it reachable is a separate
  change.
- **Fix `generateUniqueSlug`'s no-op conflict branch.** `generateUniqueSlug`
  (`service.ts:65-70`) calls `ensureUniqueSlug(slug, [])` with an empty array,
  so on a slug collision it returns the colliding slug unchanged. Pre-existing
  latent bug; out of scope.
- **Fix the grind-size / brewer-details / grinder length mismatches.** Zod
  allows 100 chars for `grindSize` but the column is `varchar(50)`; setup-
  inherited `brewerDetails`/`grinder` bypass the wire schema's 200-char max.
  All pre-existing; out of scope.
- **Add `/api/v1/recipes` to the coverage test's `IN_SCOPE_BASE_PATHS`.** That
  would turn the coverage test into a real enforcer for the recipe module but
  would immediately fail every other auth-guarded recipe route that lacks a
  `401` envelope. Out of scope — D29 only fixes `createRecipe`'s own docs.
- **Remove the `TODO(D29)` comment.** It is removed as part of the move (the
  transaction block it annotates moves into the model).

## Decisions

### Decision 1: The helper returns the rich `findById` shape, not the bare transaction shape

**Rationale.** The original plan contradicts itself: line 59 says the helper
"should return the rich row + relations" so the service can "drop the
post-transaction `findById`", while line 102 says the helper "must return the
same `RecipeWithRelations` shape that the inline transaction currently
produces (recipe row + `versions: [version]`)". These are mutually exclusive.
Ground truth: the inline transaction returns a *bare*
`{ ...r, versions: [version] }` (no `author`, no nested `tasteNotes`/
`equipment`/`additionalPreparations`/`versionPhotos`/`bean`, no `photos`, no
`forkedFrom`), while the service's actual return to the controller is
`finalRecipe = await model.findById(recipe.id)` — the *rich* shape. If the
helper returned the bare shape and the service dropped `findById`, clients
would lose every relation field. That is a wire-format regression.

The correct target is plan line 59: the helper runs the transaction, then
calls `findById(r.id)` and returns the rich shape. The service drops its own
`findById` reload. This is also cleaner than reassembling relations inline
the way `forkRecipe` does (which still misses `author`/`photos`/`forkedFrom`)
— `findById` is the canonical rich-shape loader and is already used by every
other recipe read path.

**Alternatives considered.**

- *Return the bare transaction shape, keep `findById` in the service* —
  rejected; leaves the service doing a redundant load and doesn't achieve the
  plan's "drop the `findById`" goal. Also makes the helper's return type
  misleading (callers expect the rich shape).
- *Reassemble relations inline like `forkRecipe`* — rejected; duplicates
  `findById`'s `with:` tree and still omits `author`/`photos`/`forkedFrom`.
  Two sources of truth for the rich shape.
- *Have the service keep both the transaction result and `findById`* —
  rejected; the transaction result is used only for `.id`, which the helper
  can return directly.

### Decision 2: The helper's input is a single typed interface, not positional args

**Rationale.** `forkRecipe` uses positional args `(sourceId, authorId, title,
slug)` because it has only four primitives. `createRecipe`'s input is ~28
version fields + 4 recipe fields + 5 relation arrays — positional args would
be unreadable and error-prone. The codebase's other multi-field model helpers
(`auth/model.ts:createUser`, `admin/model.ts:adminCreateUser`) use inline
anonymous object types; D29 uses an **exported named interface**
(`CreateRecipeWithRelationsInput`) to match the `RecipeFilterCriteria`/
`RecipeListFilters`/`CursorResult<T>` house style (all exported interfaces in
`model.ts`). The interface is co-located in `model.ts` and JSDoc-documented.

The interface accepts the *pre-resolved* values the service computes:
`slug` (already generated), `title` (already sanitized), `brewRatio`/
`flowRate` (already computed), `grinder`/`brewerDetails` (already
setup-inherited), `roastDate`/`packageOpenDate`/`grindDate`/`brewDate` (already
`Date`-cast), `personalNotes`/`preparationNotes` (already `sanitizeText`'d).
The helper does **not** re-derive any of these — it is a pure data-access
function. This keeps the business logic in the service (where AGENTS.md puts
it) and the data access in the model.

**Alternatives considered.**

- *Accept the raw `RecipeCreateInput` and re-derive inside the helper* —
  rejected; would move business logic (sanitization, slug generation,
  computation, setup inheritance) into the model layer, violating the rule in
  the other direction.
- *Positional args* — rejected; too many fields.

### Decision 3: The transaction body is moved verbatim — no field additions or removals

**Rationale.** The plan says "move the transaction body verbatim" and the
migration risk note says "the SQL emitted is identical. Behavioural risk is
low." Verbatim move means the helper's `recipeVersions` insert includes
exactly the 28 fields the service's insert has today — no more, no less. In
particular, `tds` (which `RecipeCreateObjectSchema` accepts but the current
insert omits) stays omitted. Fixing that is a separate change with its own
test and migration considerations. Same for `coffeeVarietyId`/
`coffeeVarietyName` (intentionally absent from the wire schema).

The `versionNumber: 1` literal, the `currentVersionId: null` then
`UPDATE ... SET currentVersionId = version.id` two-step, the
`intensity: input.tasteNoteIntensities?.[id] ?? 1` default, and the
`sortOrder: i` (array index) for additional preparations and version photos
are all preserved exactly.

**Alternatives considered.**

- *Fix the `tds` drop while moving* — rejected; bundles a behavior change with
  a refactor, making the move non-mechanical and the wire response
  observable-different (the `tds` column would suddenly be populated). Keep
  the refactor pure; file the `tds` fix separately.

### Decision 4: The helper avoids `forkRecipe`'s `eq` parameter shadowing

**Rationale.** `forkRecipe` (`model.ts:413,465`) uses `.map((eq) => ...)`
callbacks that shadow the imported `eq` from `drizzle-orm`. It is functionally
harmless (the file carries `// deno-lint-ignore-file no-explicit-any`) but is a
readability smell and a trap for future readers. D29's helper names the
callback parameter `id` (for taste-note/equipment iteration) or `er`/`eqRow`
(where a row is the parameter) — never `eq`.

**Alternatives considered.**

- *Copy the `eq` shadowing pattern* — rejected; propagates a smell.

### Decision 5: The OpenAPI gap is fixed in the same change, not deferred

**Rationale.** The `createRecipe` route's `describeRoute` has no request body
and no response schema — a pre-existing AGENTS.md violation that the original
D29 plan ignores. Folding the fix into D29 is justified because (a) the route
is the direct consumer of the function being refactored, (b) the new
`RecipeDetailOutputSchema` is derived from the `findById` return shape that
the helper now formalizes as its contract, and (c) the OpenAPI coverage test
is the project's documented enforcement point for route documentation. D29
makes the route compliant so the refactor doesn't leave a known violation in
its wake.

The new `RecipeDetailOutputSchema` is added to
`packages/shared/src/schemas/responses/recipe.ts`, derived from the actual
`findById` `with:` tree: `RecipeRowSchema` base + a new
`RecipeDetailAuthorSchema` (`{id, username, displayName, avatarUrl}` — note
`RecipeAuthorMiniSchema` omits `id` and is therefore insufficient) + a new
`RecipeDetailVersionSchema` (extends the flat `RecipeVersionRowSchema` columns
with `tasteNotes[].tasteNote`, `equipment[].equipment`,
`additionalPreparations`, `bean`) + `photos[]` + `forkedFrom`. The schema is
registered in the `responses/index.ts` barrel and in the
`output-schema-acceptance.pbt.test.ts` `cases` array, with a co-located
round-trip unit test in `recipe.test.ts`.

The route's `describeRoute` is updated to include `requestBody:
jsonRequestBody(RecipeCreateSchema)`,
`resolver(successEnvelope(RecipeDetailOutputSchema))` for `201`, and
`resolver(ErrorEnvelopeSchema)` for `400` (validation), `401` (auth), and
`403` (forbidden / email-not-verified). `Recipes` is already in the tag list
(`openapi.ts:61`).

**Alternatives considered.**

- *Defer the OpenAPI fix to a separate change* — rejected; leaves a known
  violation adjacent to the refactor and forces the implementer to derive the
  output schema twice (once for D29's tests, once for the docs).
- *Reuse `RecipeWithVersionsOutputSchema`* — rejected; its version schema
  omits `tasteNotes`/`equipment`/`additionalPreparations`/`bean`, and its
  author schema (`RecipeAuthorMiniSchema`) omits `id`. Neither matches the
  `findById` shape.

### Decision 6: Tests are net-new (model-level + service-level + HTTP)

**Rationale.** There is no existing test for `service.createRecipe` or
`model.forkRecipe` — `service.test.ts` tests *pure sub-logic* (slug, brew
ratio) by reimplementing expressions inline; it never imports `./service.ts`.
`index_test.ts`'s local `createRecipe` is a bare-row pagination fixture, not
an invocation of the service function. So D29's "add a model-level test" is
greenfield coverage, not a regression guard. To actually guard against
wire-shape drift, D29 adds three layers of tests:

1. **`model.create.test.ts`** — model-level integration test for
   `createRecipeWithRelations` (the helper's direct contract).
2. **A service-level integration test** — asserts `service.createRecipe`
   returns the rich `findById` shape end-to-end (regression guard for the
   move).
3. **An HTTP integration test for `POST /api/v1/recipes`** — asserts `201` +
   success envelope + `data.author` + `data.versions[0].tasteNotes` present
   (strongest wire-shape guard).

All three follow the `coffee-variety/model.test.ts` fixture pattern:
`import '../../test-setup.ts';` first; `describe('...', { sanitizeOps: false,
sanitizeResources: false }, ...)`; `beforeEach`/`afterEach` with
`crypto.randomUUID()` IDs + explicit `db.delete` child-first cleanup.

**Alternatives considered.**

- *Only the model-level test the plan asks for* — rejected; no guard against
  the service or HTTP layer regressing.
- *Only an HTTP test* — rejected; doesn't directly exercise the helper's
  contract (version fields, taste-note intensity default, `sortOrder`).

### Decision 7: The file-level docstring is corrected, not just trimmed

**Rationale.** The original plan says "remove the 'except for the
compatibility validation helper' sentence". The replacement docstring
restates the rule positively: "All DB access is delegated to `model.ts` — no
Drizzle calls from this module." This matches the actual post-D29 state
(no exceptions remain) and is stronger than a silent deletion.

## Risks / Trade-offs

- **Field-list exhaustiveness.** The helper's `recipeVersions` insert must
  include exactly the 28 fields the service's insert has today. A missed
  field silently drops a column. Mitigation: the model-level test asserts
  every version field is persisted with the value passed in; the
  service-level test asserts the returned shape matches `findById`.
- **`preparationNotes` nullability.** The column is `text NOT NULL`. The
  service pre-sanitizes with `sanitizeText`, which returns `''` for falsy
  input. The helper's input type declares `preparationNotes: string` (not
  optional) so TypeScript enforces non-null at compile time.
- **Unique constraints.** `recipe_taste_note_recipe_version_id_taste_note_id_unique`,
  `recipe_equipment_recipe_version_id_equipment_id_unique`,
  `recipe_version_photo_recipe_version_id_photo_id_unique`, and
  `recipe_version_recipe_id_version_number_unique` (versionNumber=1 for
  create). The helper does not deduplicate — the current code relies on input
  uniqueness. Mitigation: the tests use unique UUIDs per row.
- **OpenAPI scope expansion.** Adding a complete `describeRoute` to
  `createRecipe` is additive and does not affect the coverage test's pass
  state (the route already passes; it just gets richer metadata).
- **`tds` preserved-drop.** The helper continues to omit `tds` from the
  `recipeVersions` insert, matching today's behavior. This is a known
  pre-existing bug (Open Question 1); fixing it is deferred.
- **`forkRecipe` is still untested.** D29 adds tests for
  `createRecipeWithRelations` but does not retroactively test `forkRecipe`.
  That is a separate gap.

## Migration Plan

This is a pure refactor with no schema migration, no feature flag, and no
deploy sequencing. The SQL emitted by the moved transaction is byte-identical
to today.

1. **Add `CreateRecipeWithRelationsInput` + `createRecipeWithRelations`** to
   `model.ts` near `forkRecipe`. Move the transaction body verbatim from
   `service.ts:209-291`; after the `db.transaction` returns, call
   `findById(r.id)` and return the result. Add the full JSDoc. Run
   `make check-api` — must pass.
2. **Rewire `service.ts:createRecipe`** to call the helper. Drop the
   `TODO(D29)` comment, the `db.transaction` block, and the
   `model.findById(recipe.id)` reload. Keep the pre-transaction business
   logic and the post-transaction side effects unchanged. Run
   `make check-api` — must pass.
3. **Delete the offending imports** from `service.ts` (lines 15-24: `db`,
   the six schema tables, `eq`). Run `make check-api` and `grep -n 'drizzle-orm\|@brewform/db\|db\.' apps/api/src/modules/recipe/service.ts` — the latter must return zero hits.
4. **Fix the file-level docstring** at `service.ts:1-11`. Run
   `make check-api`.
5. **Add `RecipeDetailOutputSchema`** (+ `RecipeDetailAuthorSchema` +
   `RecipeDetailVersionSchema` + any sub-schemas) to
   `packages/shared/src/schemas/responses/recipe.ts`. Register in the
   `responses/index.ts` barrel. Add the co-located round-trip test in
   `recipe.test.ts` and register in
   `output-schema-acceptance.pbt.test.ts`. Run `make check` and
   `make test-shared` — must pass.
6. **Wire the `createRecipe` route's `describeRoute`** in `index.ts` with
   `requestBody: jsonRequestBody(RecipeCreateSchema)` and
   `resolver(successEnvelope(RecipeDetailOutputSchema))` /
   `resolver(ErrorEnvelopeSchema)`. Run `make check-api` and
   `make test-specific filter=apps/api/src/routes/openapi.coverage.test.ts`
   — both must pass.
7. **Add the three test files** (`model.create.test.ts`, the service-level
   test, and the HTTP test in `index_test.ts`-style). Run
   `make check-tests` and `make test-specific filter=apps/api/src/modules/recipe/`
   — all must pass.
8. **Final verification** — `make fmt`, `make check`, `make check-tests`,
   `make lint`, `make test-api`. All green.

### Rollback

A single `git revert` of the merge commit removes the helper, restores the
inline transaction and imports, restores the bare `describeRoute`, and
removes the new tests + schema atomically. No database state to undo (the
moved transaction emits identical SQL).

## Open Questions

- **`tds` drop — bug or intentional?** `RecipeCreateObjectSchema.tds`
  (recipe.ts:43) is accepted on the wire and validated
  (`z.number().min(0).max(25).optional().nullable()`), the `recipeVersions.tds`
  column exists (schema.ts:199, `decimal(4,2)` nullable), but the current
  transaction at `service.ts:218-247` never writes `tds`. D29 preserves the
  drop verbatim (the move is mechanical). **Decision: file a separate change
  (D30 or similar) to add `tds` to the insert and to the helper's input
  type.** Flag here, do not silently fix.
- **`brewRatio` / `flowRate` overwrite.** The wire schema accepts
  client-supplied `brewRatio`/`flowRate` (recipe.ts:55-56), but the service
  overwrites them with `computeBrewRatio`/`computeFlowRate` results. The
  helper continues to use the service-computed values. **Confirmed: not a
  bug — the computed values are authoritative.** No action.
- **Should `/api/v1/recipes` be added to the coverage test's
  `IN_SCOPE_BASE_PATHS`?** That would make the coverage test enforce the
  401-on-guarded rule for all recipe routes (today only `createRecipe` is
  fully documented; the other 14 recipe routes lack response schemas). Out
  of scope for D29; worth a separate ticket.