# optimistic-rollback Specification

## Purpose

Defines how the like, favourite and follow buttons handle failure. Their resource-route actions
return `{ ok, error }` result objects instead of throwing and log structured entry, exit and error
events, and the buttons roll back their optimistic state when an action fails. Component tests cover
both the success and the error paths.
## Requirements
### Requirement: Resource route actions return error data instead of throwing

The four resource route actions for recipe social state (like, favourite, rate, follow) SHALL return a plain JavaScript object `{ ok: false, error: string, code?: string }` on any failure instead of throwing an `Error` or `Response`, built with `toActionFailure(err, [])` (which rethrows only an aborted request), and SHALL return `{ ok: true, ...state }` on success (`liked`, `favourited`, `following`, or the rate result `rating`, `avgRating` and `ratingCount`).

This includes the following failure cases:
- Invalid or missing route parameters (`params.id`, `params.userId`) or an invalid rating value
- API errors from the backend (`ApiError` with `code`, `message`, `status`), including a final 401, which returns `code: 'UNAUTHORIZED'` and never redirects
- Network errors (e.g., `TypeError: Failed to fetch`)
- Unknown error types (non-`Error` values thrown)

A failed toggle (like, favourite, follow) SHALL also return the state the user had before the click
(`liked`, `favourited` or `following`: the opposite of the submitted value, or for follow the state
implied by the method), so the button falls back to the last confirmed state. The follow action
SHALL treat a 409 on follow (already following) as `{ ok: true, following: true }` and a 404 on
unfollow (not following) as `{ ok: true, following: false }`. Each action SHALL pass
`request.signal` to its API call.

#### Scenario: Invalid parameter returns error object

- **WHEN** `likeAction` is called with an empty or missing `params.id`
- **THEN** the action SHALL return `{ ok: false, error: 'Missing or invalid route parameter: id' }`
- **AND** the action SHALL NOT throw a `Response` or `Error`

#### Scenario: API failure returns error object

- **WHEN** a user who has liked a recipe submits an unlike (`liked=false`) and `recipeApi.like(id)` throws an `ApiError` with code `INTERNAL_ERROR` and message "Internal server error"
- **THEN** `likeAction` SHALL return `{ ok: false, error: 'Internal server error', code: 'INTERNAL_ERROR', liked: true }`
- **AND** the action SHALL NOT re-throw the error

#### Scenario: Network failure returns error object

- **WHEN** `recipeApi.favourite(id)` throws a `TypeError: Failed to fetch` for a `favourited=true` submission
- **THEN** `favouriteAction` SHALL return `{ ok: false, error: 'Failed to fetch', favourited: false }`
- **AND** the action SHALL NOT re-throw the error

#### Scenario: A failed rating returns error data

- **WHEN** `recipeApi.rate(id, 8)` rejects with an `ApiError` 429 `RATE_LIMITED`
- **THEN** `rateAction` SHALL return `{ ok: false, error, code: 'RATE_LIMITED', retryAfterSeconds }` and SHALL NOT throw

#### Scenario: Success returns ok object

- **WHEN** `followApi.follow(userId)` resolves successfully
- **THEN** `followAction` SHALL return `{ ok: true, following: true }`
- **AND** the action SHALL NOT return `null`

#### Scenario: Follow is idempotent

- **WHEN** `followApi.follow(userId)` rejects with a 409 `CONFLICT`, or `followApi.unfollow(userId)` rejects with a 404
- **THEN** `followAction` SHALL return `{ ok: true, following: true }` or `{ ok: true, following: false }` respectively

#### Scenario: Unknown error type returns fallback message

- **WHEN** an API call throws a non-Error value (e.g., a primitive string)
- **THEN** the action SHALL return `{ ok: false, error: 'Request failed' }`, plus the previous state for a toggle
- **AND** the action SHALL NOT re-throw

### Requirement: Actions log structured entry, exit, and error events

Each resource route action (like, favourite, rate, follow) SHALL wrap its API call in `withDataLog(logger, '<actionName>', ids, fn)` (`apps/web/src/routes/data-logging.ts`), which logs:

- **Entry** (debug): `{ id }` (`{ id, rating }` for rate) or `{ userId, method }` with the message `"<actionName> started"`
- **Exit** (debug): the same ids with the message `"<actionName> completed"`
- **Error** (error): `{ err, ...ids }` with the message `"<actionName> failed"`; an aborted request is not logged as an error

Each file SHALL create exactly one module-scoped logger at the top level via `const logger = createLogger('<module-name>')`. Invalid input SHALL be logged at `debug` with ids only and SHALL NOT reach the API.

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

#### Scenario: Rate action logs entry and error

