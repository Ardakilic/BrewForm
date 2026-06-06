## Context

The recipe domain in `apps/api/src/modules/recipe/` follows the
project's standard 3-layer pattern: `model.ts` (data access) →
`service.ts` (business logic) → `index.ts` (HTTP controller). Two
listing queries currently exist:

- `service.ts:listRecipes()` — owns the public `/api/v1/recipes`
  endpoint. Constructs a visibility-aware base condition (admin sees
  everything, non-admin sees `public`), then appends every shared
  filter inline, then calls `model.findMany(where, page, perPage,
  sortBy, sortOrder)`.
- `model.ts:findStarred()` — owns the `/api/v1/recipes/starred`
  endpoint via `service.listStarredRecipes()`. Constructs a hard-coded
  `eq(recipes.visibility, 'public')` base condition, then appends a
  near-identical copy of the filter block, then composes a
  favourites-scoped query.

The duplication was introduced when `findStarred` was added as a
standalone function rather than being expressed in terms of the
existing listing pipeline. A validated, line-accurate plan exists at
`plans/D12-recipe-filter-logic.md` (June 2026) with nine corrections
applied against `main`. The original plan had this to say:

> The following errors were found during codebase validation and
> corrected above.

This design adopts every correction in the validated plan. The full
proposal–design–spec–task structure lets a fresh-context agent execute
the work without re-reading the two functions.

### Codebase facts (verified)

- `apps/api/src/modules/recipe/model.ts:30–37` exports
  `recipeCoffeeVarietyCondition(coffeeVarietyId: string)`, which
  returns `inArray(recipes.id, db.select({id: recipeVersions.recipeId}).from(recipeVersions).where(eq(recipeVersions.coffeeVarietyId, coffeeVarietyId)))`.
  `listRecipes` delegates to it; `findStarred` does not.
- `apps/api/src/modules/recipe/model.ts:26` imports `and, asc, avg,
  count, desc, eq, ilike, inArray, isNull, or, SQL, sql` from
  `drizzle-orm`. All of these stay (the helper needs every filter
  primitive).
- `apps/api/src/modules/recipe/model.ts:27` imports `BrewMethod` and
  `DrinkType` from `@brewform/shared/types`. The `RecipeFilterCriteria`
  interface reuses these types — no new shared-package additions.
- `apps/api/src/modules/recipe/service.ts:24` imports `and, eq, ilike,
  inArray, or, SQL` from `drizzle-orm`. After the refactor, only `and`,
  `eq`, and the `SQL` type are still used in `service.ts`.
- `apps/api/src/modules/recipe/service.preservation.test.ts` defines a
  minimal `eq`/`and`/`inArray`/`ilike`/`or` mock surface (lines 22–44)
  used to drive property-based tests against a faithful copy of the
  filter logic. The new `model.test.ts` reuses the same pattern.
- Soft deletes (`isNull(recipes.deletedAt)`) are applied inside
  `model.findMany`, not by the caller. `buildRecipeFilters` does NOT
  add a soft-delete condition.

### Stakeholders

- API (`apps/api/`) — affected.
- DB package, web app, shared package — not affected.
- Product — no functional change on the public endpoint; one minor
  parity fix on `/recipes/starred` (deprecated `tasteNoteId` now
  works).

## Goals / Non-Goals

**Goals:**

- Eliminate ~120 lines of duplicate filter-building code across
  `service.ts:listRecipes` and `model.ts:findStarred`.
- Fix the `findStarred` type-safety bug (`any[]` → `SQL[]`) and the
  associated unguarded `or()` push.
- Fix the missing deprecated-`tasteNoteId` branch on `findStarred`
  (parity with `listRecipes` and the public `RecipeFilterSchema`).
- Replace the inline `coffeeVarietyId` subquery in `findStarred` with
  a call to the existing `recipeCoffeeVarietyCondition()` helper.
- Add focused unit tests for the new helper using the project's
  established mock-Drizzle pattern.
- Pass `make check-api` and `make test-api` with zero new errors.

**Non-Goals:**

- No new dependencies.
- No web changes (D11 is the web-side dedup; merged separately).
- No `RecipeFilterSchema` change — the public schema continues to
  accept `tasteNoteId` (deprecated) and `tasteNoteIds`. The deprecation
  warning stays; this PR only fixes parity.
- No new HTTP endpoint, no new query parameter, no new sort field.
- No change to `model.findMany`, `service.listRecipes`'s pagination,
  or `service.listStarredRecipes`'s favourites-scope subquery.
- No removal of the deprecated `tasteNoteId` — that's a separate API
  deprecation cycle.

## Decisions

### Decision 1: Helper lives in `model.ts`, immediately after `recipeCoffeeVarietyCondition`

**Rationale**: `buildRecipeFilters` is a pure data-access concern — it
builds Drizzle SQL fragments from filter scalars and references only
schema tables and Drizzle operators. Placing it next to the existing
`recipeCoffeeVarietyCondition()` (model.ts:30–37) keeps every shared
filter primitive in one cluster at the top of `model.ts`, before the
CRUD functions.

**Alternatives considered**:

