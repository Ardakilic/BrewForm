# D11 — Recipe List Code Deduplication (~90%)

## Severity

**High**

## Issue Description

`RecipeListPage.tsx` (693 lines) and `StarredRecipesPage.tsx` (540 lines) share approximately 90% of their code. The shared code includes:

- Sub-components: `FilterField`, `ActiveFilterBadge`, `RecipeCard`
- Filter logic: `updateFilter()`, `equipmentByType` computation, `hasActiveFilters`
- Equipment/taste notes data fetching with module-level cache
- URL search param parsing
- Pagination controls
- Sidebar layout and mobile toggle
- `EQUIPMENT_TYPE_LABELS` and `EQUIPMENT_FILTER_TYPES` constants (but with **inconsistent values**)

## Impact

- **Maintenance burden**: Any change to filter UI, recipe card layout, or pagination must be duplicated across two files
- **Inconsistent filter options**: `EQUIPMENT_TYPE_LABELS` differs between pages — RecipeListPage has 17 equipment types (espresso_machine, grinder, pour_over_brewer, immersion_brewer, kettle, milk_tool, scale_accessory, roaster, portafilter, basket, puck_screen, paper_filter, tamper, mesh_filter, cezve, thermometer, other) while StarredRecipesPage has only 11 (portafilter, basket, tamper, puck_screen, scale, gooseneck_kettle, paper_filter, mesh_filter, cezve, thermometer, other) with different naming (e.g., `gooseneck_kettle` vs `kettle`, `scale` vs `scale_accessory`)
- **Bug surface**: Fixing a filter bug in one page can be forgotten in the other

## Root Cause

`StarredRecipesPage` was copy-pasted from `RecipeListPage` with minimal extraction of shared logic.

## Affected Files

| File | Lines | Description |
|------|-------|-------------|
| `apps/web/src/pages/recipes/RecipeListPage.tsx` | 1-693 | Full page with all sub-components |
| `apps/web/src/pages/recipes/StarredRecipesPage.tsx` | 1-540 | Copy-pasted page |

### Equipment Type Inconsistency

| RecipeListPage | StarredRecipesPage |
|----------------|-------------------|
| `espresso_machine` | _(missing)_ |
| `grinder` | _(missing)_ |
| `pour_over_brewer` | _(missing)_ |
| `immersion_brewer` | _(missing)_ |
| `kettle` | `gooseneck_kettle` |
| `milk_tool` | _(missing)_ |
| `scale_accessory` | `scale` |
| `roaster` | _(missing)_ |
| `portafilter` | `portafilter` |
| `basket` | `basket` |
| `puck_screen` | `puck_screen` |
| `paper_filter` | `paper_filter` |
| `tamper` | `tamper` |
| `mesh_filter` | `mesh_filter` |
| `cezve` | `cezve` |
| `thermometer` | `thermometer` |
| `other` | `other` |

## Fix Approach

Extract shared components and hooks into a `recipe-list` module.

### Technical Approach

1. Create `apps/web/src/components/recipe-list/` directory
2. Extract shared sub-components:
   - `FilterField` — label + children wrapper
   - `ActiveFilterBadge` — filter badge with remove button
   - `RecipeCard` — recipe card with author, brew method, stats
   - `PaginationControls` — page navigation buttons
3. Extract shared hooks:
   - `useRecipeFilters()` — manages URL search params (page, brewMethod, drinkType, search, equipmentId, mainBrewer, tasteNoteIds, sortBy)
4. Extract shared constants into a single source of truth:
   - `EQUIPMENT_TYPE_LABELS` — canonical list matching DB equipment types
   - `EQUIPMENT_FILTER_TYPES` — ordered list of types to show as dropdowns
5. Create a unified `RecipeListView` component with a `source: 'all' | 'starred'` prop
6. Refactor both pages to thin wrappers around `RecipeListView`

### Proposed Directory Structure

```
apps/web/src/components/recipe-list/
├── index.ts                 # re-exports
├── FilterField.tsx          # label + children wrapper
├── ActiveFilterBadge.tsx    # removable filter badge
├── RecipeCard.tsx           # recipe card component
├── PaginationControls.tsx   # prev/next page navigation
├── RecipeListView.tsx       # unified list view
├── constants.ts             # EQUIPMENT_TYPE_LABELS, EQUIPMENT_FILTER_TYPES
└── useRecipeFilters.ts      # URL search param management hook
```

## Implementation Steps

1. Read both `RecipeListPage.tsx` and `StarredRecipesPage.tsx` to identify shared vs unique code
2. Create `apps/web/src/components/recipe-list/` directory
3. Extract `FilterField` component (identical in both files)
4. Extract `ActiveFilterBadge` component (identical in both files)
5. Extract `RecipeCard` component (identical in both files)
6. Extract `PaginationControls` component (present in both, slightly different empty states)
7. Create `constants.ts` with the canonical `EQUIPMENT_TYPE_LABELS` and `EQUIPMENT_FILTER_TYPES` (use RecipeListPage's full list as source of truth)
8. Extract `useRecipeFilters()` hook that encapsulates `useSearchParams`, `updateFilter()`, and param parsing
9. Create `RecipeListView` component that composes all shared pieces with `source` prop for page-specific differences
10. Refactor `RecipeListPage` to use `RecipeListView` (keep coffee variety filter as page-specific addition)
11. Refactor `StarredRecipesPage` to use `RecipeListView` (keep login-required state as page-specific addition)
12. Verify both pages work identically with same filter options
13. Run `make check-web`

## Testing Strategy

- Navigate to `/recipes` — verify all filters work (brew method, drink type, equipment, taste notes, search, sort)
- Navigate to `/recipes/starred` — verify same filter options appear
- Compare equipment dropdown lists between both pages — verify identical options
- Test mobile sidebar toggle on both pages
- Test pagination on both pages
- Verify coffee variety filter only appears on RecipeListPage
- Verify login-required message appears on StarredRecipesPage when unauthenticated

## Risk Assessment

- **Low**: Extractive refactoring — no behavioral changes, just moving code
- **Low**: Both pages can be migrated independently
- **Medium**: Must ensure equipment type constants match the DB schema exactly

## Dependencies

- **D13** (module-level cache) — the shared hook should handle caching concerns
- **D10** (TanStack Query) — if done first, the hook can wrap `useQuery` instead of raw fetch

## References

- RecipeListPage: `apps/web/src/pages/recipes/RecipeListPage.tsx`
- StarredRecipesPage: `apps/web/src/pages/recipes/StarredRecipesPage.tsx`
- Equipment types in DB: `packages/db/src/schema.ts` (equipment table `type` column)
