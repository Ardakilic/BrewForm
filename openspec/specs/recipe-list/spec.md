# recipe-list Specification

## Purpose
TBD - created by archiving change d11-recipe-list-deduplication. Update Purpose after archive.
## Requirements
### Requirement: Shared recipe-list view component

The system SHALL provide a single `RecipeListView` component in
`apps/web/src/components/recipe-list/RecipeListView.tsx` that renders the
recipe-list filter sidebar, active-filter badges, equipment dropdowns,
taste-note filter, sort selector, recipe grid, and pagination controls.

The component SHALL accept the following props:

- `source: 'all' | 'starred'` — required; controls the four
  per-source behavioural branches.
- `recipesResponse: { data: RecipeListItem[]; meta: { pagination?: { total?: number } } }`
  — required; the loader's response.
- `equipment: EquipmentListItem[]` — required; list of equipment used to
  build the per-type dropdowns.
- `tasteNotes: TasteNoteFlatItem[]` — required; list of taste notes used
  to populate the multi-select filter.
- `showAdminVisibilityFilter?: boolean` — optional, default `false`; when
  `true`, renders an additional visibility dropdown.
- `coffeeVarietyFilterSlot?: ReactNode` — optional; when provided,
  rendered as a `FilterField` between the taste-notes filter and the
  sort selector.
- `emptyMessageKey?: string` — optional, default `'recipe.list.noResults'`;
  the i18n key used when the loader returns zero recipes.

The component MUST NOT perform any data fetching. All data is passed
in via props from the page-level `loader`.

#### Scenario: Page wrapper renders the view with all required props

- **WHEN** `RecipeListPage` mounts and its `loader` resolves
- **THEN** the page renders `<RecipeListView source='all' ... />` with
  `recipesResponse`, `equipment`, and `tasteNotes` from
  `useLoaderData()`

#### Scenario: Starred page wrapper renders the view

- **WHEN** `StarredRecipesPage` mounts, its `loader` resolves, and the
  user is authenticated
- **THEN** the page renders `<RecipeListView source='starred' ... />`
  with `emptyMessageKey='recipe.starred.noResults'`

#### Scenario: Unauthenticated user on starred page does not see the view

- **WHEN** `StarredRecipesPage` mounts and `useAuth().isAuthenticated`
  is `false`
- **THEN** the page renders the `recipe.starred.loginRequired` message
  and does NOT render `RecipeListView`

### Requirement: Equipment dropdowns driven by the shared module

The system SHALL render one filter dropdown per equipment type in
`EQUIPMENT_FILTER_TYPES` for which at least one equipment item exists.

The list of equipment types SHALL be exported from
`apps/web/src/components/recipe-list/constants.ts` as
`EQUIPMENT_FILTER_TYPES`, an `as const` array of 17 entries in the
following order:

1. `espresso_machine`
2. `grinder`
3. `pour_over_brewer`
4. `immersion_brewer`
5. `kettle`
6. `milk_tool`
7. `scale_accessory`
8. `roaster`
9. `portafilter`
10. `basket`
11. `puck_screen`
12. `paper_filter`
13. `tamper`
14. `mesh_filter`
15. `cezve`
16. `thermometer`
17. `other`

The human-readable label for each type SHALL be obtained from
`EQUIPMENT_TYPE_LABELS`, re-exported from
`@brewform/shared/constants`. The new module SHALL NOT define a
duplicate object literal.

#### Scenario: All 17 types are rendered on /recipes when equipment items exist

- **WHEN** `RecipeListPage` renders and `equipment` contains at least
  one item for each of the 17 types
- **THEN** the sidebar shows 17 dropdowns, each labelled with its
  shared label, including `'Pour-Over & Filter Brewer'` and
  `'Immersion & Pressure Brewer'`

#### Scenario: Empty types are skipped

- **WHEN** `equipment` contains items only for `kettle` and
  `scale_accessory`
- **THEN** the sidebar shows exactly two dropdowns with the labels
  `'Kettle'` and `'Scale & Accessory'`

#### Scenario: Equipment filter is identical between both pages

- **WHEN** the same `equipment` array is provided to
  `RecipeListView` with `source='all'` and with `source='starred'`
- **THEN** both render identical equipment dropdown sets and labels

### Requirement: Taste-note filter with consistent badge label

The view SHALL render the taste-note multi-select filter inside a
`FilterField` labelled with `t('recipe.list.tasteNotesFilter')` (plural
key) regardless of `source`.

The view SHALL render one active-filter badge per selected
`tasteNoteId` in the URL search params, each labelled
`t('recipe.list.tasteNotesFilter')` (plural) and using
`t('recipe.list.tasteNoteFilterActive')` (singular) as the value
fallback when the resolved taste note name is not in the loaded list.

#### Scenario: Plural i18n key used on the starred page

- **WHEN** `StarredRecipesPage` renders with `tasteNoteIds=...` in the
  URL
- **THEN** the active-filter badge label is the plural key
  `recipe.list.tasteNotesFilter` (NOT the singular
  `recipe.list.tasteNoteFilter`)

#### Scenario: Badge fallback uses the singular key

