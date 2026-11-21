## ADDED Requirements

### Requirement: Recipe list pagination navigates to the selected page
Clicking a page control on `/recipes` or `/recipes/starred` SHALL navigate to that page while keeping every filter, sort and search parameter, and the page loader SHALL receive the same `page` value from the URL.

`RecipeListView` SHALL call `setPage(p)` from `useRecipeFilters()` for `PaginationControls`. A
`RecipeListView` (or page-level) regression test SHALL click Next and assert that the URL contains
`page=2` and that the loader is called with `page: '2'`; this test SHALL fail against the
pre-fix `useRecipeFilters.ts`.

#### Scenario: Next goes to page 2
- **WHEN** a user on `/recipes?brewMethod=v60` with more than 12 results clicks Next
- **THEN** the URL becomes `/recipes?brewMethod=v60&page=2` and the loader requests `page=2` with `brewMethod=v60`

#### Scenario: Previous goes back one page
- **WHEN** a user on `/recipes/starred?page=3&sortBy=rating` clicks Previous
- **THEN** the URL becomes `/recipes/starred?page=2&sortBy=rating`

#### Scenario: Page 1 is canonical
- **WHEN** a user on `/recipes?page=2` clicks Previous
- **THEN** the URL becomes `/recipes` with no `page` parameter

### Requirement: Recipe list text filters are debounced and replace history
The `/recipes` and `/recipes/starred` search and author inputs SHALL hold the typed text locally and commit it to the URL only after 300 ms without typing, replacing the current history entry, so that typing triggers at most one loader run and one API request per pause.

The inputs SHALL re-sync from the URL on external URL changes (Back/Forward, Clear Filters, badge
removal). Select-type filters keep pushing history. Behaviour follows the `web-url-state`
capability.

#### Scenario: One request per typing pause
- **WHEN** a user types `ethiopia` into the search box without pausing
- **THEN** the recipe list loader runs once, 300 ms after the last keystroke

#### Scenario: Author badge removal clears the input
- **WHEN** a user removes the Author active-filter badge
- **THEN** the author input is emptied and the `author` parameter is removed

## MODIFIED Requirements

### Requirement: useRecipeFilters hook

The system SHALL provide a `useRecipeFilters()` hook in
`apps/web/src/components/recipe-list/useRecipeFilters.ts` that returns:

- `searchParams: URLSearchParams` and `setSearchParams` — pass-through
  from `useSearchParams()`.
- Parsed scalars: `page: number`, `brewMethod: string`,
  `drinkType: string`, `visibility: string`, `sortBy: string`,
  `search: string`, `equipmentId: string`, `mainBrewer: string`,
  `tasteNoteIds: string[]` (UUID-validated), `coffeeVarietyId: string`,
  `author: string`, `dateFrom: string`, `dateTo: string`,
  `minRating: string`, `maxRating: string`.
- `updateFilter(key: string, value: string | string[])`: sets or
  deletes the URL param, joining arrays with `,`. When `key` is any
  filter, sort or search key it SHALL also delete the `page` param so
  the user lands on page 1. When `key === 'page'` it SHALL NOT delete
  the `page` param.
- `setPage(page: number)`: sets `page` (deleting it when `page <= 1`)
  and keeps every other param unchanged.
- `clearAllFilters(): void`: replaces all URL search params with an
  empty object.
- Discrete updates (`updateFilter` for non-text keys, `setPage`,
  `clearAllFilters`) push a history entry; text keys (`search`,
  `author`) are committed through the debounced, `replace: true` path
  defined by the `web-url-state` capability.

The hook SHALL use the same UUID regex as
`apps/web/src/utils/recipe-filters.ts` to validate `tasteNoteIds`
entries, and SHALL parse `page` with the same rules as
`extractListParams` (non-numeric or non-positive values become `1`).

The test in `useRecipeFilters.test.tsx` that asserted "should always
clear the page param when updateFilter is called" SHALL be replaced
by tests asserting that filter changes clear `page` and that
`setPage(3)` / `updateFilter('page', '3')` keep `page=3` and all
filters.

#### Scenario: updateFilter with empty value deletes the param

- **WHEN** `updateFilter('equipmentId', '')` is called
- **THEN** the `equipmentId` URL param is removed

#### Scenario: updateFilter with array joins with comma

- **WHEN** `updateFilter('tasteNoteIds', ['a', 'b', 'c'])` is called
- **THEN** the `tasteNoteIds` URL param is set to `'a,b,c'`

#### Scenario: updateFilter on a filter key resets page

- **WHEN** `updateFilter('brewMethod', 'ESPRESSO')` is called while
  `page=3` is in the URL
- **THEN** the `page` param is removed from the resulting URL

#### Scenario: setPage keeps filters

- **WHEN** `setPage(3)` is called while `brewMethod=v60&sortBy=rating`
  is in the URL
- **THEN** the URL contains `brewMethod=v60`, `sortBy=rating` and
  `page=3`

#### Scenario: updateFilter on the page key keeps the page

- **WHEN** `updateFilter('page', '3')` is called while `brewMethod=v60`
  is in the URL
- **THEN** the resulting URL contains `page=3` and `brewMethod=v60`

#### Scenario: clearAllFilters empties the URL

