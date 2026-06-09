# optimistic-rollback Specification

## Purpose
TBD - created by archiving change d18-fix-optimistic-rollback. Update Purpose after archive.
## Requirements
### Requirement: Resource route actions return error data instead of throwing

All three resource route actions (like, favourite, follow) SHALL return a plain JavaScript object `{ ok: false, error: string }` on any failure instead of throwing an `Error` or `Response`. On success, they SHALL return `{ ok: true }` instead of `null`.

This includes the following failure cases:
- Invalid or missing route parameters (`params.id`, `params.userId`)
- API errors from the backend (`ApiError` with `code`, `message`, `status`)
- Network errors (e.g., `TypeError: Failed to fetch`)
- Unknown error types (non-`Error` values thrown)

#### Scenario: Invalid parameter returns error object

- **WHEN** `likeAction` is called with an empty or missing `params.id`
- **THEN** the action SHALL return `{ ok: false, error: 'Missing or invalid route parameter: id' }`
- **AND** the action SHALL NOT throw a `Response` or `Error`

#### Scenario: API failure returns error object

- **WHEN** `recipeApi.like(id)` throws an `ApiError` with message "Internal server error"
- **THEN** `likeAction` SHALL return `{ ok: false, error: 'Internal server error' }`
- **AND** the action SHALL NOT re-throw the error

#### Scenario: Network failure returns error object

- **WHEN** `recipeApi.favourite(id)` throws a `TypeError: Failed to fetch`
- **THEN** `favouriteAction` SHALL return `{ ok: false, error: 'Failed to fetch' }`
- **AND** the action SHALL NOT re-throw the error

#### Scenario: Success returns ok object

- **WHEN** `followApi.follow(userId)` resolves successfully
- **THEN** `followAction` SHALL return `{ ok: true }`
- **AND** the action SHALL NOT return `null`

#### Scenario: Unknown error type returns fallback message

- **WHEN** an API call throws a non-Error value (e.g., a primitive string)
- **THEN** the action SHALL return `{ ok: false, error: '<Action> failed' }` with an action-specific fallback message
- **AND** the action SHALL NOT re-throw

### Requirement: Actions log structured entry, exit, and error events

Each resource route action SHALL log structured events via a module-scoped `createLogger` instance:

- **Entry** (debug): On action start, SHALL log `{ id }` or `{ userId, method }` with the message `"<actionName> started"`
- **Exit** (debug): On successful completion, SHALL log `{ id }` or `{ userId }` with the message `"<actionName> completed"`
- **Error** (error): On failure, SHALL log `{ err, id }` or `{ err, userId }` with the message `"<actionName> failed"`

Each file SHALL create exactly one module-scoped logger at the top level via `const logger = createLogger('<module-name>')`.

#### Scenario: Like action logs entry and success

- **WHEN** `likeAction` is called with a valid `params.id` and the API succeeds
- **THEN** `logger.debug({ id }, 'likeAction started')` SHALL be called before the API call
- **AND** after API success, `logger.debug({ id }, 'likeAction completed')` SHALL be called before returning

#### Scenario: Like action logs entry and error

- **WHEN** `likeAction` is called and the API fails with an `ApiError`
- **THEN** `logger.debug({ id }, 'likeAction started')` SHALL be called before the API call
- **AND** `logger.error({ err, id }, 'likeAction failed')` SHALL be called before returning the error object

#### Scenario: Favourite action logs entry and success

- **WHEN** `favouriteAction` is called with a valid `params.id` and the API succeeds
- **THEN** `logger.debug({ id }, 'favouriteAction started')` SHALL be called before the API call
- **AND** after API success, `logger.debug({ id }, 'favouriteAction completed')` SHALL be called before returning

#### Scenario: Favourite action logs entry and error

- **WHEN** `favouriteAction` is called and the API fails with a network error
- **THEN** `logger.debug({ id }, 'favouriteAction started')` SHALL be called before the API call
- **AND** `logger.error({ err, id }, 'favouriteAction failed')` SHALL be called before returning the error object

#### Scenario: Follow action logs entry and success

- **WHEN** `followAction` is called with a valid `params.userId` and the API succeeds
- **THEN** `logger.debug({ userId, method: request.method }, 'followAction started')` SHALL be called before the API call
- **AND** after API success, `logger.debug({ userId }, 'followAction completed')` SHALL be called before returning

#### Scenario: Follow action logs entry and error

- **WHEN** `followAction` is called with a valid `params.userId` and the API fails
- **THEN** `logger.debug({ userId, method: request.method }, 'followAction started')` SHALL be called before the API call
- **AND** `logger.error({ err, userId }, 'followAction failed')` SHALL be called before returning the error object

### Requirement: Optimistic UI rollback on action failure

