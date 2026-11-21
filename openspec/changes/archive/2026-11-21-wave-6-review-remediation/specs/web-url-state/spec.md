## ADDED Requirements

### Requirement: Clear-all cancels pending debounced text commits
`clearAll` SHALL cancel every debounced text commit that is still waiting and empty those inputs before it clears the URL, so text typed less than 300 ms before Clear Filters is never written to the URL afterwards, whether or not the URL already had a value for that input.

`useDebouncedUrlText` registers a reset for its pending commit in a module-private set in
`apps/web/src/hooks/useListUrlState.ts` while its timer runs and removes it when the timer fires,
when the URL re-syncs the input, or on unmount; `useListUrlState.clearAll` runs and clears that set
before navigating to the empty query.

#### Scenario: Clear during the typing pause on a URL without a search
- **WHEN** a user on `/equipments` (no `q` in the URL) types `kenya` and clicks Clear Filters within 300 ms
- **THEN** after the pause the URL has no search params and the search box is empty

#### Scenario: Typing after clear-all commits normally
- **WHEN** the same user then types `ali` and pauses
- **THEN** the URL is `?q=ali`

## MODIFIED Requirements

### Requirement: Text inputs debounce and replace history while typing
Free-text selections (search, author, and similar) SHALL be committed to the URL only after the user has stopped typing for 300 ms, and each commit SHALL replace the current history entry instead of pushing a new one; the input SHALL re-sync from the URL when the URL changes externally (Back/Forward, clear-all, shared link).

Discrete selections (selects, toggles, tab buttons, pagination) SHALL push a history entry so that
Back/Forward step through them. Every search-param update SHALL use `preventScrollReset` where the
page keeps its scroll position.

Every search-param update (a debounced commit, a discrete selection or a page change) SHALL build on
the URL as it is when the update runs, never on the URL captured when its callback or timer was
created: the target of a navigation that is still loading on the same path, otherwise the current
URL (`useLatestSearchParams` in `apps/web/src/hooks/useListUrlState.ts`). A debounced commit SHALL be
dropped when a navigation to another path is loading, because the user is leaving the page.

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

#### Scenario: A filter chosen during the typing pause is kept
- **WHEN** a user types `latte` into the `/recipes` search box and selects brew method `v60` within 300 ms
- **THEN** after the pause the URL contains both `search=latte` and `brewMethod=v60`

#### Scenario: Two debounced inputs keep each other's text
- **WHEN** a user types `kenya` into the `/recipes` search box and, within 300 ms, `ali` into the author box
- **THEN** the URL ends with both `search=kenya` and `author=ali`

#### Scenario: Quick selections during a slow load are all kept
- **WHEN** a user selects brew method `v60` and, before its loader has finished, selects sort `rating`
- **THEN** the URL ends with both `brewMethod=v60` and `sortBy=rating`

#### Scenario: Leaving the page drops a pending commit
- **WHEN** a user types `latte` and, within 300 ms, clicks a recipe card whose page is still loading when the pause ends
- **THEN** the user lands on the recipe page and the list URL is not rewritten