- New file `apps/api/src/modules/recipe/filters.ts` — rejected; the
  module pattern is 3-layer (model/service/index), and adding a 4th
  file for a single helper inflates the module surface.
- Place in `service.ts` — rejected; the helper has no business logic
  or authorization and is consumed by another `model.ts` function
  (`findStarred`). Putting it in `service.ts` would force `model.ts`
  to import from `service.ts`, violating the layered import direction.
- Place in `@brewform/shared` — rejected; the helper imports from
  `@brewform/db/schema`, which is not available to the shared package.

### Decision 2: Helper returns `SQL[]`; caller composes via `and()`

**Rationale**: `buildRecipeFilters` returns an array of independent
Drizzle conditions rather than a single composed `and(...)`. This
matches Drizzle's documented composition pattern and lets each caller
prepend its own base conditions before composing:

```ts
// listRecipes
const conditions: SQL[] = [visibilityCondition, ...buildRecipeFilters(filters)];
if (filters.authorId) conditions.push(eq(recipes.authorId, filters.authorId));
const where = conditions.length > 1 ? and(...conditions) : conditions[0];

// findStarred
const conditions: SQL[] = [eq(recipes.visibility, 'public'), ...buildRecipeFilters(filters)];
const where = conditions.length > 1 ? and(...conditions) : conditions[0];
```

The array-return form is also easier to test: assertions can iterate
over the array, count entries, and inspect each in isolation without
unwrapping a Drizzle `and()` wrapper.

**Alternatives considered**:

- Return `SQL | undefined` (pre-composed with `and()`) — rejected;
  forces every caller to write `and(base, filtersComposed)` and loses
  the array-iteration ergonomic in tests.
- Accept the base conditions as a parameter and compose internally —
  rejected; couples the helper to caller-specific concerns
  (visibility, favourites) and defeats the extraction goal.

### Decision 3: `RecipeFilterCriteria` interface includes deprecated `tasteNoteId`

**Rationale**: The public `RecipeFilterSchema` (in
`@brewform/shared/schemas`) still accepts `tasteNoteId?: string` with
a deprecation comment. `listRecipes` honours it via an `else if`
branch; `findStarred` silently drops it. Including the field in
`RecipeFilterCriteria` and the helper's `else if` branch produces
identical behaviour on both endpoints — closing the parity gap is the
whole point of the refactor.

**Exact shape**:

```ts
export interface RecipeFilterCriteria {
  brewMethod?: BrewMethod;
  drinkType?: DrinkType;
  search?: string;
  equipmentId?: string;
  tasteNoteIds?: string;
  /** @deprecated Use `tasteNoteIds` (comma-separated). Kept for backward compatibility. */
  tasteNoteId?: string;
  mainBrewer?: string;
  coffeeVarietyId?: string;
}
```

The types use `BrewMethod` / `DrinkType` (not bare `string`) because
`model.ts:27` already imports them; using the precise types matches
the existing `findStarred` parameter shape and gives the compiler
extra coverage.

**Alternatives considered**:

- Omit `tasteNoteId` and add it as a follow-up — rejected; the
  parity-fix value of this PR depends on `findStarred` picking up the
  branch.
- Type `tasteNoteIds` as `string[]` (already split) — rejected; the
  current `findStarred` and `listRecipes` both receive the raw
  comma-separated string from the schema and split it inline. Keeping
  the split inside the helper preserves the existing call signature.

### Decision 4: `sortBy` and `sortOrder` are NOT in the helper

**Rationale**: Both callers invoke `model.findMany(where, page,
perPage, sortBy, sortOrder)` with different sort defaults
(`listRecipes` defaults to the user-supplied `sortBy` /
`sortOrder`; `findStarred` orders by the favourited-at timestamp).
Sort and pagination are not `WHERE`-clause concerns and belong to the
caller. The helper's contract is "given filter scalars, produce
`SQL[]`" — nothing more.

**Alternatives considered**:

- Add `sort` / `order` to `RecipeFilterCriteria` and have the helper
  return an `{ where, orderBy }` tuple — rejected; explodes the
  helper's surface and forces every caller into the same sort
  vocabulary, which they don't share.

### Decision 5: `or()` null-guard required

**Rationale**: Drizzle's `or()` returns `SQL | undefined`. When the
helper is typed as `SQL[]`, pushing the raw `or(...)` result produces
a TypeScript error. The existing `listRecipes` already null-guards via
`const searchCondition = or(...); if (searchCondition) conditions.push(searchCondition)`.
The same pattern moves into the helper. (The existing `findStarred`
does NOT null-guard because `any[]` masks the issue — the refactor
fixes the masked bug.)

**Alternatives considered**:

- Use a non-null assertion (`conditions.push(or(...)!)`) — rejected;
  hides intent and produces a runtime error if `or()` ever returns
  `undefined`.
- Build the search condition without `or()` (e.g., a single `inArray`
  union) — rejected; changes the generated SQL shape and risks
  altering the query planner's behaviour on production data.

### Decision 6: Import cleanup in `service.ts`