- **WHEN** `rateAction` is called with a valid id and rating and the API fails
- **THEN** `logger.debug({ id, rating }, 'rateAction started')` and `logger.error({ err, id, rating }, 'rateAction failed')` SHALL be called

#### Scenario: Follow action logs entry and success

- **WHEN** `followAction` is called with a valid `params.userId` and the API succeeds
- **THEN** `logger.debug({ userId, method: request.method }, 'followAction started')` SHALL be called before the API call
- **AND** after API success, `logger.debug({ userId, method: request.method }, 'followAction completed')` SHALL be called before returning

#### Scenario: Follow action logs entry and error

- **WHEN** `followAction` is called with a valid `params.userId` and the API fails with a status other than the idempotent 409/404
- **THEN** `logger.debug({ userId, method: request.method }, 'followAction started')` SHALL be called before the API call
- **AND** `logger.error({ err, userId, method: request.method }, 'followAction failed')` SHALL be called before returning the error object

### Requirement: Optimistic UI rollback on action failure

When a resource route action accessed via `useFetcher` returns `{ ok: false, error: '...' }` (does not throw), the following SHALL occur:

1. `fetcher.formData` SHALL clear to `null`
2. `fetcher.state` SHALL transition to `'idle'`
3. `fetcher.data` SHALL be set to the returned `{ ok: false, error, ... }`
4. Neither the root `RootErrorBoundary` nor the route `errorElement` SHALL be triggered
5. The page SHALL remain fully usable (navbar, layout, all content visible)
6. The button SHALL show the last confirmed state: the pre-click state the failed action returns, which is the last successful result or, when there was none, the loader's `initial*` value
7. An error toast SHALL be shown through `useActionFeedback` (`error.unauthorized` for the `UNAUTHORIZED` code)
8. The recipe detail loader SHALL NOT be revalidated, because the failed action changed nothing

On success (action returns `{ ok: true, ... }`):

1. `fetcher.formData` SHALL clear to `null`
2. `fetcher.state` SHALL transition to `'idle'`
3. `fetcher.data` SHALL be set to the returned object, and the like, favourite and follow buttons SHALL show the state it carries without a loader revalidation (they submit with `defaultShouldRevalidate: false`)

The interactive rating SHALL follow the same rule: while the rate action is pending it shows the
submitted value; when it settles with `{ ok: false }` it shows the saved rating from the loader again;
on `{ ok: true }` it shows the value from the revalidated loader. `StarRating` drops its unsaved
(committed, not yet saved) stars on each new settled action result it receives (the fetcher's
`data`) while not busy, rather than on a rendered `busy` true → false transition, so a failure that
settles at once, before a busy render is committed, also rolls back.

#### Scenario: Like button reverts on API failure

- **WHEN** a user clicks the Like button (optimistic state shows heart filled, count incremented by +1)
- **AND** `likeAction` returns `{ ok: false, error: 'server error', liked: false }`
- **THEN** the Like button SHALL revert to its pre-click state (not liked, count from `initialCount`)
- **AND** the button SHALL NOT remain disabled, an error toast SHALL be shown, and the full page (Layout, navbar) SHALL remain visible

#### Scenario: A failed unlike keeps the confirmed like

- **WHEN** a user likes a recipe (`{ ok: true, liked: true }`) and then clicks again to unlike, and the unlike fails
- **THEN** the Like button SHALL show liked with the incremented count, not the loader's `initialLiked`

#### Scenario: Favourite button reverts on API failure

- **WHEN** a user clicks the Favourite button (optimistic state shows star filled, count incremented by +1)
- **AND** `favouriteAction` returns `{ ok: false, error: 'server error', favourited: false }`
- **THEN** the Favourite button SHALL revert to its pre-click state (`☆`, `initialCount`)
- **AND** the button SHALL NOT remain disabled
- **AND** the full page SHALL remain visible

#### Scenario: Follow button reverts on API failure

- **WHEN** a user clicks the Follow button (optimistic state shows the `follow.followingState` text)
- **AND** `followAction` returns `{ ok: false, error: 'server error', following: false }`
- **THEN** the Follow button SHALL revert to showing the `follow.follow` text
- **AND** the button SHALL NOT remain disabled, an error toast SHALL be shown, and the full page SHALL remain visible

#### Scenario: A failed unfollow keeps the confirmed follow

- **WHEN** a user follows (`{ ok: true, following: true }`) and then the unfollow fails
- **THEN** the Follow button SHALL show "Following", and the next click SHALL send an unfollow (DELETE), not a follow

#### Scenario: A failed rating restores the saved rating

- **WHEN** a user whose saved rating is 6 commits 8 and the rate action returns `{ ok: false }`
- **THEN** the rating slider SHALL show 6 again and an error toast SHALL be shown

