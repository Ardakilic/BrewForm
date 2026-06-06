## Why

`apps/api/src/modules/recipe/service.ts:listRecipes()` (lines 478–601)
and `apps/api/src/modules/recipe/model.ts:findStarred()` (lines 539–681)
each build a near-identical `conditions[]` array with the same eight
filters (`brewMethod`, `drinkType`, `search`, `mainBrewer`,
`coffeeVarietyId`, `equipmentId`, `tasteNoteIds`, plus the deprecated
`tasteNoteId` singular). The duplication has already produced three
defects on the `findStarred` side:

1. **Type-safety bug** — `findStarred` declares `const conditions: any[]`
   (model.ts:555) instead of `SQL[]`. This masks the fact that Drizzle's
   `or()` helper returns `SQL | undefined`, so the `search` branch
   currently pushes a value that could be `undefined` without the
   compiler noticing.
2. **Missing filter** — the deprecated `tasteNoteId` (singular) filter
   is applied in `listRecipes` via an `else if` branch but is silently
   dropped by `findStarred`, even though both endpoints share the
   public `RecipeFilterSchema` that still accepts it.
3. **Inline duplication of `coffeeVarietyId`** — `findStarred` inlines
   the variety subquery (model.ts:614–623) instead of calling the
   existing `recipeCoffeeVarietyCondition()` helper in `model.ts:30–37`
   that `listRecipes` already delegates to.

Extracting the shared filter logic into one helper fixes all three at
once and removes ~120 lines of duplicate code.

## What Changes

- Add `buildRecipeFilters(filters: RecipeFilterCriteria): SQL[]` and the
  `RecipeFilterCriteria` interface to
  `apps/api/src/modules/recipe/model.ts`, placed immediately after
  `recipeCoffeeVarietyCondition()` (line 37). The helper handles every
  shared filter and delegates the `coffeeVarietyId` branch to the
  existing `recipeCoffeeVarietyCondition()` helper.
- Refactor `apps/api/src/modules/recipe/service.ts:listRecipes()` to
  call `model.buildRecipeFilters(filters)` and compose the resulting
  array with its own base conditions (visibility / admin scope /
  `authorId`) via `and()`.
- Refactor `apps/api/src/modules/recipe/model.ts:findStarred()` to call
  `buildRecipeFilters(filters)`, change `conditions` from `any[]` to
  `SQL[]`, drop the inline `coffeeVarietyId` subquery, and pick up the
  deprecated `tasteNoteId` (singular) branch for free.
- Remove the now-unused `ilike`, `inArray`, `or` symbols from the
  `drizzle-orm` import in `apps/api/src/modules/recipe/service.ts:24`.
  Keep `and`, `eq`, and the `SQL` type.
- Add a new test file
  `apps/api/src/modules/recipe/model.test.ts` with focused unit tests
  for `buildRecipeFilters()` covering every filter branch.

No public API, no schema, no response shape, and no behavioural change
on the existing `/api/v1/recipes` endpoint. The `/api/v1/recipes/starred`
endpoint gains support for the deprecated `tasteNoteId` (singular)
filter — a consistency fix, not a behaviour regression.

## Capabilities

### New Capabilities

- `recipe-filter`: a backend, shared filter-building concern owned by
  `apps/api/src/modules/recipe/model.ts`. Establishes that every
  recipe-listing query (the public list endpoint and the starred-recipes
  endpoint, plus any future listing query) constructs its Drizzle
  `WHERE` clause from one helper that handles the eight shared filter
  keys, returns a typed `SQL[]`, delegates `coffeeVarietyId` to the
  existing helper, supports the deprecated `tasteNoteId` singular for
  backward compatibility, and leaves visibility / favourite-scope
  conditions to the caller.

## Impact

- **Files added** (1 new file):
  - `apps/api/src/modules/recipe/model.test.ts` — unit tests for
    `buildRecipeFilters()` using a mock Drizzle surface (same pattern
    as `apps/api/src/modules/recipe/service.preservation.test.ts`).
- **Files refactored**:
  - `apps/api/src/modules/recipe/model.ts` — adds the
    `RecipeFilterCriteria` interface and `buildRecipeFilters()` helper
    (~95 new lines); rewrites `findStarred()` (lines 539–681) to call
    the helper (~120 lines deleted, ~5 added); changes the
    `conditions: any[]` declaration to `SQL[]`.
  - `apps/api/src/modules/recipe/service.ts` — replaces the inline
    filter block in `listRecipes()` (lines 478–601) with a call to
    `model.buildRecipeFilters(filters)` (~120 lines deleted, ~5
    added); drops `ilike`, `inArray`, `or` from the `drizzle-orm`
    import line (line 24).
- **Files unchanged**: `apps/api/src/modules/recipe/index.ts`
  (controller), `packages/shared/src/schemas/*` (`RecipeFilterSchema`
  unchanged — still accepts deprecated `tasteNoteId`), all existing
  test files (`service.test.ts`, `service.preservation.test.ts`,
  `service.exploration.test.ts`, `recipe.compatibility.test.ts`).
- **Behavioural changes**:
  - `/api/v1/recipes/starred?tasteNoteId=<uuid>` now applies the
    deprecated singular filter (previously silently ignored on this
    endpoint only). This matches the public schema contract and
    `/api/v1/recipes` behaviour.
- **No API, no schema, no migration, no new dependency, no OpenAPI
  spec change.**
- **Test environment**: Deno test runner with `jsr:@std/testing/bdd`
  + `jsr:@std/expect`. The new `model.test.ts` runs under
  `make test-api` with no infrastructure changes.
