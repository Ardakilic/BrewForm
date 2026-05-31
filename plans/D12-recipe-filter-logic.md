# D12 — Recipe Filter Logic Duplication (Backend)

## Severity

**High**

## Issue Description

The recipe filter logic is duplicated between two backend functions:

- `service.ts:listRecipes()` (~120 lines, lines 470-588) — filters for the main recipe list
- `model.ts:findStarred()` (~100 lines, lines 534-676) — filters for starred/favourited recipes

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
- **Inconsistency risk**: `findStarred` is missing the `tasteNoteId` backward-compatibility single-note filter that `listRecipes` has
- **Maintenance burden**: Understanding the full filter surface requires reading both functions

## Root Cause

`findStarred()` was written as a standalone function duplicating the filter building logic from `listRecipes()` instead of reusing it.

## Affected Files

| File | Lines | Function |
|------|-------|----------|
| `apps/api/src/modules/recipe/model.ts` | 534-676 | `findStarred()` |
| `apps/api/src/modules/recipe/service.ts` | 470-588 | `listRecipes()` |

### Filter Comparison

| Filter | `listRecipes` | `findStarred` |
|--------|--------------|---------------|
| `brewMethod` | `inArray(recipes.id, subquery on recipeVersions)` | Same pattern |
| `drinkType` | `inArray(recipes.id, subquery on recipeVersions)` | Same pattern |
| `search` | `ilike` on title + productName subquery | Same pattern |
| `mainBrewer` | subquery on brewerDetails | Same pattern |
| `coffeeVarietyId` | `model.recipeCoffeeVarietyCondition()` | Inline subquery (same logic) |
| `equipmentId` | `inArray(recipes.currentVersionId, subquery)` | Same pattern |
| `tasteNoteIds` | AND loop + single note backward compat | AND loop only |
| `authorId` | `eq(recipes.authorId)` | _(not applicable)_ |
| `visibility` | admin-aware visibility check | hardcoded `public` |
| Base condition | `eq(recipes.visibility, 'public')` or admin filter | `eq(recipes.visibility, 'public')` |

## Fix Approach

Extract a shared `buildRecipeFilters()` helper function.

### Technical Approach

1. Create a `buildRecipeFilters()` function in `model.ts` that accepts filter criteria and returns a Drizzle `SQL` WHERE clause
2. Both `listRecipes` and `findStarred` call this helper with their specific base conditions
3. The helper handles all shared filter logic (brewMethod, drinkType, search, mainBrewer, coffeeVarietyId, equipmentId, tasteNoteIds)
4. `listRecipes` adds its own conditions (authorId, admin visibility) on top
5. `findStarred` adds its own condition (favourited by user) on top

### Proposed Signature

```ts
interface RecipeFilterCriteria {
  brewMethod?: string;
  drinkType?: string;
  search?: string;
  equipmentId?: string;
  tasteNoteIds?: string;
  mainBrewer?: string;
  coffeeVarietyId?: string;
}

/**
 * Build a Drizzle SQL WHERE clause from shared recipe filter criteria.
 * Returns an array of conditions (caller combines with base conditions via `and()`).
 */
export function buildRecipeFilters(filters: RecipeFilterCriteria): SQL[] {
  const conditions: SQL[] = [];

  if (filters.brewMethod) {
    conditions.push(
      inArray(recipes.id, db.select({ id: recipeVersions.recipeId })
        .from(recipeVersions)
        .where(eq(recipeVersions.brewMethod, filters.brewMethod)))
    );
  }

  if (filters.drinkType) {
    conditions.push(
      inArray(recipes.id, db.select({ id: recipeVersions.recipeId })
        .from(recipeVersions)
        .where(eq(recipeVersions.drinkType, filters.drinkType)))
    );
  }

  if (filters.search) {
    const sanitized = filters.search.replace(/[%_]/g, '');
    if (sanitized) {
      const searchTerm = `%${sanitized}%`;
      conditions.push(
        or(
          ilike(recipes.title, searchTerm),
          inArray(recipes.id, db.select({ id: recipeVersions.recipeId })
            .from(recipeVersions)
            .where(ilike(recipeVersions.productName, searchTerm)))
        )
      );
    }
  }

  // ... etc for all shared filters

  return conditions;
}
```

### Refactored Usage

```ts
// service.ts:listRecipes()
const filterConditions = model.buildRecipeFilters(filters);
const conditions = [visibilityCondition, ...filterConditions];
if (filters.authorId) conditions.push(eq(recipes.authorId, filters.authorId));

// model.ts:findStarred()
const filterConditions = buildRecipeFilters(filters);
const conditions = [eq(recipes.visibility, 'public'), ...filterConditions];
```

## Implementation Steps

1. Read `model.ts:findStarred()` (lines 534-676) and `service.ts:listRecipes()` (lines 470-588)
2. Identify the exact filter logic that is identical between both functions
3. Create `buildRecipeFilters()` helper in `model.ts`
4. Refactor `listRecipes()` in `service.ts` to use `buildRecipeFilters()`
5. Refactor `findStarred()` in `model.ts` to use `buildRecipeFilters()`
6. Verify both endpoints return correct results with the same filter combinations
7. Run `make check-api`

## Testing Strategy

- Test `GET /api/v1/recipes` with each filter type (brewMethod, drinkType, search, equipmentId, tasteNoteIds, mainBrewer, coffeeVarietyId)
- Test `GET /api/v1/recipes/starred` with the same filter combinations
- Verify both endpoints return identical filter behavior
- Test multi-filter combinations (AND logic)
- Test search with special characters (`%`, `_` are sanitized)
- Test empty filter values (should be ignored)

## Risk Assessment

- **Low**: Extractive refactoring — no behavioral changes
- **Low**: Both functions already use the same filter patterns
- **Medium**: Must ensure `findStarred`'s favourite subquery is added after the shared filters, not mixed in

## Dependencies

- None (standalone backend refactor)
