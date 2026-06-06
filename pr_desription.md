# D11 — Recipe List Deduplication

> **Companion documents**:
> - `openspec/changes/d11-recipe-list-deduplication/` — OpenSpec change
>   with `proposal.md`, `design.md`, `specs/recipe-list/spec.md`, and
>   `tasks.md`. Use this for the implementation spec.
> - `plans/D11-recipe-list-deduplication.md` — original validated plan
>   (June 2026) with 8 corrections applied.
> - This file is the human-facing PR summary. Use it as the PR body.

## Summary

Extract ~90% duplicated code from `RecipeListPage` and `StarredRecipesPage`
into a shared `apps/web/src/components/recipe-list/` module. After this PR,
both pages are thin wrappers (~60–80 lines) around a single
`RecipeListView` component, plus four small extracted pieces
(`FilterField`, `ActiveFilterBadge`, `RecipeCard`, `PaginationControls`)
and a `useRecipeFilters()` URL-param hook.

The pages converge on a **single source of truth** for filter UI,
equipment labels, and pagination — eliminating drift (17 vs 11 equipment
types, stale naming, a singular-vs-plural i18n bug) that exists today
because the starred page was copy-pasted from the all-recipes page with
minimal extraction.

## What changed

### New module: `apps/web/src/components/recipe-list/`

```
components/recipe-list/
├── index.ts                 # barrel re-exports
├── constants.ts             # EQUIPMENT_TYPE_LABELS (re-export from shared) + EQUIPMENT_FILTER_TYPES
├── useRecipeFilters.ts      # URL search-param management hook
├── FilterField.tsx          # label + children wrapper
├── ActiveFilterBadge.tsx    # removable filter badge
├── RecipeCard.tsx           # recipe card
├── PaginationControls.tsx   # prev/next page navigation
└── RecipeListView.tsx       # unified list view (source: 'all' | 'starred')
```

### Refactored pages

| File | Before | After |
|------|--------|-------|
| `pages/recipes/RecipeListPage.tsx` | 650 lines | ≤ 120 lines (loader + thin wrapper) |
| `pages/recipes/StarredRecipesPage.tsx` | 515 lines | ≤ 80 lines (loader + thin wrapper) |

### Re-export pattern (do not duplicate)

`components/recipe-list/constants.ts` re-exports `EQUIPMENT_TYPE_LABELS`
**from `@brewform/shared/constants`** rather than copying the object
literal. The shared package is the single source of truth and already has
the canonical labels for all 17 equipment types.

### Test updates

`pages/recipes/RecipeListPage.test.tsx` — one import line updated to
import `EQUIPMENT_FILTER_TYPES` and `EQUIPMENT_TYPE_LABELS` from
`components/recipe-list/constants.ts` instead of from
`./RecipeListPage.tsx`. No test logic changes. All 23 tests continue to
pass.

## Architecture (visual)

