## 1. Add `buildRecipeFilters()` and `RecipeFilterCriteria` to `model.ts`

- [x] 1.1 Open `apps/api/src/modules/recipe/model.ts` and confirm the
  current state matches expectations: line 26 imports
  `and, asc, avg, count, desc, eq, ilike, inArray, isNull, or, SQL, sql`
  from `drizzle-orm`, line 27 imports `BrewMethod, DrinkType` from
  `@brewform/shared/types`, and lines 30–37 export
  `recipeCoffeeVarietyCondition`.

- [x] 1.2 Insert the following block in
  `apps/api/src/modules/recipe/model.ts` immediately after the closing
  `}` of `recipeCoffeeVarietyCondition` (currently line 37). The block
  ADDS the `RecipeFilterCriteria` interface and `buildRecipeFilters`
  function — no existing line is modified by this task:

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

  /**
   * Build an array of Drizzle SQL conditions from shared recipe filter criteria.
   * Returns a `SQL[]` array; the caller combines these with its own base conditions via `and()`.
   */
  export function buildRecipeFilters(filters: RecipeFilterCriteria): SQL[] {
    const conditions: SQL[] = [];

    if (filters.brewMethod) {
      conditions.push(
        inArray(
          recipes.id,
          db.select({ id: recipeVersions.recipeId })
            .from(recipeVersions)
            .where(eq(recipeVersions.brewMethod, filters.brewMethod)),
        ),
      );
    }

    if (filters.drinkType) {
      conditions.push(
        inArray(
          recipes.id,
          db.select({ id: recipeVersions.recipeId })
            .from(recipeVersions)
            .where(eq(recipeVersions.drinkType, filters.drinkType)),
        ),
      );
    }

    if (filters.search) {
      const sanitized = filters.search.replace(/[%_]/g, '');
      if (sanitized) {
        const searchTerm = `%${sanitized}%`;
        const searchCondition = or(
          ilike(recipes.title, searchTerm),
          inArray(
            recipes.id,
            db.select({ id: recipeVersions.recipeId })
              .from(recipeVersions)
              .where(ilike(recipeVersions.productName, searchTerm)),
          ),
        );
        if (searchCondition) conditions.push(searchCondition);
      }
    }

    if (filters.mainBrewer) {
      const sanitized = filters.mainBrewer.replace(/[%_]/g, '');
      if (sanitized) {
        const searchTerm = `%${sanitized}%`;
        conditions.push(
          inArray(
            recipes.id,
            db.select({ id: recipeVersions.recipeId })
              .from(recipeVersions)
              .where(ilike(recipeVersions.brewerDetails, searchTerm)),
          ),
        );
      }
    }

    if (filters.coffeeVarietyId) {
      conditions.push(recipeCoffeeVarietyCondition(filters.coffeeVarietyId));
    }

    if (filters.equipmentId) {
      conditions.push(
        inArray(
          recipes.currentVersionId,
          db.select({ id: recipeEquipment.recipeVersionId })
            .from(recipeEquipment)
            .where(eq(recipeEquipment.equipmentId, filters.equipmentId)),
        ),
      );
    }

    if (filters.tasteNoteIds) {
      const ids = filters.tasteNoteIds.split(',').map((id) => id.trim());
      for (const noteId of ids) {
        conditions.push(
          inArray(
            recipes.currentVersionId,
            db.select({ id: recipeTasteNotes.recipeVersionId })
              .from(recipeTasteNotes)
              .where(eq(recipeTasteNotes.tasteNoteId, noteId)),
          ),
        );
      }
    } else if (filters.tasteNoteId) {
      conditions.push(
        inArray(
          recipes.currentVersionId,
          db.select({ id: recipeTasteNotes.recipeVersionId })
            .from(recipeTasteNotes)
            .where(eq(recipeTasteNotes.tasteNoteId, filters.tasteNoteId)),
        ),
      );
    }

    return conditions;
  }
  ```

- [x] 1.3 Run `make check-api` — must pass with zero new errors. The
  helper is unused at this point; the type-checker only validates that
  the body compiles.

## 2. Refactor `listRecipes()` in `service.ts` to call the helper

- [x] 2.1 Open `apps/api/src/modules/recipe/service.ts` and locate
  `listRecipes()` (lines 478–601). Identify the inline filter block
  (every `if (filters.X)` that pushes into the `conditions` array).

- [x] 2.2 Replace the inline filter block with a call to
  `model.buildRecipeFilters(filters)`. The refactored composition
  inside `listRecipes` should read like this (keep the existing
  visibility/admin computation verbatim — only the filter block
  changes):

  ```ts
  const filterConditions = model.buildRecipeFilters(filters);
  const conditions: SQL[] = [visibilityCondition, ...filterConditions];
  if (filters.authorId) conditions.push(eq(recipes.authorId, filters.authorId));
  const where = conditions.length > 1 ? and(...conditions) : conditions[0];
  ```

  Notes:
  - `visibilityCondition` is the existing variable that holds the
    admin-aware visibility check; do not rename it.
  - Leave the `model.findMany(where, page, perPage, sortBy, sortOrder)`
    call site untouched.
  - The `authorId` branch stays in `listRecipes` because it is not part
    of the shared filter surface (only the list endpoint accepts it).

- [x] 2.3 Run `make check-api` — must pass. If any drizzle-orm symbol
  reports as unused, that is expected and will be cleaned up in task 4.

- [x] 2.4 Run `make test-api` — `service.test.ts`,
  `service.preservation.test.ts`, `service.exploration.test.ts`, and
  `recipe.compatibility.test.ts` must all pass with zero regressions.

## 3. Refactor `findStarred()` in `model.ts` to call the helper

- [x] 3.1 Open `apps/api/src/modules/recipe/model.ts` and locate
  `findStarred()` (lines 539–681). Identify the inline filter block
  and the `const conditions: any[]` declaration (line 555).

- [x] 3.2 Replace the inline filter block and the `any[]` declaration
  with a call to `buildRecipeFilters(filters)`. The refactored
  composition inside `findStarred` should read like this (preserve the
  hardcoded `eq(recipes.visibility, 'public')` base condition and the
  favourites-scope subquery exactly as they are today):

  ```ts
  const filterConditions = buildRecipeFilters(filters);
  const conditions: SQL[] = [eq(recipes.visibility, 'public'), ...filterConditions];
  const where = conditions.length > 1 ? and(...conditions) : conditions[0];
  ```

  Notes:
  - Change `const conditions: any[]` to `const conditions: SQL[]` —
    this is the type-safety fix.
  - Remove the inline `coffeeVarietyId` subquery (lines ~614–623); the
    helper delegates to `recipeCoffeeVarietyCondition()`.
  - Remove the inline taste-note `for` loop; the helper handles it.
  - The deprecated `tasteNoteId` branch is now applied for the first
    time on this endpoint — this is the intended parity fix.
  - Do NOT touch the favourites-scope subquery or the JOIN with
    `userRecipeFavourites` — those are caller-specific and stay in
    `findStarred`.

- [x] 3.3 Run `make check-api` — must pass with zero new errors. The
  `SQL[]` type now catches any unguarded `or()` push that was masked
  by `any[]`; the helper's null guard (task 1.2) covers this.

- [x] 3.4 Run `make test-api` — all existing tests must continue to
  pass.

## 4. Drop unused `drizzle-orm` imports from `service.ts`

- [x] 4.1 Open `apps/api/src/modules/recipe/service.ts` and locate the
  `drizzle-orm` import line at line 24:

  ```ts
  import { and, eq, ilike, inArray, or, SQL } from 'drizzle-orm';
  ```

  Replace with:

  ```ts
  import { and, eq, type SQL } from 'drizzle-orm';
  ```

  Notes:
  - `ilike`, `inArray`, `or` are now used only inside
    `buildRecipeFilters` (in `model.ts`), not in `service.ts`.
  - `and` and `eq` remain — `and` composes the conditions array,
    `eq` is used for `eq(recipes.authorId, ...)` and similar
    non-filter scopes.
  - `SQL` is a type-only re-export; switch to `type SQL` to make the
    intent explicit and satisfy `verbatimModuleSyntax` if enabled.

- [x] 4.2 Run `make check-api` — must pass. If `ilike`, `inArray`, or
  `or` is reported as missing, search `service.ts` for the offending
  reference and confirm it was meant to be deleted in task 2.

- [x] 4.3 Run `make lint` — zero warnings on the affected files.

## 5. Add `model.test.ts` with `buildRecipeFilters` unit tests

- [x] 5.1 Create
  `apps/api/src/modules/recipe/model.test.ts` with the standard test
  file header (matching `service.preservation.test.ts:1–15`):

  ```ts
  // deno-lint-ignore-file no-explicit-any require-await

  /**
   * Unit tests for buildRecipeFilters() — the shared filter-building helper.
   *
   * These tests use a minimal mock Drizzle surface (eq, inArray, ilike, or)
   * matching the pattern in service.preservation.test.ts, so no real DB is
   * required. The tests verify the shape of the SQL[] returned for each
   * filter branch.
   */

  import { describe, it } from 'jsr:@std/testing/bdd';
  import { expect } from 'jsr:@std/expect';
  ```

- [x] 5.2 Inside `model.test.ts`, define the mock Drizzle surface
  (mirrors `service.preservation.test.ts:22–44`):

  ```ts
  type MockCondition = { type: string; column?: string; value?: unknown; conditions?: MockCondition[] };
  // (define mock eq / inArray / ilike / or / and that return tagged objects;
  //  same shape as the existing preservation test)
  ```

  Then add the test suite:

  ```ts
  describe('buildRecipeFilters', () => {
    it('returns an empty array when no filters are set', () => { /* ... */ });
    it('generates a brewMethod condition', () => { /* ... */ });
    it('generates a drinkType condition', () => { /* ... */ });
    it('generates a sanitized search condition with or()', () => { /* ... */ });
    it('skips search when sanitized input is empty', () => { /* ... */ });
    it('generates a sanitized mainBrewer condition', () => { /* ... */ });
    it('skips mainBrewer when sanitized input is empty', () => { /* ... */ });
    it('generates an equipmentId condition', () => { /* ... */ });
    it('delegates coffeeVarietyId to recipeCoffeeVarietyCondition', () => { /* ... */ });
    it('generates one condition per id for tasteNoteIds (multi)', () => { /* ... */ });
    it('generates a single tasteNoteId condition (deprecated, singular)', () => { /* ... */ });
    it('prefers tasteNoteIds over tasteNoteId when both are set', () => { /* ... */ });
  });
  ```

  Each `it` block constructs a `RecipeFilterCriteria` object, calls
  `buildRecipeFilters(filters)`, and asserts the returned array's
  length and the tagged shape of each entry. The `coffeeVarietyId`
  test imports `recipeCoffeeVarietyCondition` from `./model.ts` and
  asserts the helper's output matches a direct call to
  `recipeCoffeeVarietyCondition('some-uuid')`.

- [x] 5.3 Run
  `make test-specific filter=apps/api/src/modules/recipe/model.test.ts`
  — all new tests must pass.

## 6. Final verification

- [x] 6.1 Run `make check-api` — zero type errors.
- [x] 6.2 Run `make lint` — zero warnings on
  `apps/api/src/modules/recipe/model.ts`,
  `apps/api/src/modules/recipe/service.ts`, and
  `apps/api/src/modules/recipe/model.test.ts`.
- [x] 6.3 Run `make test-api` — every test in
  `apps/api/src/modules/recipe/*.test.ts` passes (existing PBT
  preservation tests + new `model.test.ts`).
- [x] 6.4 Confirm `apps/api/src/modules/recipe/service.ts:24` reads
  `import { and, eq, type SQL } from 'drizzle-orm';` and no other
  drizzle-orm symbols are imported there.
- [x] 6.5 Confirm `apps/api/src/modules/recipe/model.ts:findStarred`
  declares `const conditions: SQL[]` (not `any[]`) and contains no
  inline filter `if` blocks.
- [x] 6.6 Confirm `apps/api/src/modules/recipe/service.ts:listRecipes`
  contains a single `model.buildRecipeFilters(filters)` call and no
  inline filter `if` blocks.

## 7. Bonus: fix misleading test description in `RecipeListPage.test.tsx`

- [x] 7.1 Open
  `apps/web/src/pages/recipes/RecipeListPage.test.tsx` and locate
  line 504. The test description reads
  `'shows active taste note filter badge when tasteNoteId is in URL'`
  but the body uses `tasteNoteIds` (plural). Rename the description to
  `'shows active taste note filter badge when tasteNoteIds is in URL'`
  (one-word change: `tasteNoteId` → `tasteNoteIds`). No code in the
  test body changes.

- [x] 7.2 Run
  `make test-specific filter=apps/web/src/pages/recipes/RecipeListPage.test.tsx`
  — must pass.

- [x] 7.3 Run `make check-web` — must pass.

## 8. Cross-reference: deprecation cycle is planned in D28

- [x] 8.1 No code change. D12 explicitly defers the formal deprecation
  of the singular `tasteNoteId` query parameter to D28 (see
  `openspec/changes/d28-remove-deprecated-taste-note-id/` and
  `plans/D28-remove-deprecated-taste-note-id.md`). D12 closes the
  parity gap on the filter; D28 plans the `Deprecation` HTTP header,
  the `warn` log line, and the eventual field removal. The two
  changes are independent and can ship in either order, but D12
  should land first so the parity fix is in production before the
  deprecation noise begins.