- **WHEN** `clearAllFilters()` is called
- **THEN** every URL search param is removed

### Requirement: Page wrapper thinness

After this refactor, the two page files SHALL each contain only:

- An import of the page's `loader` from its co-located data module
  (`RecipeListPage.data.ts` / `StarredRecipesPage.data.ts`), which
  passes `request.signal` to every API call and, for the starred
  page, is wrapped by `requireAuth` so a 401 redirects to
  `/login?next=…` (see the `web-data-loading` capability).
- A `RecipeListPage` / `StarredRecipesPage` component that:
  - Calls `useLoaderData<typeof loader>()` (no `as` cast).
  - For `RecipeListPage`: hosts the coffee-variety filter (whose
    typeahead reads through a `useFetcher()` resource route and whose
    selected-variety name comes from the loader), builds the
    `coffeeVarietyFilterSlot`, passes
    `showAdminVisibilityFilter={user?.isAdmin === true}` to the view.
  - For `StarredRecipesPage`: checks `isAuthenticated` and renders
    the login-required message before the view when false.
  - Renders `<RecipeListView ... />` with the appropriate props.

`RecipeListPage.tsx` SHALL be at most 120 lines (wrapper + state).
`StarredRecipesPage.tsx` SHALL be at most 80 lines (wrapper + auth
gate).

#### Scenario: RecipeListPage line count is bounded

- **WHEN** `wc -l apps/web/src/pages/recipes/RecipeListPage.tsx` is run
- **THEN** the count is ≤ 120

#### Scenario: StarredRecipesPage line count is bounded

- **WHEN** `wc -l apps/web/src/pages/recipes/StarredRecipesPage.tsx`
  is run
- **THEN** the count is ≤ 80

#### Scenario: Loaders forward the abort signal

- **WHEN** the `/recipes` loader is called with a `request` whose
  signal is later aborted
- **THEN** `recipeApi.list` received that same signal

### Requirement: HomePage adopts the shared RecipeCard as the canonical card for public recipe listings

The `RecipeCard` component exported from `apps/web/src/components/recipe-list/` MUST be the single
canonical card for public recipe listings (established by the `recipe-list` capability's "Shared
recipe-list view component" and "Module barrel and re-exports" requirements). The `HomePage`
component SHALL import and render this shared `RecipeCard` for both the "Latest Recipes" and
"Popular Recipes" sections. No other page in `apps/web/src/pages/` SHALL define a local `RecipeCard`
function component for public recipe listings.

This requirement extends the `recipe-list` capability's scope from "the shared module backs
`/recipes` and `/recipes/starred`" to "the shared `RecipeCard` is the canonical card for ALL public
recipe listings, including the home page." The `AdminRecipesPage` table (which uses a `<table>`,
not cards) is explicitly out of scope — see the `web-shared-components` requirement "AdminRecipesPage
table is NOT extracted (stretch rejected)."

**Reason:** `HomePage.tsx` had a local `RecipeCard` fork (lines 103–137) that duplicated the
shared card. The D36 plan's Cluster 1 deletes the fork
and imports the shared card. This requirement codifies the canonical-card contract so future pages
don't re-fork it. This is a narrow scope extension of `recipe-list` (not a general dedup spec);
the broader dedup work (BanDialog, Section/Field) is covered by the new `web-shared-components`
capability.

#### Scenario: HomePage imports the shared RecipeCard

- **WHEN** the source of `apps/web/src/pages/HomePage.tsx` is inspected
- **THEN** it imports `RecipeCard` from `../components/recipe-list/` (or the barrel
  `../components/recipe-list/index.ts`) and contains NO local `function RecipeCard` definition

#### Scenario: No public recipe listing page defines a local RecipeCard

- **WHEN** `grep -rn "function RecipeCard" apps/web/src/pages/` is run
- **THEN** no matches are returned — no page defines a local `RecipeCard` function (the shared
  `components/recipe-list/RecipeCard.tsx` is the only definition)

#### Scenario: HomePage cards follow the shared card's version-strip rule

- **WHEN** `HomePage` is rendered with loader data from `GET /api/v1/recipes` (list items carry no
  version payload, per the `advanced-search` requirement "List items carry no version payload")
- **THEN** each card renders title, author and counts through the shared `RecipeCard` and no
  brew-method • drink-type • ★ rating strip, because the strip renders only when a `version` prop
  is passed explicitly

#### Scenario: HomePage test passes unchanged

- **WHEN** `make test-web` is executed (or `make test-specific filter=apps/web/src/pages/HomePage.test.tsx`)
- **THEN** the existing `HomePage.test.tsx` suite passes — assertions on author buttons, titles, and
  counts still hold because the shared `RecipeCard` has the same `<button>` + `<Link>` structure

## REMOVED Requirements

### Requirement: Test environment is unchanged
**Reason**: This was a one-off guard for the D11 deduplication refactor ("only `RecipeListPage.test.tsx` SHALL be modified"). Keeping it would forbid fixing `useRecipeFilters.test.tsx`, which currently asserts the pagination bug, and adding the shared provider test utility and router smoke test required by this change.
**Migration**: None. Test-infrastructure changes are governed by the `web-shared-components` requirement "Every route renders under the app-wide providers" and by the regular review process; the recipe-list tests are updated in place.