- **WHEN** the `tasteNoteIds` URL param resolves to a UUID that is not
  present in the loaded `tasteNotes` array
- **THEN** the active-filter badge value falls back to
  `t('recipe.list.tasteNoteFilterActive')`

### Requirement: Source-driven loading and pagination fallbacks

The view SHALL branch on `source` to resolve the loading-state
component and the `total` fallback when pagination metadata is
absent:

| Concern | `source='all'` | `source='starred'` |
|---|---|---|
| Main-area loading state | `<RecipeCardSkeletonGrid />` | Plain `{t('common.loading')}` text |
| `total` fallback | `recipes.length` | `0` |
| Navigation path check (loading detection) | Dynamic via `location.pathname` | Dynamic via `location.pathname` |

#### Scenario: All page shows skeleton during load

- **WHEN** the navigation state is `'loading'` and
  `navigation.location?.pathname === location.pathname` on
  `/recipes`
- **THEN** the view renders `<RecipeCardSkeletonGrid />`

#### Scenario: Starred page shows text during load

- **WHEN** the navigation state is `'loading'` and
  `navigation.location?.pathname === location.pathname` on
  `/recipes/starred`
- **THEN** the view renders `{t('common.loading')}` text

#### Scenario: Pagination absent on the all page

- **WHEN** `recipesResponse.meta.pagination` is undefined and
  `source='all'`
- **THEN** `total` falls back to `recipes.length`

#### Scenario: Pagination absent on the starred page

- **WHEN** `recipesResponse.meta.pagination` is undefined and
  `source='starred'`
- **THEN** `total` falls back to `0`

### Requirement: Admin visibility filter is opt-in

The view SHALL render the visibility dropdown (using
`VISIBILITY_STATES_LIST` from `@brewform/shared/constants`) ONLY when
`showAdminVisibilityFilter === true`. When rendered, it is placed
between the drink-type dropdown and the equipment dropdowns.

When the visibility filter is rendered, it SHALL be included in the
`hasActiveFilters` computation; otherwise it SHALL NOT.

#### Scenario: Admin user sees the visibility filter on the all page

- **WHEN** `RecipeListPage` renders with `user.isAdmin === true`
- **THEN** the view receives `showAdminVisibilityFilter={true}` and
  renders the visibility dropdown

#### Scenario: Non-admin user does not see the visibility filter

- **WHEN** `RecipeListPage` renders with `user.isAdmin` falsy
- **THEN** the view receives `showAdminVisibilityFilter={false}` and
  does not render the visibility dropdown

#### Scenario: Starred page never shows the visibility filter

- **WHEN** `StarredRecipesPage` renders
- **THEN** the view receives `showAdminVisibilityFilter={false}`
  regardless of `user.isAdmin`

### Requirement: Coffee-variety filter slot

When the `coffeeVarietyFilterSlot` prop is provided, the view SHALL
render it as a sibling of the taste-notes filter, immediately above
the sort selector. When the prop is omitted, the slot is not
rendered.

The slot's contents (state machinery, API calls, dropdown UI) are
owned by the calling page wrapper; the view SHALL NOT inspect or
modify the slot's internals.

#### Scenario: All page provides the slot

- **WHEN** `RecipeListPage` renders
- **THEN** the view receives a `coffeeVarietyFilterSlot` element and
  renders it between the taste-notes filter and the sort selector

#### Scenario: Starred page does not provide the slot

- **WHEN** `StarredRecipesPage` renders
- **THEN** the view does not receive `coffeeVarietyFilterSlot` and
  does not render a coffee-variety filter

### Requirement: Active-filter badges and clear behaviour

The view SHALL render active-filter badges in the following fixed
order:

1. Equipment (when `equipmentId` is a valid UUID in the URL)
2. Main Brewer (when `mainBrewer` is non-empty)
3. One badge per `tasteNoteId` in the URL
4. Coffee Variety (when `coffeeVarietyFilterSlot` is provided AND
   `coffeeVarietyId` is a valid UUID in the URL)

The view SHALL render a "Clear Filters" button labelled
`t('recipe.list.clearFilters')` whenever `hasActiveFilters` is true.
Clicking the button SHALL call `clearAllFilters()`, which clears
every URL search param.

`hasActiveFilters` SHALL be `true` when ANY of the following is
present in the URL:

- `brewMethod` non-empty
- `drinkType` non-empty
- `equipmentId` is a valid UUID
- `mainBrewer` non-empty
- `tasteNoteIds` non-empty
- `coffeeVarietyId` is a valid UUID
- `search` non-empty
- `visibility` non-empty AND `showAdminVisibilityFilter === true`

#### Scenario: Clear Filters button removes every URL param

- **WHEN** the user clicks the Clear Filters button
- **THEN** the URL search params are replaced with an empty set

#### Scenario: Coffee variety badge never renders on the starred page

- **WHEN** `StarredRecipesPage` renders with `coffeeVarietyId` in
  the URL
- **THEN** the badge list contains no coffee-variety entry (because
  the slot is not provided)

#### Scenario: Coffee variety badge renders on the all page

