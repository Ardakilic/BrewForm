## Why

`apps/api/src/modules/recipe/service.ts` violates the layering rule documented in
AGENTS.md and `mem:conventions`:

> Services import from model files, never from `drizzle-orm` directly.

The violation is concentrated in a single function, `createRecipe`
(`apps/api/src/modules/recipe/service.ts:175-312`):

- `import { db } from '@brewform/db';` — `service.ts:15`
- six schema-table imports (`recipes`, `recipeVersions`, `recipeTasteNotes`,
  `recipeEquipment`, `recipeAdditionalPreparations`, `recipeVersionPhotos`) —
  `service.ts:16-23`
- `import { eq } from 'drizzle-orm';` — `service.ts:24`
- an inline `db.transaction(async (tx) => { ... })` block — `service.ts:209-291`
- `tx.update(recipes).set(...).where(eq(recipes.id, r.id))` — `service.ts:288`

Every other function in the file (`updateRecipe`, `deleteRecipe`, `forkRecipe`,
`listRecipes`, `listStarredRecipes`, `toggleLike`, `toggleFavourite`,
`toggleFeature`, `saveNotes`, `getRecipe`, `getRecipeMeta`) already delegates to
`model.*`. `createRecipe` is the sole outlier. The file-level docstring at
`service.ts:1-11` acknowledges the rule but carries an outdated carve-out
("except for the compatibility validation helper") — that helper,
`checkEquipmentCompatibility` (`service.ts:117-132`), is a pure function that
does not touch Drizzle at all, so the carve-out no longer excuses anything.
The real outlier is the `createRecipe` transaction.

The codebase already demonstrates the preferred pattern in the same module:
`model.forkRecipe` (`model.ts:352-475`) and `model.toggleLike`
(`model.ts:591-625`) each own a full `db.transaction` inside the model layer and
return a typed object. D29 moves `createRecipe`'s transaction into an
analogous model helper, restoring the rule and making `createRecipe` and
`forkRecipe` directly comparable (today they both create a recipe + first
version + relations in a single transaction, but one lives in the service and
one in the model, which makes them hard to compare and easy to drift).

A `TODO(D29)` marker at `service.ts:203-208` already names every import the move
removes and points at `plans/D29-recipe-service-drizzle-orm-import.md`. D29 is
the execution of that marker.

## What Changes

### Move the transaction into a new model helper

- **Add** `createRecipeWithRelations(input)` to
  `apps/api/src/modules/recipe/model.ts`, co-located next to `forkRecipe`
  (which is the closest existing analogue — it owns a full multi-table
  transaction and returns a rich object). The helper accepts a typed
  `CreateRecipeWithRelationsInput` interface (recipe fields + version fields +
  child-relation arrays) and owns the entire `db.transaction` block currently
  inlined at `service.ts:209-291`. The body is moved verbatim — the SQL emitted
  is byte-identical to today.
- **Return the rich `findById` shape.** After the transaction commits, the
  helper calls `findById(r.id)` and returns that, so the returned object
  matches every other read path (`getRecipe`, `updateRecipe`, `forkRecipe`).
  This resolves an internal contradiction in the original plan, which said
  both "return the same shape the inline transaction produces" (a *bare*
  `{ ...r, versions: [version] }` with no nested relations) and "return the
  rich row + relations so the service can drop the post-transaction
  `findById`". The bare shape would be a wire-format regression (clients would
  lose `author`, nested `tasteNotes`/`equipment`/`additionalPreparations`/
  `versionPhotos`/`bean`, `photos`, `forkedFrom`), so the helper returns the
  rich shape and the service drops its own `findById` reload.

### Rewire `service.ts:createRecipe`

- **Replace** the `TODO(D29)` comment + entire `db.transaction(...)` block
  (`service.ts:203-291`) with a single call to
  `model.createRecipeWithRelations({ ...all input... })`.
