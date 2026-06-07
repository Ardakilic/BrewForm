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
  `tasteNoteIds: string[]` (UUID-validated), `coffeeVarietyId: string`.
- `updateFilter(key: string, value: string | string[])`: sets or
  deletes the URL param; joining arrays with `,`; deleting the `page`
  param so the user lands on page 1.
- `clearAllFilters(): void`: replaces all URL search params with an
  empty object.

The hook SHALL use the same UUID regex as
`apps/web/src/utils/recipe-filters.ts` to validate `tasteNoteIds`
entries.

#### Scenario: updateFilter with empty value deletes the param

- **WHEN** `updateFilter('equipmentId', '')` is called
- **THEN** the `equipmentId` URL param is removed

#### Scenario: updateFilter with array joins with comma

- **WHEN** `updateFilter('tasteNoteIds', ['a', 'b', 'c'])` is called
- **THEN** the `tasteNoteIds` URL param is set to `'a,b,c'`

#### Scenario: updateFilter always resets page

- **WHEN** `updateFilter('brewMethod', 'ESPRESSO')` is called while
  `page=3` is in the URL
- **THEN** the `page` param is removed from the resulting URL

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

### Requirement: Test environment is unchanged

The system SHALL NOT modify `apps/web/vitest.config.ts`,
`apps/web/src/test-setup.ts`, or any other test infrastructure file
as part of this refactor.

Only `apps/web/src/pages/recipes/RecipeListPage.test.tsx` SHALL be
modified — a single import-line update to point at the new
`constants.ts` location. No other test file is modified.

#### Scenario: RecipeListPage test passes after the refactor

- **WHEN** `make test-specific filter=apps/web/src/pages/recipes/RecipeListPage.test.tsx`
  is run
- **THEN** all 23 tests pass with no assertion changes

#### Scenario: StarredRecipesPage test passes after the refactor

- **WHEN** `make test-specific filter=apps/web/src/pages/recipes/StarredRecipesPage.test.tsx`
  is run
- **THEN** all 9 tests pass with no assertion changes

### Requirement: Page wrapper thinness

After this refactor, the two page files SHALL each contain only:

- The page's `loader` (kept verbatim; 401→`/login` redirect stays in
  `StarredRecipesPage`'s loader).
- A `RecipeListPage` / `StarredRecipesPage` component that:
  - Calls `useLoaderData()`.
  - For `RecipeListPage`: holds the variety-search state and
    click-outside effect, builds the `coffeeVarietyFilterSlot`,
    passes `showAdminVisibilityFilter={user?.isAdmin === true}` to
    the view.
  - For `StarredRecipesPage`: checks `isAuthenticated` and renders
    the login-required message before the view when false.
  - Renders `<RecipeListView ... />` with the appropriate props.

`RecipeListPage.tsx` SHALL be at most 120 lines (loader + wrapper +
state). `StarredRecipesPage.tsx` SHALL be at most 80 lines (loader +
wrapper + auth gate).

#### Scenario: RecipeListPage line count is bounded

- **WHEN** `wc -l apps/web/src/pages/recipes/RecipeListPage.tsx` is run
- **THEN** the count is ≤ 120

#### Scenario: StarredRecipesPage line count is bounded

- **WHEN** `wc -l apps/web/src/pages/recipes/StarredRecipesPage.tsx`
  is run
- **THEN** the count is ≤ 80

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
  `log.debug({}, 'RecipeListView unmounted')` is emitted before the
  component is destroyed