When a resource route action accessed via `useFetcher` returns `{ ok: false, error: '...' }` (does not throw), the following SHALL occur:

1. `fetcher.formData` SHALL clear to `null`
2. `fetcher.state` SHALL transition to `'idle'`
3. `fetcher.data` SHALL be set to the returned `{ ok: false, error: '...' }`
4. The root `RootErrorBoundary` SHALL NOT be triggered
5. The page SHALL remain fully usable (navbar, layout, all content visible)
6. React Router SHALL proceed with loader revalidation (action returned normally, not threw)

On success (action returns `{ ok: true }`):

1. `fetcher.formData` SHALL clear to `null`
2. `fetcher.state` SHALL transition to `'idle'`
3. `fetcher.data` SHALL be set to `{ ok: true }`
4. React Router SHALL revalidate loaders
5. The button components SHALL show the original state from props until loader revalidation delivers updated data

#### Scenario: Like button reverts on API failure

- **WHEN** a user clicks the Like button (optimistic state shows heart filled, count incremented by +1)
- **AND** `likeAction` returns `{ ok: false, error: 'server error' }`
- **THEN** the Like button SHALL revert to its pre-click state (heart/color from `initialLiked`, count from `initialCount`)
- **AND** the button SHALL NOT remain disabled
- **AND** the full page (Layout, navbar) SHALL remain visible

#### Scenario: Favourite button reverts on API failure

- **WHEN** a user clicks the Favourite button (optimistic state shows star filled, count incremented by +1)
- **AND** `favouriteAction` returns `{ ok: false, error: 'server error' }`
- **THEN** the Favourite button SHALL revert to its pre-click state (`initialFavourited` star, `initialCount`)
- **AND** the button SHALL NOT remain disabled
- **AND** the full page SHALL remain visible

#### Scenario: Follow button reverts on API failure

- **WHEN** a user clicks the Follow button (optimistic state shows "Following")
- **AND** `followAction` returns `{ ok: false, error: 'server error' }`
- **THEN** the Follow button SHALL revert to showing "Follow" (from `initialFollowing`)
- **AND** the button SHALL NOT remain disabled
- **AND** the full page SHALL remain visible

#### Scenario: Loader revalidation proceeds after action error return

- **WHEN** an action accessed via `useFetcher` returns `{ ok: false, error: '...' }` (plain object, not a thrown Response)
- **THEN** React Router SHALL revalidate loaders for the current route
- **AND** the parent page's loader data SHALL be refreshed with confirmed server state

#### Scenario: Fetcher data contains actionable error object on failure

- **WHEN** an action accessed via `useFetcher` returns `{ ok: false, error: 'server error' }`
- **THEN** `fetcher.data` SHALL be an object with both `ok` and `error` properties
- **AND** `'error' in fetcher.data` SHALL evaluate to `true`
- **AND** consumers SHALL be able to branch on `fetcher.data.ok === false` for inline error display

### Requirement: Error path test coverage for button components

Each button component test file SHALL include a test case that verifies the error rollback path. The test SHALL:

1. Mount the component inside a `createMemoryRouter` with a resource route action that returns `{ ok: false, error: 'server error' }`
2. Simulate a user click on the button using `userEvent.setup()`
3. Assert that after the action settles, the button is not disabled (fetcher transitioned to idle) using `waitFor`
4. Assert that the button displays the initial count or state (not stuck in the optimistic state)

For LikeButton and FavouriteButton, no `fetcher.data` consumer logic exists, so the test SHALL only verify visual state (count, disabled state) after error.

For FollowButton, the error rollback test SHALL additionally verify that the `onToggleRollback` callback (if provided as a `vi.fn()` mock) is called with the `initialFollowing` value after the action returns an error. The test SHALL create a separate `createMemoryRouter` with the error-returning action and SHALL NOT reuse the shared `renderWithRouter` helper (which uses a hanging action).

#### Scenario: LikeButton error rollback test

- **WHEN** a test renders `LikeButton` with `initialLiked=false, initialCount=3` inside a router where the `recipes/:id/like` action returns `{ ok: false, error: 'server error' }`
- **AND** the simulated user clicks the button
- **THEN** after the action settles (`waitFor`), the button SHALL NOT be disabled
- **AND** the button textContent SHALL contain "3" (the original count, NOT the optimistically incremented "4")

#### Scenario: FavouriteButton error rollback test

- **WHEN** a test renders `FavouriteButton` with `initialFavourited=false, initialCount=5` inside a router where the `recipes/:id/favourite` action returns `{ ok: false, error: 'server error' }`
- **AND** the simulated user clicks the button
- **THEN** after the action settles, the button SHALL NOT be disabled
- **AND** the button textContent SHALL contain "5" (the original count)

#### Scenario: FollowButton error rollback test (visual)

