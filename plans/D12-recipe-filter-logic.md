# D12 — Recipe Filter Logic Duplication (Backend)

> **Status (2026-07-04): ✅ Done** — `model.ts:89` `buildRecipeFilters(): SQL[]` is shared by `listRecipesFiltered` (:219) and `findStarred` (:1040).

## Severity

**High**

## Issue Description

The recipe filter logic is duplicated between two backend functions:

- `service.ts:listRecipes()` (~123 lines, lines 478-601) — filters for the main recipe list
- `model.ts:findStarred()` (~143 lines, lines 539-681) — filters for starred/favourited recipes

Both functions build nearly identical `conditions[]` arrays with the same filter logic for:
- `brewMethod` — subquery on `recipeVersions.brewMethod`
- `drinkType` — subquery on `recipeVersions.drinkType`
- `search` — `ilike` on `recipes.title` + subquery on `recipeVersions.productName`
- `mainBrewer` — subquery on `recipeVersions.brewerDetails`
- `coffeeVarietyId` — subquery on `recipeVersions.coffeeVarietyId`
- `equipmentId` — subquery on `recipeEquipment.recipeVersionId`
- `tasteNoteIds` — loop of subqueries on `recipeTasteNotes.recipeVersionId` (AND logic)

## Impact

- **DRY violation**: Any filter change (e.g., adding a new filter, fixing a bug in search sanitization) must be updated in two locations
- **Inconsistency risk**: `findStarred` is missing the `tasteNoteId` backward-compatibility single-note filter that `listRecipes` has (the schema `RecipeFilterSchema` includes `tasteNoteId?: string` with a deprecation comment; only `listRecipes` applies it via an `else if` branch)
- **Type-safety bug**: `findStarred` uses `const conditions: any[]` (line 555 of `model.ts`) whereas `listRecipes` correctly uses `const conditions: SQL[]` — the `any[]` masks a Drizzle type error caused by `or()` returning `SQL | undefined` and prevents TypeScript from catching invalid conditions
- **Secondary DRY violation**: `findStarred` inlines the `coffeeVarietyId` subquery (lines 614–623 of `model.ts`) rather than calling the `recipeCoffeeVarietyCondition()` helper that already exists in `model.ts` for this purpose; `listRecipes` in `service.ts` correctly delegates to that helper
- **Maintenance burden**: Understanding the full filter surface requires reading both functions

## Root Cause

`findStarred()` was written as a standalone function duplicating the filter-building logic from `listRecipes()` instead of reusing it. The `any[]` type annotation conceals the resulting inconsistencies from the TypeScript compiler.

## Affected Files

| File | Lines | Function |
|------|-------|----------|
| `apps/api/src/modules/recipe/model.ts` | 539–681 | `findStarred()` |
| `apps/api/src/modules/recipe/service.ts` | 478–601 | `listRecipes()` |

### Filter Comparison

| Filter | `listRecipes` | `findStarred` |
|--------|--------------|---------------|
| `brewMethod` | `inArray(recipes.id, subquery on recipeVersions)` | Same pattern |
| `drinkType` | `inArray(recipes.id, subquery on recipeVersions)` | Same pattern |
| `search` | `ilike` on title + productName subquery; `or()` result assigned to variable then null-guarded before push | Same pattern but **no null guard** (masked by `any[]`) |
| `mainBrewer` | subquery on `brewerDetails` | Same pattern |
| `coffeeVarietyId` | delegates to `model.recipeCoffeeVarietyCondition()` | **Inlines duplicate logic** instead of calling `recipeCoffeeVarietyCondition()` |
| `equipmentId` | `inArray(recipes.currentVersionId, subquery)` | Same pattern |
| `tasteNoteIds` | AND loop | AND loop |
| `tasteNoteId` (singular, deprecated) | **Present** — `else if` backward-compat branch | **Missing** — not in filter type, not applied |
| `authorId` | `eq(recipes.authorId)` | _(not applicable)_ |
| `visibility` | admin-aware visibility check | hardcoded `public` |
| Base condition | `eq(recipes.visibility, 'public')` or admin filter | `eq(recipes.visibility, 'public')` |
| `conditions` type | `SQL[]` (correct) | `any[]` **(type-safety bug)** |

## Fix Approach

Extract a shared `buildRecipeFilters()` helper function.

### Technical Approach

1. Create a `buildRecipeFilters()` function in `model.ts` that accepts filter criteria and returns a `SQL[]` array of Drizzle conditions
2. Both `listRecipes` and `findStarred` call this helper with their specific base conditions
3. The helper handles all shared filter logic (brewMethod, drinkType, search, mainBrewer, coffeeVarietyId, equipmentId, tasteNoteIds, tasteNoteId backward compat)
4. `listRecipes` adds its own conditions (authorId, admin visibility) on top
5. `findStarred` adds its own condition (favourited by user) on top

### Proposed Signature

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
      // or() returns SQL | undefined; null-guard required when conditions: SQL[]
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
    // Re-use the existing exported helper — eliminates the duplicate inline logic
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
    // Backward compatibility: single taste note (deprecated — use tasteNoteIds)
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

### Refactored Usage