#### Scenario: A failed rating after an earlier successful rating returns to the last confirmed value

- **WHEN** on the same page a user commits 8, the rate action returns `{ ok: true }` and the revalidated loader shows 8, and the user then commits 7 and the rate action fails at once (for example a network failure)
- **THEN** the rating slider SHALL show 8, the last confirmed value, not the unsaved 7, an error toast SHALL be shown, and the recipe detail loader SHALL NOT be revalidated

#### Scenario: Fetcher data contains actionable error object on failure

- **WHEN** an action accessed via `useFetcher` returns `{ ok: false, error: 'server error' }`
- **THEN** `fetcher.data` SHALL be an object with both `ok` and `error` properties
- **AND** `'error' in fetcher.data` SHALL evaluate to `true`
- **AND** consumers SHALL be able to branch on `fetcher.data.ok === false` for inline error display

### Requirement: Error path test coverage for button components

Each button component test file SHALL include a test case that verifies the error rollback path. The test SHALL:

1. Mount the component with `renderWithAppProviders` (`apps/web/src/test-utils/render.tsx`, which supplies the router, i18n and toast providers) with a resource route action that returns `{ ok: false, error: 'server error' }` plus the pre-click state
2. Simulate a user click on the button using `userEvent.setup()`
3. Assert that after the action settles, the button is not disabled (fetcher transitioned to idle) using `waitFor`
4. Assert that the button displays the pre-click count or state (not stuck in the optimistic state) and that an error toast is shown

Each button test file SHALL also include a two-step test: a first click whose action succeeds, then a second click whose action fails, asserting that the button shows the state confirmed by the first click.

For FollowButton, the error rollback test SHALL additionally verify that the `onToggleRollback` callback (if provided as a `vi.fn()` mock) is called with the pre-click following state returned by the action. The test SHALL create its own router with the error-returning action and SHALL NOT reuse the shared `renderWithRouter` helper (which uses a hanging action).

#### Scenario: LikeButton error rollback test

- **WHEN** a test renders `LikeButton` with `initialLiked=false, initialCount=3` with a `recipes/:id/like` action that returns `{ ok: false, error: 'server error', liked: false }`
- **AND** the simulated user clicks the button
- **THEN** after the action settles (`waitFor`), the button SHALL NOT be disabled
- **AND** the button textContent SHALL contain "3" (the original count, NOT the optimistically incremented "4")

#### Scenario: LikeButton keeps the confirmed like after a failed unlike

- **WHEN** a test renders `LikeButton` with `initialLiked=false, initialCount=3`, the first action call returns `{ ok: true, liked: true }` and the second returns `{ ok: false, error: 'server error', liked: true }`
- **AND** the simulated user clicks twice, waiting for each click to settle
- **THEN** the button textContent SHALL contain "4"

#### Scenario: FavouriteButton error rollback test

- **WHEN** a test renders `FavouriteButton` with `initialFavourited=false, initialCount=5` with a `recipes/:id/favourite` action that returns `{ ok: false, error: 'server error', favourited: false }`
- **AND** the simulated user clicks the button
- **THEN** after the action settles, the button SHALL NOT be disabled
- **AND** the button textContent SHALL contain "5" (the original count)

#### Scenario: FollowButton error rollback test (visual)

- **WHEN** a test renders `FollowButton` with `userId='user-1', initialFollowing=false` with a `follow/:userId` action that returns `{ ok: false, error: 'server error', following: false }`
- **AND** the simulated user clicks the button
- **THEN** after the action settles, the button SHALL NOT be disabled
- **AND** the button textContent SHALL be the `follow.follow` text (the original state, NOT the `follow.followingState` text or "...")

#### Scenario: FollowButton onToggleRollback callback fires on error

- **WHEN** a test renders `FollowButton` with `userId='user-1', initialFollowing=false, onToggleRollback={vi.fn()}` with an action that returns `{ ok: false, error: 'server error', following: false }`
- **AND** the simulated user clicks the button
- **THEN** after the action settles, the `onToggleRollback` mock SHALL have been called exactly once with `false`
- **AND** the `onToggle` mock (if provided) SHALL NOT have been called

#### Scenario: FollowButton keeps the confirmed follow after a failed unfollow

- **WHEN** a test renders `FollowButton` with `initialFollowing=false`, the first action call returns `{ ok: true, following: true }` and the second returns `{ ok: false, error: 'server error', following: true }`
- **AND** the simulated user clicks twice, waiting for each click to settle
- **THEN** the button SHALL show the `follow.followingState` text and `onToggleRollback` SHALL have been called once with `true`

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

