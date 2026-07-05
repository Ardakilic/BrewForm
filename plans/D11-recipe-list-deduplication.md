# D11 — Recipe List Code Deduplication (~90%)

> **Status (2026-07-04): ✅ Done** — `components/recipe-list/` (8 files incl. `RecipeListView` with `source: 'all' | 'starred'`); the two pages are now ~70/80 lines.

> **Plan validated against `main` branch — June 2026**
> Eight errors were found in the original plan and corrected in this revision.
> Errors are annotated inline with `[Corrected]` markers.
> A summary of all corrections appears at the bottom.

---

## Severity

**High**

## Issue Description

`RecipeListPage.tsx` (650 lines) and `StarredRecipesPage.tsx` (515 lines) share approximately
90% of their code. The shared code includes:

- Sub-components: `FilterField`, `ActiveFilterBadge`, `RecipeCard`
- Filter logic: `updateFilter()`, `equipmentByType` computation, `hasActiveFilters`
- Equipment/taste notes data fetching via `api/static-cache.ts` (already centralised — see
  Dependency note on D13 below)
- URL search param parsing
- Pagination controls
- Sidebar layout and mobile toggle
- `EQUIPMENT_TYPE_LABELS` and `EQUIPMENT_FILTER_TYPES` constants (but with **inconsistent values**)

## Impact

- **Maintenance burden**: Any change to filter UI, recipe card layout, or pagination must be
  duplicated across two files
- **Inconsistent filter options**: `EQUIPMENT_TYPE_LABELS` differs between pages — RecipeListPage
  has 17 equipment types (espresso_machine, grinder, pour_over_brewer, immersion_brewer, kettle,
  milk_tool, scale_accessory, roaster, portafilter, basket, puck_screen, paper_filter, tamper,
  mesh_filter, cezve, thermometer, other) while StarredRecipesPage has only 11 (portafilter,
  basket, tamper, puck_screen, **scale**, **gooseneck_kettle**, paper_filter, mesh_filter, cezve,
  thermometer, other) with stale naming (`gooseneck_kettle` vs canonical `kettle`,
  `scale` vs canonical `scale_accessory`)
- **Label drift**: RecipeListPage's own local labels also diverge from the authoritative values
  already established in `@brewform/shared` (see Error 2 below)
- **Bug surface**: Fixing a filter bug in one page can be forgotten in the other

## Root Cause

`StarredRecipesPage` was copy-pasted from `RecipeListPage` with minimal extraction of shared
logic.

## Affected Files

| File | Lines | Description |
|------|-------|-------------|
| `apps/web/src/pages/recipes/RecipeListPage.tsx` | 1–650 | Full page with all sub-components |
| `apps/web/src/pages/recipes/StarredRecipesPage.tsx` | 1–515 | Copy-pasted page |

> **[Corrected — Error 1]** The original plan stated 693 and 540 lines respectively. The actual
> counts on `main` are **650** and **515** — the files were trimmed by earlier plans (D07 etc.)
> before D11 was actioned.

### Equipment Type Inconsistency

| RecipeListPage (local) | StarredRecipesPage (local) | `@brewform/shared` (canonical) |
|------------------------|---------------------------|-------------------------------|
| `espresso_machine`     | _(missing)_               | `espresso_machine` |
| `grinder`              | _(missing)_               | `grinder` |
| `pour_over_brewer`     | _(missing)_               | `pour_over_brewer` |
| `immersion_brewer`     | _(missing)_               | `immersion_brewer` |
| `kettle`               | **`gooseneck_kettle`**    | `kettle` |
| `milk_tool`            | _(missing)_               | `milk_tool` |
| `scale_accessory`      | **`scale`**               | `scale_accessory` |
| `roaster`              | _(missing)_               | `roaster` |
| `portafilter`          | `portafilter`             | `portafilter` |
| `basket`               | `basket`                  | `basket` |
| `puck_screen`          | `puck_screen`             | `puck_screen` |
| `paper_filter`         | `paper_filter`            | `paper_filter` |
| `tamper`               | `tamper`                  | `tamper` |
| `mesh_filter`          | `mesh_filter`             | `mesh_filter` |
| `cezve`                | `cezve`                   | `cezve` |
| `thermometer`          | `thermometer`             | `thermometer` |
| `other`                | `other`                   | `other` |