**Rationale**: After the filter block moves to `model.ts`,
`service.ts` no longer uses `ilike`, `inArray`, or `or`. Leaving them
in the import would produce a lint warning under the project's
`no-unused-vars` configuration. The remaining drizzle-orm imports in
`service.ts` are:

```ts
import { and, eq, type SQL } from 'drizzle-orm';
```

`and` is used to compose conditions; `eq` is used for
`eq(recipes.authorId, ...)` and friends; the `SQL` type is used in the
`conditions: SQL[]` declaration.

### Decision 7: Test strategy — focused unit tests + existing PBT untouched

**Rationale**: The project already has a property-based test
(`service.preservation.test.ts`, ~250 lines) that exercises the AND
composition over a faithful copy of the filter block. That test stays
as the regression net for the composition step. The new `model.test.ts`
adds direct coverage of `buildRecipeFilters()` itself:

- One `describe('buildRecipeFilters')` block.
- One `it` per filter branch: `brewMethod`, `drinkType`, `search` (with
  the `%_` sanitization sub-case), `mainBrewer` (same), `equipmentId`,
  `coffeeVarietyId` (asserts delegation to
  `recipeCoffeeVarietyCondition`), `tasteNoteIds` (multi-id),
  `tasteNoteId` (singular, deprecated branch), and an empty-input
  case.
- Mock Drizzle surface (`eq`, `inArray`, `ilike`, `or`, `and`)
  matching the shape used in `service.preservation.test.ts:22–44`.
  Each mock returns a tagged condition object so the test can assert
  the structure without a real database.

This satisfies the AGENTS.md test rule (every new code path covered)
without duplicating the PBT's combinatorial work.

**Alternatives considered**:

- Inline new tests inside `service.test.ts` — rejected; the helper is
  in `model.ts`, so its tests belong in `model.test.ts` by file
  symmetry.
- Reuse `service.preservation.test.ts` mocks directly — done via
  copy of the same minimal mock pattern, not via shared module import
  (the test's mocks live inside the test file by convention).

### Decision 8: Architecture diagram

After the refactor, the call graph is:

```text
                    +--------------------------------+
                    | buildRecipeFilters(filters)    |
                    |  (model.ts, after line 37)     |
                    |  returns SQL[]                 |
                    +----------------+---------------+
                                     |
                +--------------------+--------------------+
                |                                         |
+---------------v---------------+         +---------------v---------------+
| service.ts:listRecipes()      |         | model.ts:findStarred()        |
|                               |         |                               |
|  base: visibility / admin     |         |  base: eq(visibility,'public')|
|  + authorId (if present)      |         |  + favourited-by-user scope   |
|  + buildRecipeFilters(...)    |         |  + buildRecipeFilters(...)    |
|  -> and(...) -> findMany      |         |  -> and(...) -> joined query  |
+-------------------------------+         +-------------------------------+
```

`buildRecipeFilters` knows nothing about visibility, favourites, or
sort order. Both callers prepend their own base conditions and append
the helper's output.

## Risks / Trade-offs

- **[Behavioural drift on `/recipes/starred` from the new `tasteNoteId`
  branch]** → Document in the PR description as an intentional parity
  fix. The schema already accepts the param, so any client sending it
  was already seeing a no-op response; turning it into a filter cannot
  regress a contract that wasn't honoured.
- **[Test mock drift from the real Drizzle surface]** → Mitigation:
  the new `model.test.ts` mocks return tagged objects that mirror the
  shape used by `service.preservation.test.ts`. The PBT continues to
  exercise the full AND composition with the same mock pattern, so
  any drift surfaces in both files together.
- **[`SQL[]` type tightening surfaces a previously masked bug]** →
  Mitigation: the type-safety fix is the goal, not a side effect.
  `make check-api` will catch any remaining unguarded `or()` push.
- **[Inline subquery removal from `findStarred` changes generated
  SQL]** → The new code path goes through
  `recipeCoffeeVarietyCondition()`, which produces the exact same
  `inArray(recipes.id, db.select({id: recipeVersions.recipeId})...)`
  fragment that the inline code produced. Verified by reading both
  forms in the current codebase.

## Migration Plan

This is a pure backend refactor — no data migration, no deploy
sequence, no feature flag. The steps in `tasks.md` are sequenced so
the build is green at every commit:

1. **Add the helper** in `model.ts` (pure addition, no existing code
   changes, build stays green).
2. **Refactor `listRecipes`** in `service.ts` to call the helper.
   `make check-api` and `make test-api` must pass.
3. **Refactor `findStarred`** in `model.ts` to call the helper.
   `make check-api` and `make test-api` must pass.
4. **Drop unused imports** from `service.ts:24`. `make check-api`
   must pass.
5. **Add `model.test.ts`** with the new unit tests. `make test-api`
   must pass.
6. **Final verification** — `make check-api`, `make lint`,
   `make test-api`.

### Rollback

A single `git revert` of the merge commit reverts all changes
atomically. No database state to roll back.

## Open Questions

- **None blocking.** The deprecated `tasteNoteId` parity fix is the
  only intentional behavioural change and is documented in the
  proposal.
