## ADDED Requirements

### Requirement: Signing out leaves no private data on screen
Signing out SHALL clear the session cookies, then navigate with `replace` to `/`, and only after that navigation settles clear the signed-in user, so that no loader data, fetcher data or page loaded with the old session stays rendered and no render guard redirects a signing-out user to `/login`.

The session store (`AuthContext`) sits above the router, so the navigation SHALL be done by a hook
inside the router tree, `useSignOut()` in `apps/web/src/hooks/useSignOut.ts`, and
`AuthContext.logout(leave)` SHALL await `leave()` between the server logout and clearing the user.
Every sign-out control (the navbar's desktop and mobile Logout buttons and the account-deletion
flow on `/settings`) SHALL use it. The static lookup cache holds only public data and is not cleared.
Logging in always navigates (to `next` or `/`), so a second user on the same tab never sees the
first user's loader data.

#### Scenario: Logout from a private collection
- **WHEN** a signed-in user viewing their private collection `/collections/:id` clicks Logout
- **THEN** the app shows `/` and the collection's name and items are no longer rendered

#### Scenario: Logout from a guarded page does not bounce to login
- **WHEN** a signed-in user on `/settings` clicks Logout, or deletes their account there
- **THEN** the app lands on `/`, not on `/login?next=%2Fsettings`

#### Scenario: The next user starts clean
- **WHEN** user A logs out on a recipe page and user B logs in on the same tab
- **THEN** every page B sees is loaded with B's session (B's own like and rating state), not A's

### Requirement: Sign-in and sign-out are mirrored in every open tab
Signing in, registering or signing out in one tab SHALL write a `brewform-auth-change` marker to `localStorage`, and every other open tab of the app SHALL react to the resulting `storage` event: after a sign-out it SHALL navigate with `replace` to `/` and then re-read the session, and after a sign-in it SHALL re-read the session and revalidate the current route.

`broadcastAuthChange(change)` in `apps/web/src/utils/auth-broadcast.ts` writes `<change>:<Date.now()>`
inside a `try/catch` (a throwing `setItem` is ignored and the local action still completes);
`AuthContext` calls it after a successful login or registration and after the server logout
settles, and never from `refreshUser` or the session bootstrap. `useAuthTabSync(router)` in
`apps/web/src/hooks/useAuthTabSync.ts`, mounted once in `App.tsx` under the app providers, listens to
the `storage` event, ignores other keys, removals and malformed values, and never writes the marker,
so tabs cannot ping-pong (the event does not fire in the tab that wrote it). The marker carries no
user id. Navigating before the session is re-read keeps render guards from redirecting a signed-out
tab to `/login`.

#### Scenario: Logout in one tab clears a private page in another
- **WHEN** tabs A and B show the user's private collection and the user logs out in tab A
- **THEN** tab B shows `/`, no longer renders the collection, and shows the signed-out navbar

#### Scenario: A guarded page in another tab does not bounce to login
- **WHEN** tab B is on `/settings` and the user logs out in tab A
- **THEN** tab B lands on `/`, not on `/login?next=%2Fsettings`

#### Scenario: Login in one tab signs the other tab in
- **WHEN** tab B is signed out on a public recipe page and the user logs in in tab A
- **THEN** tab B shows the signed-in navbar and its recipe loader runs again with the session

#### Scenario: Unrelated storage changes are ignored
- **WHEN** another key changes in `localStorage`, or `localStorage.clear()` runs in another tab
- **THEN** no tab navigates or re-reads the session

## MODIFIED Requirements

### Requirement: Revalidation after actions is scoped to affected data
Routes SHALL declare `shouldRevalidate` (or submissions SHALL pass `defaultShouldRevalidate: false`) so that an action only re-runs loaders whose data it changed; social toggles (like, favourite, follow) and comment create/delete SHALL NOT re-run the recipe detail loader when they succeed, and an action that returns `{ ok: false }` SHALL NOT re-run the recipe detail loader at all, because it changed nothing.

Components that accumulate fetcher-loaded data (comment "Load more" pages) SHALL merge revalidated
loader data instead of resetting to the first page.