### Additional Label Drift (RecipeListPage vs `@brewform/shared`)

Even RecipeListPage's local copy does not match the shared canonical labels:

| Key | RecipeListPage local | `@brewform/shared` (authoritative) |
|-----|----------------------|------------------------------------|
| `pour_over_brewer` | `'Pour-Over Brewer'` | `'Pour-Over & Filter Brewer'` |
| `immersion_brewer` | `'Immersion Brewer'` | `'Immersion & Pressure Brewer'` |

> **[Corrected — Error 2]** The original plan said to create `constants.ts` using "RecipeListPage's
> full list as source of truth". However, `EQUIPMENT_TYPE_LABELS` **already exists** in
> `packages/shared/src/constants/equipment-types.ts` and is exported from `@brewform/shared/constants`.
> Using RecipeListPage's local copy as the source of truth would perpetuate two label mismatches.
> Step 7 must **import from `@brewform/shared/constants`** rather than duplicating the list.

### Other Divergences Between Pages (additional findings)

| Concern | RecipeListPage | StarredRecipesPage |
|---------|----------------|-------------------|
| Taste note active badge i18n key | `t('recipe.list.tasteNotesFilter')` (plural) | `t('recipe.list.tasteNoteFilter')` (singular) — **bug** |
| Main area loading state | `<RecipeCardSkeletonGrid />` skeleton | Plain `{t('common.loading')}` text |
| Navigation path check | Hardcoded `=== '/recipes'` | Dynamic `=== location.pathname` |
| `total` fallback when pagination absent | Falls back to `recipes.length` | Falls back to `0` |
| Admin visibility filter | ✅ Present (admin-only) | ❌ Absent |
| Coffee variety filter | ✅ Present (page-specific) | ❌ Absent |
| `useLoaderData` call form | `useLoaderData() as RecipeListLoaderData` | `useLoaderData<StarredRecipesLoaderData>()` |

> **[Corrected — Errors 5–8]** These four per-page divergences were missing from the original plan.
> Steps 9 and 10 below now specify how each is handled in the unified `RecipeListView`.

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
   - `useRecipeFilters()` — manages URL search params (page, brewMethod, drinkType, search,
     equipmentId, mainBrewer, tasteNoteIds, sortBy)
4. Create `constants.ts` with:
   - Re-export `EQUIPMENT_TYPE_LABELS` **from `@brewform/shared/constants`** (do not duplicate)
   - Define `EQUIPMENT_FILTER_TYPES` — ordered list of types to show as dropdowns (new; not in shared)
5. Create a unified `RecipeListView` component with a `source: 'all' | 'starred'` prop
6. Refactor both pages to thin wrappers around `RecipeListView`

### Proposed Directory Structure

```text
apps/web/src/components/recipe-list/
├── index.ts                 # re-exports
├── FilterField.tsx          # label + children wrapper
├── ActiveFilterBadge.tsx    # removable filter badge
├── RecipeCard.tsx           # recipe card component
├── PaginationControls.tsx   # prev/next page navigation
├── RecipeListView.tsx       # unified list view
├── constants.ts             # EQUIPMENT_FILTER_TYPES + re-export EQUIPMENT_TYPE_LABELS from shared
└── useRecipeFilters.ts      # URL search param management hook
```

**`constants.ts` must look like:**

```typescript
// Re-use the canonical list — do NOT duplicate
export { EQUIPMENT_TYPE_LABELS } from '@brewform/shared/constants';

/** Ordered list of equipment types to surface as separate filter dropdowns. */
export const EQUIPMENT_FILTER_TYPES = [
  'espresso_machine',
  'grinder',
  'pour_over_brewer',
  'immersion_brewer',
  'kettle',
  'milk_tool',
  'scale_accessory',
  'roaster',
  'portafilter',
  'basket',
  'puck_screen',
  'paper_filter',
  'tamper',
  'mesh_filter',
  'cezve',
  'thermometer',
  'other',
] as const;
```