- **Drop** the now-redundant `const finalRecipe = await model.findById(recipe.id);`
  (`service.ts:293`) — the helper returns the rich shape directly.
- **Keep** all surrounding business logic in the service unchanged:
  equipment-compatibility validation (`service.ts:180`), title sanitization +
  empty-title guard (`service.ts:182-183`), slug generation
  (`service.ts:184`), setup inheritance for `grinder`/`brewerDetails`
  (`service.ts:186-194`), `brewRatio`/`flowRate` computation
  (`service.ts:196-201`), and the post-transaction side effects
  (`service.ts:295-308`: follower notification when `visibility === 'public'`,
  `evaluateBadges` fire-and-forget). Only the transaction block moves.

### Delete the offending imports from `service.ts`

- `import { db } from '@brewform/db';` — line 15
- the six schema-table imports — lines 16-23
- `import { eq } from 'drizzle-orm';` — line 24

`import * as model from './model.ts';` (line 14) and the pure-function imports
(`sanitizeText`, `computeBrewRatio`, `computeFlowRate`, `generateSlug`,
`ensureUniqueSlug`, `decodeCursor`, `notifyFollowersOfNewRecipe`,
`notifyRecipeLiked`, `evaluateBadges`, `createLogger`, the shared schemas)
all stay. After the move, `service.ts` contains zero references to
`drizzle-orm`, `@brewform/db`, or any `@brewform/db/schema` symbol.

### Fix the file-level docstring

Update `service.ts:1-11` to remove the outdated "except for the compatibility
validation helper" sentence. The corrected docstring restates the rule
without the carve-out: "All DB access is delegated to `model.ts` — no Drizzle
calls from this module."

### Fix the OpenAPI documentation gap on `POST /api/v1/recipes`

The `createRecipe` route's `describeRoute` (`index.ts:273-281`) currently
declares only `201: { description: 'Recipe created' }` and
`403: { description: 'Forbidden' }` — no request body, no response schema, no
`401`. This violates AGENTS.md's mandatory-OpenAPI rule ("a route without
`describeRoute()` is incomplete"; responses must be
`resolver(successEnvelope(XOutputSchema))` and `resolver(ErrorEnvelopeSchema)`).
The route passes the coverage test only because `/api/v1/recipes` is absent
from the coverage test's `IN_SCOPE_BASE_PATHS` array — an implicit structural
exemption, not a real compliance. D29 closes the gap by:

- **Adding** `RecipeDetailOutputSchema` to
  `packages/shared/src/schemas/responses/recipe.ts`, derived from the actual
  `findById` return shape (recipe row + `author {id, username, displayName,
  avatarUrl}` + `versions[{...row, tasteNotes[].tasteNote, equipment[].equipment,
  additionalPreparations, versionPhotos[].photo, bean}]` + `photos[]` +
  `forkedFrom`).
- **Adding** a co-located unit test in
  `packages/shared/src/schemas/responses/recipe.test.ts` following the
  existing `wire()` + round-trip convention, and registering the schema in
  the `output-schema-acceptance.pbt.test.ts` `cases` array.
- **Wiring** the `createRecipe` route's `describeRoute` with
  `requestBody: jsonRequestBody(RecipeCreateSchema)`,
  `resolver(successEnvelope(RecipeDetailOutputSchema))` for `201`, and
  `resolver(ErrorEnvelopeSchema)` for `400`, `401`, `403`. `Recipes` is
  already registered in the tag list (`openapi.ts:61`), so no new tag is
  needed.

### Tests