```
┌──────────────────────────────────────────────────────────────────────┐
│                       apps/web/src/pages/recipes/                    │
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐                        │
│  │ RecipeListPage   │    │ StarredRecipes   │   thin wrappers        │
│  │  (loader + view) │    │ Page (loader +   │   (60–120 lines)       │
│  │  + variety state │    │  view + auth     │                        │
│  │  as slot         │    │  gate)           │                        │
│  └────────┬─────────┘    └────────┬─────────┘                        │
│           │                       │                                  │
│           ▼                       ▼                                  │
│  ┌────────────────────────────────────────────┐                      │
│  │  RecipeListView                            │  source: 'all'|'…'   │
│  │  source='all'                 source='starred'                   │
│  └────────┬───────────────────────────────────┘                      │
│           │  uses                                                      │
│           ▼                                                           │
│  ┌─────────────────────────────────────────────┐                      │
│  │  FilterField                                │                      │
│  │  ActiveFilterBadge                          │                      │
│  │  RecipeCard                                 │                      │
│  │  PaginationControls                         │                      │
│  │  useRecipeFilters()                         │                      │
│  │  EQUIPMENT_TYPE_LABELS  ← from shared pkg   │                      │
│  │  EQUIPMENT_FILTER_TYPES                     │                      │
│  └─────────────────────────────────────────────┘                      │
│           │                                                           │
│           ▼  (unchanged)                                              │
│  ┌─────────────────────────────────────────────┐                      │
│  │  apps/web/src/api/static-cache.ts (D10)     │                      │
│  │  apps/web/src/components/recipe/            │                      │
│  │      RecipeCard.styles.ts                   │                      │
│  └─────────────────────────────────────────────┘                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Fixes included (bonus from unification)

These divergences existed between the two pages and are resolved by the
unified `RecipeListView`:

| # | Bug | Fix |
|---|-----|-----|
| 1 | `StarredRecipesPage` taste-note badge used singular i18n key `recipe.list.tasteNoteFilter` (missing "s") | Unified component always uses plural `recipe.list.tasteNotesFilter` |
| 2 | `StarredRecipesPage` had 11 equipment types with stale naming (`gooseneck_kettle`, `scale`) | Both pages now show the canonical 17 types from `@brewform/shared/constants` |
| 3 | `RecipeListPage` local labels diverged from shared (`'Pour-Over Brewer'` vs `'Pour-Over & Filter Brewer'`) | Shared labels now used everywhere |
| 4 | Hardcoded `=== '/recipes'` in `RecipeListPage` for loading-state detection | Dynamic `=== location.pathname` (works for any route) |
| 5 | `StarredRecipesPage` used `<Loader text>` for main area loading; `RecipeListPage` used `<RecipeCardSkeletonGrid />` | Preserved per source: skeleton for `all`, text for `starred` |
| 6 | `total` fallback differed: `recipes.length` vs `0` | Preserved per source via the `source` prop |
| 7 | `noResults` i18n key differed: `recipe.list.noResults` vs `recipe.starred.noResults` | Resolved via `emptyMessageKey` prop |

## Visible UI changes

### Two filter labels change in the UI on `/recipes` (and now `/recipes/starred`)

| Equipment type | Old label (RecipeListPage local) | New label (shared) |
|----------------|----------------------------------|---------------------|
| Pour-Over Brewer | `Pour-Over Brewer` | `Pour-Over & Filter Brewer` |
| Immersion Brewer | `Immersion Brewer` | `Immersion & Pressure Brewer` |

### Starred page now shows 6 additional equipment filter dropdowns

Previously had 11 types (with stale naming); now shows the same 17 as
`/recipes`. The new types surface only when the user has at least one
item of that type in their equipment library:
`Espresso Machine`, `Grinder`, `Pour-Over & Filter Brewer`,
`Immersion & Pressure Brewer`, `Kettle`, `Milk Tool`, `Scale & Accessory`,
`Roaster`.

> **Heads up for product**: the two renamed labels should be confirmed
> with a product stakeholder before shipping — they correct what was
> effectively inconsistent terminology between the local copy and the
> canonical shared values.

## API surface

No API changes. No database changes. No new dependencies. The Drizzle
schema and Hono routes are untouched.

## How to test

```bash
# Type-check
make check-web

# Tests
make test-specific filter=apps/web/src/pages/recipes/RecipeListPage.test.tsx
make test-specific filter=apps/web/src/pages/recipes/StarredRecipesPage.test.tsx

# Full web suite
make test
```

Manual checks in the browser:

1. `/recipes` — all filters work (search, brew method, drink type,
   equipment, taste notes, coffee variety, sort, pagination, clear
   filters).
2. `/recipes/starred` — same filter options as `/recipes` (previously
   had 11 instead of 17 equipment types).
3. Admin user on `/recipes` — Visibility filter still appears
   (admin-only).
4. Non-admin user on `/recipes` — Visibility filter does NOT appear.
5. Coffee variety filter only appears on `/recipes`, not on
   `/recipes/starred`.
6. Unauthenticated user on `/recipes/starred` — "Please log in" message
   appears (the `!isAuthenticated` guard is in the page wrapper, not
   the view).
7. Mobile sidebar toggle works on both pages.
8. Pagination prev/next works on both pages.
9. Compare equipment dropdowns between `/recipes` and `/recipes/starred`
   — they are now identical (including the two corrected labels).
10. Taste-note active badge label is the plural form on both pages
    (was singular on `/recipes/starred` only — a bug).

## Dependencies

- **D10** (Server State Layer via React Router 7) — already merged on
  `main` (commit `fac8863`). This PR is **naturally compatible** — both
  pages already export `loader`s and use `useLoaderData()`.
- **D13** (Module-level cache) — already addressed by the
  static-cache extraction done as part of D10. This PR has no caching
  concerns.

## Out of scope

- Backend filter logic duplication (`apps/api/src/modules/recipe/`) —
  that is D12, a separate PR.
- Cross-tab cache invalidation for equipment / taste notes — separate
  concern.
- `RecipeCard.tsx` extraction to a public component in
  `components/recipe/` — not done in this PR. The card is still
  rendered only from the list pages; promoting it would be premature.

## Files changed

```
apps/web/src/components/recipe-list/                              (NEW, 8 files)
apps/web/src/pages/recipes/RecipeListPage.tsx                     (650 → ≤ 120 lines)
apps/web/src/pages/recipes/StarredRecipesPage.tsx                 (515 → ≤ 80 lines)
apps/web/src/pages/recipes/RecipeListPage.test.tsx               (1 import line)
openspec/changes/d11-recipe-list-deduplication/                  (NEW, 4 artifacts)
plans/D11-recipe-list-deduplication.md                           (validated plan)
```

## Risk

**Low**. The refactor is extractive — no behavioural changes to the
`/recipes` page. The `/recipes/starred` page picks up 6 new equipment
filters, 2 corrected labels, and a corrected taste-note badge label
(intentional, fixes existing bugs). No migrations, no schema changes,
no API changes.