```ts
// service.ts:listRecipes()
const filterConditions = model.buildRecipeFilters(filters);
const conditions: SQL[] = [visibilityCondition, ...filterConditions];
if (filters.authorId) conditions.push(eq(recipes.authorId, filters.authorId));
const where = conditions.length > 1 ? and(...conditions) : conditions[0];

// model.ts:findStarred()
const filterConditions = buildRecipeFilters(filters);
const conditions: SQL[] = [eq(recipes.visibility, 'public'), ...filterConditions];
const where = conditions.length > 1 ? and(...conditions) : conditions[0];
```

### Collateral Import Cleanup in `service.ts`

After the refactor, the following `drizzle-orm` imports are no longer used anywhere in `service.ts` (they were only consumed by `listRecipes` filter building, which moves entirely to `model.ts`):

```ts
// Remove these from the drizzle-orm import line in service.ts:
ilike, inArray, or
```

`and`, `eq`, and `type SQL` remain required in `service.ts` (`and`/`eq` for the remaining condition assembly and `type SQL` for the `conditions: SQL[]` array). The schema imports `recipeEquipment`, `recipeTasteNotes`, and `recipeVersions` also remain because they are used in transaction inserts inside `createRecipe` and `updateRecipe`.

## Implementation Steps

1. Read `model.ts:findStarred()` (lines 539–681) and `service.ts:listRecipes()` (lines 478–601) and confirm the filter blocks are as documented above
2. Identify the exact filter logic that is identical between both functions
3. Create `buildRecipeFilters()` and `RecipeFilterCriteria` in `model.ts` immediately after `recipeCoffeeVarietyCondition()` (around line 37), using the full signature above (including `tasteNoteId` backward-compat branch and null guard on `or()`)
4. Refactor `listRecipes()` in `service.ts` to call `model.buildRecipeFilters(filters)` and remove the inlined filter blocks
5. Remove the now-unused `ilike`, `inArray`, `or` from the `drizzle-orm` import line in `service.ts`
6. Refactor `findStarred()` in `model.ts` to call `buildRecipeFilters(filters)`, change `conditions` from `any[]` to `SQL[]`, and remove the inlined filter blocks
7. Verify both endpoints return correct results with the same filter combinations
8. Run `make check-api`

## Testing Strategy

- Test `GET /api/v1/recipes` with each filter type (brewMethod, drinkType, search, equipmentId, tasteNoteIds, mainBrewer, coffeeVarietyId)
- Test `GET /api/v1/recipes/starred` with the same filter combinations
- Verify both endpoints return identical filter behavior
- Test multi-filter combinations (AND logic)
- Test search with special characters (`%`, `_` are sanitized)
- Test empty filter values (should be ignored)
- Test deprecated `tasteNoteId` (singular) on both endpoints — should now behave identically

## Risk Assessment

- **Low**: Extractive refactoring — no behavioral changes to existing filters
- **Low**: Both functions already use the same filter patterns
- **Low**: Fixing `conditions: any[]` → `SQL[]` in `findStarred` surfaces no new bugs (the logic was already correct)
- **Medium**: Must ensure `findStarred`'s favourite subquery is added after the shared filters, not mixed in
- **Low**: The `tasteNoteId` backward-compat addition to `findStarred` is consistent with `listRecipes`; it only adds coverage that was missing, not changes existing behavior

## Dependencies

- None (standalone backend refactor)

---

## Validation Notes (corrected from original plan)

The following errors were found during codebase validation and corrected above:

| # | Original plan | Correction |
|---|---------------|------------|
| 1 | `model.ts:findStarred()` lines 534–676 | Actual lines are **539–681** |
| 2 | `service.ts:listRecipes()` lines 470–588 | Actual lines are **478–601** |
| 3 | Impact section omitted type-safety bug | Added: `findStarred` uses `const conditions: any[]` (model.ts line 555) vs `SQL[]` in `listRecipes`; this masks the `or()` return type error and is fixed by the refactor |
| 4 | `RecipeFilterCriteria` missing `tasteNoteId` | Added `tasteNoteId?: string` — without it the plan identified the backward-compat gap but left it unfixed in the helper interface |
| 5 | `RecipeFilterCriteria` used `brewMethod?: string` and `drinkType?: string` | Changed to `brewMethod?: BrewMethod` and `drinkType?: DrinkType` — model.ts already imports these types from `@brewform/shared/types` |
| 6 | Code sketch pushed `or()` result directly: `conditions.push(or(...))` | Added the null guard (`const searchCondition = or(...); if (searchCondition) ...`) — `or()` returns `SQL \| undefined`; without it `buildRecipeFilters` would have a TypeScript error when typed as `SQL[]` |
| 7 | `coffeeVarietyId` inconsistency noted in table but not explained | Added as an explicit finding: `findStarred` inlines duplicate logic instead of calling `recipeCoffeeVarietyCondition()`; `buildRecipeFilters` should call the helper |
| 8 | Implementation steps referenced stale line numbers | Updated to 539–681 / 478–601 |
| 9 | No mention of import cleanup | Added: after refactor, `ilike`, `inArray`, `or` can be removed from `service.ts` drizzle-orm imports |