- **WHEN** `RecipeListPage` renders with `coffeeVarietyId` set to a
  valid UUID in the URL
- **THEN** the badge list contains the coffee-variety entry

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

### Requirement: Module barrel and re-exports

The system SHALL provide a barrel `index.ts` in
`apps/web/src/components/recipe-list/index.ts` that re-exports:

- `RecipeListView` (component) and `RecipeListViewProps` (type)
- `FilterField` (component)
- `ActiveFilterBadge` (component)
- `RecipeCard` (component)
- `PaginationControls` (component)
- `useRecipeFilters` (hook)
- `EQUIPMENT_FILTER_TYPES` and `EQUIPMENT_TYPE_LABELS` (constants)
- `EquipmentFilterType` (type)

`EQUIPMENT_TYPE_LABELS` SHALL be re-exported from
`@brewform/shared/constants` — no copy, no override.

#### Scenario: Test imports from the new location resolve

- **WHEN** `RecipeListPage.test.tsx` imports
  `{ EQUIPMENT_FILTER_TYPES, EQUIPMENT_TYPE_LABELS }` from
  `'../../components/recipe-list/constants.ts'`
- **THEN** Vitest resolves the module and the imports succeed

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

### Requirement: Logging in the new module

The view SHALL emit a `log.debug` event on mount with the resolved
`source`, and a `log.debug` event on unmount. The log namespace
SHALL be `'RecipeListView'`. The two page wrappers SHALL each
continue to emit mount/unmount `log.debug` events under their
existing namespaces (`'RecipeListPage'` and `'StarredRecipesPage'`).

This satisfies the AGENTS.md "Logging" rule that every page-level
component has mount/unmount logs.

#### Scenario: View mount log fires once

- **WHEN** `RecipeListView` mounts (after the page's `loader`
  resolves)
- **THEN** a single `log.debug({ source: 'all' | 'starred' }, 'RecipeListView mounted')`
  is emitted

#### Scenario: View unmount log fires on unmount

- **WHEN** the user navigates away from the list page
- **THEN** a single
  `log.debug({ source: 'all' | 'starred' }, 'RecipeListView unmounted')` is emitted before the
  component is destroyed

### Requirement: Feed route accepts cursor without polluting PaginationSchema

The `GET /api/v1/follow/feed` route SHALL switch from `PaginationSchema` (only `page`/`perPage`) to a
local inline schema that includes `cursor`, so that the shared `PaginationSchema` in
`packages/shared/src/schemas/common.ts` remains unchanged and the 10 other endpoints that use it
are unaffected:

```typescript
zValidator('query', z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  cursor: z.string().optional(),
})),
```

The `PaginationSchema` in `packages/shared/src/schemas/common.ts` SHALL remain unchanged
(no cursor field added).

#### Scenario: Feed route accepts cursor parameter

- **WHEN** `GET /api/v1/follow/feed?cursor=eyJ...&perPage=10` is called
- **THEN** the query passes Zod validation and reaches the route handler
- **AND** cursor-based pagination is used

#### Scenario: Feed route still works with page/perPage only (backward compatible)

- **WHEN** `GET /api/v1/follow/feed?page=1&perPage=10` is called
- **THEN** offset-based pagination is used (unchanged behavior)

---

### Requirement: Recipe model `getFeed()` supports cursor parameter

The `getFeed(authorIds, page, perPage)` function in `apps/api/src/modules/recipe/model.ts` SHALL
be extended to accept an optional `cursor` parameter and dispatch to `findCursor()` when present.

The follow service `getFeed(userId, page, perPage)` in `apps/api/src/modules/follow/service.ts`
SHALL pass the cursor through to the recipe model layer.

#### Scenario: Feed with cursor uses cursor-based query

- **WHEN** `follow/service.getFeed(userId, page, perPage, cursor)` is called with a valid cursor
- **THEN** the query uses `recipeModel.findCursor()` instead of `recipeModel.findMany()`
- **AND** the result includes `nextCursor` and `hasMore`

---

### Requirement: Starred recipes route uses offset pagination only (deferred)

The `GET /recipes/starred` route SHALL continue to use offset pagination exclusively.
The `findStarred()` function in `apps/api/src/modules/recipe/model.ts` SHALL NOT be
modified in this change.

If a `cursor` parameter is sent to the starred route, it SHALL be silently ignored and
offset pagination SHALL be used. A debug log SHALL be emitted: `log.debug('Cursor provided but starred recipes use offset pagination, using offset')`.

Cursor pagination for starred recipes is deferred to a follow-up change because:
- `findStarred()` has a separate inline offset implementation with a favourites subquery
- The starred query involves a JOIN with the `favourites` table, which adds complexity to cursor ordering
- No user-facing demand for cursor pagination on starred lists yet

#### Scenario: Cursor param on starred route falls back to offset

- **WHEN** `GET /api/v1/recipes/starred?cursor=eyJ...` is called
- **THEN** offset pagination is used with `page=1, perPage=20` defaults
- **AND** the response contains `meta.pagination` (not `meta.cursor`)
- **AND** a debug log is emitted

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