- **Add** `apps/api/src/modules/recipe/model.create.test.ts` — a focused
  model-level integration test for `createRecipeWithRelations` covering: recipe
  row insert with correct slug/title/authorId/visibility; `currentVersionId`
  set to `versions[0].id` after the call; version row inserted with
  `versionNumber: 1` and all passed fields; taste notes inserted (with
  intensity from `tasteNoteIntensities`, default `1`); taste notes absent when
  `tasteNoteIds` omitted/empty; equipment inserted when `equipmentIds`
  provided; additional preparations inserted with `sortOrder` = array index;
  `photoIds` branch (currently dead on the create route — test the helper's
  contract regardless); returned shape matches `findById` (has `author`,
  nested `tasteNotes[].tasteNote`, `equipment[].equipment`,
  `additionalPreparations`, `versionPhotos[].photo`, `bean`).
- **Add** a service-level integration test asserting `service.createRecipe`
  returns the same rich shape before/after the move (regression guard). Use
  the `coffee-variety/model.test.ts` fixture pattern (`beforeEach` inserts
  UUID-keyed user, `afterEach` hard-deletes child-first; `describe` options
  `{ sanitizeOps: false, sanitizeResources: false }`).
- **Add** an HTTP integration test for `POST /api/v1/recipes` in
  `index_test.ts`-style, asserting `201` + success envelope + `data.author` +
  `data.versions[0].tasteNotes` present — the strongest guard against
  wire-shape drift.

### Docblocks

- **Add** a full multi-line JSDoc to `createRecipeWithRelations` matching the
  `forkRecipe` house style (description + transaction note + `@param` per
  field + `@returns` describing the rich shape).
- **Add** a docblock to `CreateRecipeWithRelationsInput` (interface).
- **Optionally** fill the two non-exported helpers in `service.ts` that lack
  docblocks (`generateUniqueSlug` at `:65`, `validateEquipmentCompatibility`
  at `:134`) — not strictly required (they are non-exported) but aligned with
  AGENTS.md's spirit.

## Capabilities

### New Capabilities

- `recipe-write`: Owns the write-path layering rule — the service layer SHALL
  NOT import from `drizzle-orm` or `@brewform/db/schema`, and recipe creation
  with its first version and all child relations SHALL be encapsulated in a
  single `db.transaction` owned by `model.createRecipeWithRelations`, which
  SHALL return the full relational shape (matching `findById`). The capability
  also requires the `POST /api/v1/recipes` route to be fully documented with
  a `RecipeDetailOutputSchema` response.

## Impact

- **API (`apps/api/`)** — primary, all code changes live here.
  - `service.ts`: transaction body removed (lines 203-291), imports pruned
    (lines 15-24), docstring fixed (lines 9-10), `findById` reload dropped
    (line 293). Net line count decreases.
  - `model.ts`: new `CreateRecipeWithRelationsInput` interface +
    `createRecipeWithRelations` function added near `forkRecipe`. No new
    imports — `model.ts` already imports `db`, all six schema tables, `eq`,
    and `sql`.
  - `index.ts`: `createRecipe` route's `describeRoute` gets request body +
    response schemas + error envelopes.
- **Shared package (`packages/shared/`)** — new `RecipeDetailOutputSchema`
  + test registration in `responses/recipe.ts`, `responses/recipe.test.ts`,
  `responses/index.ts` barrel, `output-schema-acceptance.pbt.test.ts`.
- **Web app, DB package** — unaffected. No schema migration (the SQL emitted
  by the moved transaction is byte-identical; the helper reuses the existing
  `recipes`/`recipeVersions`/`recipeTasteNotes`/`recipeEquipment`/
  `recipeAdditionalPreparations`/`recipeVersionPhotos` tables and the existing
  two-step `currentVersionId` update).
- **OpenAPI** — `POST /api/v1/recipes` gains a complete `describeRoute`; the
  generated `/api/v1/openapi.json` and Scalar UI at `/api/v1/docs` become more
  accurate. The coverage test continues to pass (it already passes; the route
  is currently exempt because its base path is out of scope).
- **No breaking changes** — the wire response body for `POST /api/v1/recipes`
  is unchanged (still the `findById` rich shape). The SQL emitted is
  byte-identical (transaction body moved verbatim). Notification and badge
  side effects fire post-commit exactly as today.