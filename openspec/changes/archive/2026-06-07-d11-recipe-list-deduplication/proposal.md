## Why

`RecipeListPage.tsx` (650 lines) and `StarredRecipesPage.tsx` (515 lines) share
~90% of their code — sub-components, filter logic, URL search-param parsing,
sidebar layout, pagination controls, and a duplicated `EQUIPMENT_TYPE_LABELS`
map. The shared copy has already drifted: 17 vs 11 equipment types, two
stale label strings (`'Pour-Over Brewer'` / `'Immersion Brewer'` vs the
shared canonical values), a singular-vs-plural i18n bug on the taste-note
badge, and a hardcoded `=== '/recipes'` path check. Extracting the shared
module fixes every drift point in one PR and makes future filter changes
touch a single file.

## What Changes

- Create `apps/web/src/components/recipe-list/` with: `constants.ts`
  (re-export of `EQUIPMENT_TYPE_LABELS` from `@brewform/shared/constants`
  plus the local `EQUIPMENT_FILTER_TYPES` ordering), `useRecipeFilters.ts`
  (URL search-param hook), and four leaf components (`FilterField`,
  `ActiveFilterBadge`, `RecipeCard`, `PaginationControls`).
- Create `RecipeListView.tsx` — a single component driven by a
  `source: 'all' | 'starred'` prop that renders the sidebar, active-filter
  badges, equipment dropdowns, taste-note filter, sort, and grid +
  pagination. It accepts three optional page-specific props:
  `showAdminVisibilityFilter`, `coffeeVarietyFilterSlot`,
  `emptyMessageKey`.
- Refactor `pages/recipes/RecipeListPage.tsx` to a thin wrapper that
  exports its existing `loader` + `RecipeListLoaderData` type and renders
  `RecipeListView` with `source='all'`, `showAdminVisibilityFilter` driven
  by `user.isAdmin`, and a fully-rendered coffee-variety filter as a slot.
  All variety-search state stays in the page wrapper.
- Refactor `pages/recipes/StarredRecipesPage.tsx` to a thin wrapper that
  keeps the 401→`/login` redirect in its `loader`, renders the
  `loginRequired` message before the view when `!isAuthenticated`, and
  passes `source='starred'` + `emptyMessageKey='recipe.starred.noResults'`.
- Update `pages/recipes/RecipeListPage.test.tsx` — one import line: import
  `EQUIPMENT_FILTER_TYPES` and `EQUIPMENT_TYPE_LABELS` from the new
  `components/recipe-list/constants.ts` instead of from `./RecipeListPage.tsx`.
- All test logic unchanged; the property-based test continues to drive
  `EQUIPMENT_FILTER_TYPES` from the same array.

## Capabilities

### New Capabilities

- `recipe-list`: a shared, self-contained web component module for the
  recipe list / starred-recipes filter UI — covers `RecipeListView` plus
  its leaf components and the URL search-param hook. Establishes that
  both `/recipes` and `/recipes/starred` render the same view with
  per-page config, that filter labels come from
  `@brewform/shared/constants` only, and that the divergent behaviours
  (loading state, total fallback, taste-note badge label, path check,
  empty-state copy) are resolved by a single component with a
  `source` prop and a small set of optional slots.

### Modified Capabilities

- *(none — no API, schema, or product-requirement changes. Pure
  extractive refactor; existing behaviour is preserved for the
  `/recipes` page and intentionally tightened for `/recipes/starred`.)*

## Impact

- **Files added** (8 new files in `apps/web/src/components/recipe-list/`):
  `index.ts`, `constants.ts`, `useRecipeFilters.ts`, `FilterField.tsx`,
  `ActiveFilterBadge.tsx`, `RecipeCard.tsx`, `PaginationControls.tsx`,
  `RecipeListView.tsx`.
- **Files refactored**:
  - `apps/web/src/pages/recipes/RecipeListPage.tsx` — 650 → ~80 lines
    (loader + thin wrapper).
  - `apps/web/src/pages/recipes/StarredRecipesPage.tsx` — 515 → ~40 lines
    (loader + thin wrapper).
  - `apps/web/src/pages/recipes/RecipeListPage.test.tsx` — 1 import line.
- **Files unchanged**: `apps/web/src/api/static-cache.ts` (D10 work),
  `apps/web/src/components/recipe/RecipeCard.styles.ts` (still consumed
  by the new `components/recipe-list/RecipeCard.tsx`),
  `@brewform/shared/constants/equipment-types.ts` (already canonical),
  `apps/web/src/router.tsx` (no path changes).
- **Behavioural changes on `/recipes/starred` only**:
  1. Now renders 6 additional equipment filter dropdowns that were
     missing (the 11 → 17 expansion).
  2. Two label strings now read `'Pour-Over & Filter Brewer'` and
     `'Immersion & Pressure Brewer'` (corrected from local copy that
     still matched `@brewform/shared` on the `/recipes` page after the
     refactor).
  3. Taste-note active badge uses the plural i18n key
     `recipe.list.tasteNotesFilter` (was singular on this page only).
- **No API, no schema, no new dependencies, no AGENTS.md changes, no
  OpenAPI spec changes.** D10 (React Router 7 loaders) is already
  merged on `main` and is naturally compatible — both pages already
  export `loader` and use `useLoaderData`.
- **Test environment**: Vitest with jsdom (per `apps/web/vitest.config.ts`).
  No test-setup changes needed.
