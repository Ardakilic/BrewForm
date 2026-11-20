## ADDED Requirements

### Requirement: The URL is the single source of truth for list navigation selections
Every list or browse page SHALL keep all of its navigation selections (filters, sort, page, tab, and search query) in the URL search parameters and SHALL derive its rendered state from the URL, so that copying the URL reproduces the same view and browser Back/Forward steps through previous selections.

Component state MAY hold only transient input (the text being typed before it is committed) and MAY
NOT be the authority for any selection that affects which data is shown. Accumulating UIs that are
not navigation selections (comment "Load more", the version-compare checkbox selection) are out of
scope.

#### Scenario: Shared link reproduces the view
- **WHEN** a user filters `/recipes` by brew method `v60`, sorts by rating, goes to page 3, and sends the URL to someone else
- **THEN** opening that URL in a fresh session shows page 3 of v60 recipes sorted by rating with the same controls selected

#### Scenario: Back and Forward restore selections
- **WHEN** a user on `/admin/audit-log` selects entity type `recipe`, then goes to page 2, then presses Back twice
- **THEN** the page shows page 2 of `recipe` entries after the first Back and page 1 of all entries after the second

#### Scenario: Reload keeps the view
- **WHEN** a user on `/admin/users?q=ali&page=2` reloads the browser
- **THEN** the search box shows `ali` and page 2 of the matching users is displayed

### Requirement: Filter changes reset the page and page changes preserve filters
Changing any filter, sort, search query or tab SHALL remove the `page` parameter (returning to page 1) while keeping all other selections, and changing the page SHALL set only the `page` parameter while keeping every filter, sort, search query and tab.

#### Scenario: Next page keeps filters
- **WHEN** a user on `/recipes?brewMethod=v60&sortBy=rating` clicks Next
- **THEN** the URL becomes `/recipes?brewMethod=v60&sortBy=rating&page=2` and page 2 is shown

#### Scenario: Filter change returns to page 1
- **WHEN** a user on `/coffee-varieties?category=arabica&page=4` selects category `robusta`
- **THEN** the URL becomes `/coffee-varieties?category=robusta` with no `page` parameter

### Requirement: Text inputs debounce and replace history while typing
Free-text selections (search, author, and similar) SHALL be committed to the URL only after the user has stopped typing for 300 ms, and each commit SHALL replace the current history entry instead of pushing a new one; the input SHALL re-sync from the URL when the URL changes externally (Back/Forward, clear-all, shared link).

Discrete selections (selects, toggles, tab buttons, pagination) SHALL push a history entry so that
Back/Forward step through them. Every search-param update SHALL use `preventScrollReset` where the
page keeps its scroll position.

#### Scenario: Typing does not flood history or the API
- **WHEN** a user types `kenya` into the `/recipes` search box at normal speed
- **THEN** the loader runs once (after the 300 ms pause) and one API request is sent
- **AND** pressing Back once leaves `/recipes` entirely rather than stepping through `k`, `ke`, `ken`, `keny`

#### Scenario: Input follows Back
- **WHEN** a user commits search `kenya`, then selects brew method `v60`, then presses Back
- **THEN** the brew method select is cleared and the search box still shows `kenya`

#### Scenario: Clear-all resets the input
- **WHEN** a user clicks Clear Filters while the search box shows `kenya`
- **THEN** the search box is emptied along with the URL

### Requirement: Loaders and controls share one parser with canonical URLs
Each list page SHALL parse its search parameters with a single shared parser used by both its loader and its controls, SHALL normalise invalid values (non-numeric or non-positive `page`, unknown enum values, malformed UUIDs) to their defaults without throwing, and SHALL omit default values (such as `page=1` or the default sort) from the URL it writes.

#### Scenario: Invalid page is normalised
- **WHEN** a user opens `/brew-logs?page=-3` or `/brew-logs?page=abc`
- **THEN** page 1 is loaded and rendered, and no error page is shown

#### Scenario: Defaults are not written
- **WHEN** a user on `/notifications?unreadOnly=true&page=3` switches the filter to All
- **THEN** the URL becomes `/notifications` with neither `unreadOnly` nor `page`

### Requirement: Paginated lists fetch only the requested page from the server
List pages SHALL forward the URL `page` (and a fixed `perPage`) to the API and render only that server page with `PaginationControls`; they SHALL NOT download the full result set to paginate or filter it in the browser.

The pages whose loaders currently ignore `page` (`/collections`, `/collections/browse`, and the
profile collections tab) SHALL gain URL pagination.

#### Scenario: Public collections are pageable
- **WHEN** there are more public collections than fit on one page and a user clicks Next on `/collections/browse`
- **THEN** the URL becomes `/collections/browse?page=2` and the loader requests `page=2` from the API

#### Scenario: Profile collections tab paginates in the URL
- **WHEN** a user on `/u/alice?tab=collections` goes to the next page
- **THEN** the URL becomes `/u/alice?tab=collections&collectionsPage=2`

### Requirement: All list pages adopt the URL-state contract
The following routes SHALL satisfy the URL-state requirements of this capability using one shared hook (`useListUrlState`) and parser helpers: `/recipes`, `/recipes/starred`, `/equipments`, `/coffee-varieties`, `/taste-notes`, `/notifications`, `/brew-logs`, `/u/:username`, `/collections`, `/collections/browse`, `/admin/users`, `/admin/audit-log`, `/admin/coffee-varieties`, and any admin list that gains pagination.

The hook SHALL live in `apps/web/src/hooks/useListUrlState.ts` with a Vitest suite covering page
preservation, filter reset, debounced replace, external re-sync and canonicalisation. The search
parameter for free-text queries SHALL be named `q` on newly migrated pages; `/recipes` keeps its
existing `search` and `author` names for link compatibility.

#### Scenario: Admin user search is shareable
- **WHEN** an admin searches users for `ali` on `/admin/users`
- **THEN** the URL becomes `/admin/users?q=ali` after the debounce

#### Scenario: Taste-note search is shareable
- **WHEN** a user types `berry` on `/taste-notes`
- **THEN** the URL becomes `/taste-notes?q=berry` (replace) and the filtered hierarchy is shown

#### Scenario: Catalog search no longer pushes per keystroke
- **WHEN** a user types a five-letter query on `/equipments`
- **THEN** at most one history entry is replaced and no entries are pushed