## Implementation Steps

1. Read both `RecipeListPage.tsx` and `StarredRecipesPage.tsx` to identify shared vs unique code

2. Create `apps/web/src/components/recipe-list/` directory

3. Extract `FilterField` component (identical in both files)

4. Extract `ActiveFilterBadge` component (identical in both files)

5. Extract `RecipeCard` component (identical in both files — note both already import
   `AUTHOR_BUTTON_STYLE` from `../../components/recipe/RecipeCard.styles.ts`, which stays
   in place)

6. Extract `PaginationControls` component (present in both; the inner pagination JSX is
   identical — the differences lie in the surrounding empty-state logic which lives in
   `RecipeListView`, not here)

7. Create `constants.ts`:
   - **Re-export `EQUIPMENT_TYPE_LABELS` from `@brewform/shared/constants`** — do not copy the
     object literal (the original plan was wrong here; the canonical source already exists in the
     shared package and has correct labels for all 17 types)
   - Define `EQUIPMENT_FILTER_TYPES` as a new `as const` array with all 17 canonical type strings
     in the order shown above

8. Extract `useRecipeFilters()` hook that encapsulates `useSearchParams`, `updateFilter()`, and
   param parsing. The hook does **not** need to handle equipment/taste-note fetching; that is
   already done by the route loaders via `api/static-cache.ts`.

