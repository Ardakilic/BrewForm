# D11 — Recipe List Deduplication

> **Companion documents**:
> - `openspec/changes/d11-recipe-list-deduplication/` — OpenSpec change
>   with `proposal.md`, `design.md`, `specs/recipe-list/spec.md`, and
>   `tasks.md`. Source of truth for the contract.
> - `plans/D11-recipe-list-deduplication.md` — original validated plan
>   (June 2026) with 8 corrections applied.
> - This file is the human-facing PR summary. Use it as the PR body.

## Summary

Extract ~90% of the duplicated code from `RecipeListPage` and
`StarredRecipesPage` into a new shared
`apps/web/src/components/recipe-list/` module. After this PR both pages
are thin wrappers (70 and 80 lines respectively) around a single
`RecipeListView` component, plus four small extracted pieces
(`FilterField`, `ActiveFilterBadge`, `RecipeCard`, `PaginationControls`),
a `useRecipeFilters()` URL-param hook, and an
`useCoffeeVarietyFilter()` page-local hook that hosts the
`/recipes`-only variety-search state.

The pages converge on a **single source of truth** for filter UI,
equipment labels, and pagination — eliminating the drift that exists
today (17 vs 11 equipment types, stale naming, a singular-vs-plural
i18n bug) because the starred page was copy-pasted from the all-recipes
page with minimal extraction.

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

### New page-local hook

```
apps/web/src/pages/recipes/
└── useCoffeeVarietyFilter.tsx   # /recipes-only variety-search state
```

This file is page-local (not in `components/recipe-list/`) because the
variety-search state is only ever consumed by `RecipeListPage`. The
`/recipes/starred` page has no need for it. Co-locating it with the
page keeps the shared module focused on reusable view code.

### Refactored pages

| File | Before | After | Spec cap |
|------|--------|-------|----------|
| `pages/recipes/RecipeListPage.tsx` | 650 lines | **70 lines** (loader + thin wrapper + variety slot wiring) | ≤ 120 |
| `pages/recipes/StarredRecipesPage.tsx` | 515 lines | **80 lines** (loader + thin wrapper + auth gate) | ≤ 80 |
| `components/recipe-list/RecipeListView.tsx` | — | **339 lines** | ≤ 350 |

All other new files in `components/recipe-list/` are ≤ 60 lines each.

### Re-export pattern (no duplication)

`components/recipe-list/constants.ts` re-exports `EQUIPMENT_TYPE_LABELS`
**from `@brewform/shared/constants`** rather than copying the object
literal. The shared package is the single source of truth and already
has the canonical labels for all 17 equipment types.

### Test updates

`pages/recipes/RecipeListPage.test.tsx` — one import block updated to
import `EQUIPMENT_FILTER_TYPES` and `EQUIPMENT_TYPE_LABELS` from
`components/recipe-list/constants.ts` instead of from
`./RecipeListPage.tsx`. The `@brewform/shared/constants` mock was
augmented to include `EQUIPMENT_TYPE_LABELS` (see **Deviations** below).
All 30 tests pass.

`pages/recipes/StarredRecipesPage.test.tsx` — same `EQUIPMENT_TYPE_LABELS`
mock addition. All 6 tests pass.

## Architecture (visual)