- **WHEN** a test renders `FollowButton` with `userId='user-1', initialFollowing=false` inside a router where the `follow/:userId` action returns `{ ok: false, error: 'server error' }`
- **AND** the simulated user clicks the button
- **THEN** after the action settles, the button SHALL NOT be disabled
- **AND** the button textContent SHALL be "Follow" (the original state, NOT "Following" or "...")

#### Scenario: FollowButton onToggleRollback callback fires on error

- **WHEN** a test renders `FollowButton` with `userId='user-1', initialFollowing=false, onToggleRollback={vi.fn()}` inside a router where the action returns `{ ok: false, error: 'server error' }`
- **AND** the simulated user clicks the button
- **THEN** after the action settles, the `onToggleRollback` mock SHALL have been called exactly once with `false` (the `initialFollowing` value)
- **AND** the `onToggle` mock (if provided) SHALL NOT have been called

### Requirement: Success path test coverage for button components

Each button component test file SHALL include a test case that verifies the action success path (action returns `{ ok: true }`). The test SHALL:

1. Mount the component inside a `createMemoryRouter` with a resource route action that returns `{ ok: true }`
2. Simulate a user click on the button using `userEvent.setup()`
3. Assert that after the action settles, the button is not disabled (fetcher lifecycle completed normally)
4. Assert that the button is functional — not stuck in an error or pending state

For FollowButton, the success path test SHALL additionally verify:

- When `onToggle` callback is provided as a `vi.fn()` mock, it SHALL be called exactly once with the correct new following value (`true` when following was initially `false`, `false` when following was initially `true`)
- When `onToggleRollback` callback is provided, it SHALL NOT be called on success

Each test SHALL create its own `createMemoryRouter` with the appropriate action and SHALL NOT reuse the shared `renderWithRouter` helper (which uses a hanging action that never settles).

#### Scenario: LikeButton success path test

- **WHEN** a test renders `LikeButton` with `initialLiked=false, initialCount=3` inside a router where the `recipes/:id/like` action returns `{ ok: true }`
- **AND** the simulated user clicks the button
- **THEN** after the action settles, the button SHALL NOT be disabled
- **AND** the button textContent SHALL contain "3" (original count; loader revalidation would update this in production but the test router has no loader)

#### Scenario: FavouriteButton success path test

- **WHEN** a test renders `FavouriteButton` with `initialFavourited=false, initialCount=5` inside a router where the `recipes/:id/favourite` action returns `{ ok: true }`
- **AND** the simulated user clicks the button
- **THEN** after the action settles, the button SHALL NOT be disabled
- **AND** the button textContent SHALL contain "5"

#### Scenario: FollowButton success path test (visual)

- **WHEN** a test renders `FollowButton` with `userId='user-1', initialFollowing=false` inside a router where the `follow/:userId` action returns `{ ok: true }`
- **AND** the simulated user clicks the button
- **THEN** after the action settles, the button SHALL NOT be disabled
- **AND** the button textContent SHALL be "Follow" (fetcher.formData cleared, falls back to initialFollowing=false)

#### Scenario: FollowButton onToggle callback fires on successful follow

- **WHEN** a test renders `FollowButton` with `userId='user-1', initialFollowing=false, onToggle={vi.fn()}` inside a router where the `follow/:userId` action returns `{ ok: true }`
- **AND** the simulated user clicks the button
- **THEN** after the action settles, the `onToggle` mock SHALL have been called exactly once with `true` (the new following state)
- **AND** the `onToggleRollback` mock (if provided) SHALL NOT have been called

#### Scenario: FollowButton onToggle callback fires on successful unfollow

- **WHEN** a test renders `FollowButton` with `userId='user-1', initialFollowing=true, onToggle={vi.fn()}` inside a router where the `follow/:userId` action returns `{ ok: true }`
- **AND** the simulated user clicks the button
- **THEN** after the action settles, the `onToggle` mock SHALL have been called exactly once with `false` (the new following state)
- **AND** the button textContent SHALL be "Following" (fetcher.formData cleared, falls back to initialFollowing=true)

#### Scenario: FollowButton onToggle not called on error

- **WHEN** a test renders `FollowButton` with `initialFollowing=false, onToggle={vi.fn()}, onToggleRollback={vi.fn()}` and an action that returns `{ ok: false, error: 'server error' }`
- **AND** the simulated user clicks the button
- **THEN** after the action settles, `onToggle` SHALL NOT have been called
- **AND** `onToggleRollback` SHALL have been called exactly once with `false`

#### Scenario: FollowButton duplicate click while loading is ignored

- **WHEN** a test renders `FollowButton` with `initialFollowing=false` and an action that returns `{ ok: true }`
- **AND** the simulated user rapidly clicks the button twice
- **THEN** after the action settles, the button SHALL NOT be disabled
- **AND** the button textContent SHALL be "Follow" (the original state)