9. Create `RecipeListView` component with a `source: 'all' | 'starred'` prop. This component
   composes all shared pieces and resolves the four per-page divergences as follows:

   | Concern | Resolution |
   |---------|------------|
   | Taste note active badge i18n key | Always use `t('recipe.list.tasteNotesFilter')` (plural) — matches RecipeListPage and the test fixtures |
   | Main area loading state | `source === 'all'`: use `<RecipeCardSkeletonGrid />`; `source === 'starred'`: use `{t('common.loading')}` text |
   | Navigation path check | Always use dynamic `=== location.pathname` (StarredRecipesPage's approach — correct for any route) |
   | `total` fallback | `source === 'all'`: fall back to `recipes.length`; `source === 'starred'`: fall back to `0` |

   Additional page-specific slots via props or render children:
   - Admin visibility filter (RecipeListPage only): passed as an optional boolean/slot
   - Coffee variety filter (RecipeListPage only): managed by the page wrapper, not by `RecipeListView`
   - Login-required state (StarredRecipesPage only): checked in the page wrapper before rendering `RecipeListView`

10. Refactor `RecipeListPage` to a thin wrapper around `RecipeListView` (`source="all"`). The
    coffee variety filter state (varietySearch, varietyResults, varietyDropdownOpen,
    selectedVarietyName) and the coffeeVarietyId active badge remain in the page component and
    are passed as a `coffeeVarietyFilter` prop or sidebar slot into `RecipeListView`.

11. Refactor `StarredRecipesPage` to a thin wrapper around `RecipeListView` (`source="starred"`).
    The 401→redirect logic stays in the loader. The `!isAuthenticated` guard renders before
    `RecipeListView` in the component body.

12. Update test imports: `RecipeListPage.test.tsx` currently imports `EQUIPMENT_FILTER_TYPES`
    and `EQUIPMENT_TYPE_LABELS` from `./RecipeListPage.tsx`. After the refactor both are exported
    from `components/recipe-list/constants.ts`; update the import paths in the test file.

13. Verify both pages work identically with same filter options

14. Run `make check-web`

## Testing Strategy

- Navigate to `/recipes` — verify all filters work (brew method, drink type, equipment, taste
  notes, search, sort)
- Navigate to `/recipes/starred` — verify same filter options appear
- Compare equipment dropdown lists between both pages — verify identical options, including the
  corrected labels (`'Pour-Over & Filter Brewer'`, `'Immersion & Pressure Brewer'`)
- Test mobile sidebar toggle on both pages
- Test pagination on both pages
- Verify coffee variety filter only appears on RecipeListPage
- Verify admin visibility filter only appears on RecipeListPage for admin users
- Verify login-required message appears on StarredRecipesPage when unauthenticated
- Verify taste note active badge shows the same label text on both pages (`Taste Notes` in English)

## Risk Assessment

- **Low**: Extractive refactoring — no behavioral changes, just moving code
- **Low**: Both pages can be migrated independently
- **Medium**: `EQUIPMENT_TYPE_LABELS` canonical values differ slightly from RecipeListPage's local
  copy; the two affected label strings (`'Pour-Over & Filter Brewer'`, `'Immersion & Pressure Brewer'`)
  will change in the UI. Verify with a product stakeholder if needed before shipping.
- **Low**: `RecipeListPage.test.tsx` imports `EQUIPMENT_FILTER_TYPES` and `EQUIPMENT_TYPE_LABELS`
  from the page file; import paths must be updated to the new `constants.ts` location.

## Dependencies

- **D13** (module-level cache) — **[Corrected — Error 3]** The original note said "the shared hook
  should handle caching concerns". However, the module-level cache has **already been extracted** to
  `apps/web/src/api/static-cache.ts` (`getEquipmentCached`, `getTasteNotesCached`). Both page
  loaders call these helpers today. D13 as originally described no longer applies to D11; the
  `useRecipeFilters()` hook does not need to handle data fetching.
- **D10** (server state layer) — **[Corrected — Error 4]** The original note said "if done first,
  the hook can wrap `useQuery` instead of raw fetch". D10 was subsequently revised: it no longer
  introduces TanStack Query; it uses React Router 7's native `loader` / `useFetcher` APIs instead.
  D11 already relies on React Router loaders, so it is naturally compatible with D10's revised
  approach. No additional hook changes are required if D10 lands first.

## References

- RecipeListPage: `apps/web/src/pages/recipes/RecipeListPage.tsx`
- StarredRecipesPage: `apps/web/src/pages/recipes/StarredRecipesPage.tsx`
- Equipment constants (canonical): `packages/shared/src/constants/equipment-types.ts`
- Equipment constants (barrel export): `packages/shared/src/constants/index.ts`
- Static cache: `apps/web/src/api/static-cache.ts`
- Shared styles: `apps/web/src/components/recipe/RecipeCard.styles.ts`

---

## Correction Summary

Eight errors were found in the original plan during validation against the `main` branch:

| # | Location in original plan | Error | Correction |
|---|--------------------------|-------|------------|
| 1 | Affected Files table | Line counts stated as 693 / 540 | Actual counts are **650 / 515** |
| 2 | Step 7 | "use RecipeListPage's full list as source of truth" for `EQUIPMENT_TYPE_LABELS` | `EQUIPMENT_TYPE_LABELS` already exists in `@brewform/shared/constants`; Step 7 must **import** from there. RecipeListPage's local copy also has 2 divergent label strings (`'Pour-Over Brewer'`, `'Immersion Brewer'`) that the shared package corrects |
| 3 | Dependencies → D13 | "shared hook should handle caching concerns" | Module-level cache already extracted to `api/static-cache.ts`; D13 is not a blocker for D11 and the hook needs no cache logic |
| 4 | Dependencies → D10 | "hook can wrap `useQuery` instead of raw fetch" | D10 was revised to use React Router 7 loaders (no TanStack Query); D11 already uses loaders and requires no change when D10 lands |
| 5 | (missing) | i18n key inconsistency: StarredRecipesPage taste note badge uses `tasteNoteFilter` (singular) vs RecipeListPage's `tasteNotesFilter` (plural) | Unified component always uses `tasteNotesFilter` (plural) |
| 6 | PaginationControls note | "slightly different empty states" — loading-area difference not captured | RecipeListPage uses `<RecipeCardSkeletonGrid />`; StarredRecipesPage uses text; `RecipeListView` branches on `source` prop |
| 7 | (missing) | Navigation path check hardcoded in RecipeListPage (`=== '/recipes'`) | Unified component uses dynamic `=== location.pathname` (StarredRecipesPage's correct pattern) |
| 8 | (missing) | `total` fallback differs: RecipeListPage uses `recipes.length`, StarredRecipesPage uses `0` | Unified component branches on `source` prop to preserve the correct per-page fallback |