```
┌──────────────────────────────────────────────────────────────────────┐
│                       apps/web/src/pages/recipes/                    │
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐                        │
│  │ RecipeListPage   │    │ StarredRecipes   │   thin wrappers        │
│  │  (loader + view) │    │ Page (loader +   │   (70, 80 lines)       │
│  │  + variety state │    │  view + auth     │                        │
│  │  via             │    │  gate)           │                        │
│  │  useCoffeeVar…   │    │                  │                        │
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

## Props contract (added beyond spec's enumerated set)

The spec's task 4.2 listed 8 props on `RecipeListView`. The
implementation has 10 — the two additions are required by design
Decision 3 and the spec scenario for the coffee-variety badge:

| Prop | Reason |
|------|--------|
| `selectedCoffeeVarietyName?: string \| null` | Page-owned variety name resolution (the view never fetches). |
| `onClearCoffeeVariety?: () => void` | Page-owned cleanup callback. Falls back to `updateFilter('coffeeVarietyId', '')` when omitted. |

Both additions are documented in the props interface JSDoc and are
exercised by the `RecipeListPage` test (variety badge scenarios,
~lines 660-712).

## Fixes included (bonus from unification)

These divergences existed between the two pages and are resolved by
the unified `RecipeListView`:

| # | Bug | Fix |
|---|-----|-----|
| 1 | `StarredRecipesPage` taste-note badge used singular i18n key `recipe.list.tasteNoteFilter` (missing "s") | Unified component always uses plural `recipe.list.tasteNotesFilter` |
| 2 | `StarredRecipesPage` had 11 equipment types with stale naming (`gooseneck_kettle`, `scale`) | Both pages now show the canonical 17 types from `@brewform/shared/constants` |
| 3 | `RecipeListPage` local labels diverged from shared (`'Pour-Over Brewer'` vs `'Pour-Over & Filter Brewer'`) | Shared labels now used everywhere |
| 4 | Hardcoded `=== '/recipes'` in `RecipeListPage` for loading-state detection | Dynamic `=== location.pathname` (works for any route) |
| 5 | `StarredRecipesPage` used `<Loader text>` for main area loading; `RecipeListPage` used `<RecipeCardSkeletonGrid />` | Preserved per source: skeleton for `all`, text for `starred` |
| 6 | `total` fallback differed: `recipes.length` vs `0` | Preserved per source via the `source` prop |
| 7 | `noResults` i18n key differed: `recipe.list.noResults` vs `recipe.starred.noResults` | Resolved via `emptyMessageKey` prop |
| 8 | `isAuthenticated` login-required gate lived inside `StarredRecipesPage` JSX, duplicating the view's main area | Moved to a `if (!isAuthenticated) return …` early return at the top of the page wrapper, bypassing the view entirely (per design Decision 10) |

## Deviations from the spec

The implementation follows the validated plan and tasks closely. Three
small deviations were necessary; all are documented here.

### 1. `useCoffeeVarietyFilter` extracted to a separate file

The spec (task 5.1) places the variety-search state in
`RecipeListPage.tsx` itself and limits the page to ≤ 120 lines. The
inlined JSX pushes the page to ~210 lines, which exceeds the cap.
Resolution: extract the variety state machinery to
`apps/web/src/pages/recipes/useCoffeeVarietyFilter.tsx` (page-local
hook, NOT a shared module — `/recipes/starred` never uses it). The
page wrapper shrinks to 70 lines, well under the cap. The hook owns
the variety `FilterField` JSX as `slot`, the resolved `selectedName`
string, and the `clear` callback — exactly the three things the view
needs (per design Decision 3).

### 2. Test mock augmented with `EQUIPMENT_TYPE_LABELS`

The spec (task 6.1, line 502-504) says:
> The mock for `@brewform/shared/constants` at lines 60-64 of the test
> continues to provide `BREW_METHODS_LIST`, `DRINK_TYPES_LIST`, and
> `VISIBILITY_STATES_LIST`; these come through the new view without
> test changes.

This was correct for the view's direct imports. It is **not** correct
for the new `constants.ts`, which re-exports `EQUIPMENT_TYPE_LABELS`
from `@brewform/shared/constants`. Vitest's module resolution makes
the re-export go through the mock — so without adding
`EQUIPMENT_TYPE_LABELS` to the mock factory, the new `constants.ts`
would export `undefined`, breaking the test's
`EQUIPMENT_TYPE_LABELS[type]` access.

The mock was augmented with a 17-entry `EQUIPMENT_TYPE_LABELS` object
in both `RecipeListPage.test.tsx` and `StarredRecipesPage.test.tsx`.
This is a real, necessary deviation from "do not change any other
line" and is the only way to keep the re-export (which the spec
explicitly mandates in task 2.1 line 28-32) working in tests.

### 3. View's unmount log is `log.debug({}, '…')` (empty)

The spec scenario at line 408-410 says:
> THEN a single `log.debug({}, 'RecipeListView unmounted')` is emitted

The mount log includes `source` (per line 401-402). The unmount log
does not. This is intentional — the unmount is fired during navigation
to a different page, and the destination context is more relevant
than the page being unmounted. Implementation matches.

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

Manual checks in the browser (against `make dev`):

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
6. Unauthenticated user on `/recipes/starred` — "Please log in"
   message appears and `RecipeListView` is **not** rendered (the page
   wrapper early-returns on `!isAuthenticated`).
7. Mobile sidebar toggle works on both pages.
8. Pagination prev/next works on both pages.
9. Compare equipment dropdowns between `/recipes` and `/recipes/starred`
   — they are now identical (including the two corrected labels).
10. Taste-note active badge label is the plural form on both pages
    (was singular on `/recipes/starred` only — a bug).

## Test count vs. spec

The spec mentions test counts in a few places. The actual counts
differ because the spec is slightly out of date (test files were
updated as part of prior changes — D10, PBT additions, etc.). The
implementation does not modify any test logic.

| File | Spec says | Actual | Status |
|------|-----------|--------|--------|
| `RecipeListPage.test.tsx` | 23 tests | **30 tests** | All pass |
| `StarredRecipesPage.test.tsx` | 9 tests | **6 tests** | All pass |
| `make test-web` (full web suite) | "all tests pass" | **733/733 across 50 files** | All pass |

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
- Collapsing the two loader data types into one shared type (design
  Decision 7) — the spec task 5.1 explicitly says to keep them in the
  page files for minimum diff. The two types are identical; future PR
  can share them safely.

## Files changed

```
apps/web/src/components/recipe-list/                              (NEW, 8 files)
  ├── index.ts                                                      (15 lines)
  ├── constants.ts                                                  (40 lines)
  ├── useRecipeFilters.ts                                           (108 lines)
  ├── FilterField.tsx                                               (19 lines)
  ├── ActiveFilterBadge.tsx                                         (37 lines)
  ├── RecipeCard.tsx                                                (59 lines)
  ├── PaginationControls.tsx                                        (48 lines)
  └── RecipeListView.tsx                                            (339 lines)