A successful rating SHALL re-run the recipe detail loader once (the community average and count come
from it). Membership changes made in the add-to-collection modal SHALL NOT revalidate per click; when
the modal closes after at least one confirmed change (an added or removed membership, a 409 "already
in the collection", or a newly created collection holding the recipe), the recipe detail page SHALL
revalidate once so that its "In collections" card is current.

#### Scenario: Liking a recipe issues one request
- **WHEN** a user clicks Like on `/recipes/:slug` and the like action returns `{ ok: true }`
- **THEN** exactly one HTTP request (the like) is sent
- **AND** the recipe, comments and collections GETs are not re-issued

#### Scenario: Loaded comment pages survive an action
- **WHEN** a user has loaded comment pages 1-3 and then favourites the recipe
- **THEN** all three pages of comments remain visible

#### Scenario: A failed rating keeps the page and sends no reload
- **WHEN** a signed-in user rates a recipe and `POST /recipes/:id/rate` fails (HTTP 500, 429, a final 401 or a network error)
- **THEN** `rateAction` returns `{ ok: false, error, code? }`, the recipe page stays rendered, the stars return to the previous rating and an error toast is shown
- **AND** the recipe, comments and collections GETs are not re-issued

#### Scenario: A successful rating refreshes the community average
- **WHEN** the rate action returns `{ ok: true }`
- **THEN** the recipe detail loader runs once and the community average shows the new value

#### Scenario: The In collections card follows the modal
- **WHEN** a user adds the recipe to a collection in the add-to-collection modal and closes the modal
- **THEN** the recipe detail loader runs exactly once after the close and the "In collections" card lists that collection
- **AND** closing the modal without a confirmed change runs no loader

### Requirement: Auth-guarded loaders redirect to login with a return path
Every loader and action of an auth-guarded page route SHALL be wrapped by a shared `requireAuth` helper that converts a final HTTP 401 from the API into `redirect('/login?next=<encoded pathname+search>')`, and every admin page route SHALL use a `requireAdmin` helper that additionally redirects HTTP 403 to `/`; element-less resource routes SHALL NOT be wrapped and SHALL return `{ ok: false, error, code: 'UNAUTHORIZED' }` for a final 401 instead of redirecting.

`RequireAuth` SHALL remain as the render-time guard for routes whose loaders call only public
endpoints, and SHALL navigate with `replace` to `/login?next=<encoded pathname+search>`. The helpers
SHALL live in `apps/web/src/routes/auth-guards.ts` with unit tests, and SHALL log redirects at
`debug` without logging user identifiers beyond ids.

Resource routes are the routes without an element: every route under `/resources/`, plus
`recipes/:id/like`, `recipes/:id/favourite`, `recipes/:id/rate`, `follow/:userId`,
`comments/recipe/:recipeId`, `comments/:id` and `collections/:id/reorder`. Their request URL is not
a page, so a login redirect built from it would land the user on an empty route after login. Their
handlers SHALL live under `apps/web/src/routes/` and SHALL convert errors with
`toActionFailure(err, [])` (rethrowing only an aborted request); the submitting component SHALL show
`error.unauthorized` for the `UNAUTHORIZED` code (`useActionFeedback` maps it for every fetcher
toast). No module under `apps/web/src/routes/` other than `auth-guards.ts` SHALL call `requireAuth`
or `requireAdmin`, and a static test SHALL enforce it.

#### Scenario: Expired session on settings redirects to login
- **WHEN** a signed-out user opens `/settings` and `GET /preferences` returns 401 after the refresh attempt
- **THEN** the router redirects to `/login?next=%2Fsettings`
- **AND** the "Oops!" error page is not shown

#### Scenario: Non-admin on an admin route
- **WHEN** a signed-in non-admin opens `/admin/audit-log` and the API returns 403
- **THEN** the router redirects to `/`

#### Scenario: Render guard does not trap the back button
- **WHEN** a signed-out user opens `/recipes/new`
- **THEN** `RequireAuth` replaces the history entry with `/login?next=%2Frecipes%2Fnew`
- **AND** pressing Back does not return to `/recipes/new`

#### Scenario: An expired session during a background action keeps the page
- **WHEN** a user whose session can no longer be refreshed marks a notification read from the navbar dropdown
- **THEN** `markReadAction` returns `{ ok: false, code: 'UNAUTHORIZED' }`, the current page stays rendered and the toast says "You need to be logged in to do that"
- **AND** the browser is not sent to `/login?next=%2Fresources%2Fnotifications%2F…`

### Requirement: API client supports cancellation, single-flight refresh and defensive parsing
The web API client SHALL accept an optional `{ signal }` on every verb helper and domain-client method and pass it to `fetch`, SHALL share a single in-flight `POST /auth/refresh` among all concurrent requests that receive HTTP 401, and SHALL convert non-JSON or empty error bodies into an `ApiError` carrying the HTTP status.

Aborted requests SHALL be rethrown unchanged (an `AbortError`) and logged at `debug`, not `error`.
The shared refresh SHALL NOT be bound to any single caller's signal; each original request is
retried once with its own signal after the refresh settles. The client SHALL keep logging request
start/completion at `debug` without logging tokens or bodies.

Only `POST /auth/login`, `POST /auth/register`, `POST /auth/refresh` and `POST /auth/logout` SHALL
skip the refresh-and-retry on a 401: a 401 from login means wrong credentials, the refresh must not
recurse, and logout must never revive a session. Every other endpoint, including the token-guarded
`POST /auth/send-verification`, SHALL refresh and retry once. The public auth endpoints
(`forgot-password`, `reset-password`, `verify-email`, `registration-status`) never answer 401.

#### Scenario: Concurrent 401s refresh once
- **WHEN** three requests issued in parallel each receive HTTP 401
- **THEN** exactly one `POST /auth/refresh` is sent
- **AND** each original request is retried once after it succeeds

#### Scenario: Abort is not an error
- **WHEN** a loader's `request.signal` is aborted mid-request
- **THEN** the client rejects with an `AbortError`
- **AND** no `error`-level "API request failed" log is emitted

#### Scenario: Proxy HTML error page
- **WHEN** the API responds 502 with an HTML body
- **THEN** the client throws `ApiError` with `status` 502 and a non-JSON-body code
- **AND** no `SyntaxError` escapes to the UI

#### Scenario: Resend verification after the access token expired
- **WHEN** a signed-in user whose access token has expired but whose refresh cookie is valid clicks "Resend verification"
- **THEN** the client sends `POST /auth/refresh`, retries `POST /auth/send-verification` once, and the banner shows the sent state

#### Scenario: A wrong password is not retried
- **WHEN** `POST /auth/login` answers 401
- **THEN** no `POST /auth/refresh` is sent and the login request is not repeated