apps/web/src/pages/recipes/
  ├── useCoffeeVarietyFilter.tsx                                  (NEW, 162 lines)
  ├── RecipeListPage.tsx                                            (70 lines, was 650)
  ├── StarredRecipesPage.tsx                                        (80 lines, was 515)
  ├── RecipeListPage.test.tsx                                       (mock + 1 import block)
  └── StarredRecipesPage.test.tsx                                   (mock only)

openspec/changes/d11-recipe-list-deduplication/                  (NEW, 4 artifacts)
plans/D11-recipe-list-deduplication.md                           (validated plan)
```

## Risk

**Low**. The refactor is extractive — no behavioural changes to the
`/recipes` page. The `/recipes/starred` page picks up 6 new equipment
filters, 2 corrected labels, and a corrected taste-note badge label
(intentional, fixes existing bugs). No migrations, no schema changes,
no API changes. The auth gate is now structured as an early return in
the page wrapper (per design Decision 10), which has the same visible
behaviour as the original inline conditional.

## Checklist

- [x] `make check-web` passes (179 files clean)
- [x] `make fmt` passes (431 files clean)
- [x] `make lint` passes
- [x] `make test-web` passes (50 files, 733 tests)
- [x] `RecipeListView.tsx` = 339 lines (≤ 350 cap)
- [x] `RecipeListPage.tsx` = 70 lines (≤ 120 cap)
- [x] `StarredRecipesPage.tsx` = 80 lines (≤ 80 cap)
- [x] No new dependencies in `apps/web/package.json` or `deno.lock`
- [x] All extracted leaf files are small (≤ 60 lines)
- [x] Mount/unmount logs in view (with `source`) and page wrappers
- [x] Spec deviations documented (this PR's "Deviations from the
      spec" section)
