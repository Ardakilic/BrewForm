# web-data-loading Specification

## Purpose
TBD - created by archiving change wave-6-audit-remediation. Update Purpose after archive.
## Requirements
### Requirement: React Router data APIs are the single web data-loading paradigm
The web app SHALL load all server data through React Router data APIs: route `loader`s for data a route needs to render, route `action`s for mutations, and `useFetcher()` against resource routes for component-level reads and writes. No other data-fetching paradigm (component `useEffect` fetching, TanStack Query, SWR, or a custom query hook) SHALL be added or kept.

The paradigm, its rationale, and the allowed uses of `useEffect` SHALL be recorded as a new ADR in
`docs/decisions.md` and summarised in a "Web data loading" section of `AGENTS.md`. The only
documented exception that may call the API client outside a loader, action or resource route is the
session store `apps/web/src/contexts/AuthContext.tsx`, which sits above the router and bootstraps
the session with `userApi.me()`. `apps/web/src/hooks/useStaticCacheSync.ts` may import
`CACHE_BUST_KEY` and `clearStaticCache` from `api/static-cache.ts`; it clears memory and never
fetches.

This capability takes precedence over the data transport described in older web requirements that
predate it. Where such a requirement says a component or hook fetches in `useEffect` or calls a
domain API client directly, it keeps its observable behaviour (what is shown, logged, toasted and
called back), but the call SHALL run in a loader, action or fetcher resource route. This applies to
any pre-wave-6 page description. The `web-shared-components` useBanUser requirement (renamed to
"useBanUser hook owns the ban/unban state machine and submits through the admin user route
action"), the `recipe-collections` component requirement and the `web-page-logging` requirements
are rewritten in wave 6 to match.

#### Scenario: Older transport wording does not reintroduce effect fetching
- **WHEN** a contributor implements `useBanUser` according to its `web-shared-components` requirement
- **THEN** the hook keeps its returned state machine and `onSuccess` contract
- **AND** it does not import the API client, and the ban request is sent through a route action, so "A guard prevents new useEffect-based fetching" and "A static enforcement test keeps API access inside loaders, actions and resource routes" both pass

#### Scenario: No query library is added
- **WHEN** `apps/web/package.json` is inspected after the change
- **THEN** it contains no `@tanstack/react-query`, `swr`, or similar data-fetching dependency
- **AND** `react-router` remains the only data-loading library

#### Scenario: The decision is documented
- **WHEN** a contributor reads `AGENTS.md` and `docs/decisions.md`
- **THEN** they find the loaders/actions/fetchers standard, the reasons TanStack Query was not chosen, the `useEffect` allowlist, and the AuthContext exception

### Requirement: Every route-level read goes through a loader that honours request.signal
Every route that renders server data SHALL obtain it from that route's `loader`, and every loader SHALL pass `request.signal` to each API client call it makes so that interrupted or superseded navigations abort their HTTP requests.

Loaders SHALL live in a co-located data module (`<Page>.data.ts`) or under `apps/web/src/routes/`,
SHALL read route params and search params only from their `params`/`request` arguments, SHALL emit
`log.debug` entry/exit and `log.error({ err, ...ids })` failure logs (no PII), and SHALL throw
`data(null, { status: 404 })` (or an equivalent 404 `Response`) for missing resources. Lazy routes
SHALL use the object form `lazy: { loader, action, Component }` so data and code load in parallel.
Components SHALL read loader data with `useLoaderData<typeof loader>()` (no `as` casts) and SHALL
derive page-level pending UI from `useNavigation()` rather than hand-rolled loading state.

Page and component modules (`.tsx` files outside `apps/web/src/routes/`) SHALL NOT export
`loader` or `action`; the 13 page modules that define a loader inline today (`HomePage`,
`RecipeListPage`, `StarredRecipesPage`, `RecipeDetailPage`, `CollectionListPage`,
`CollectionsBrowsePage`, `CollectionDetailPage`, `CollectionEditPage`, `BrewLogListPage`,
`BrewLogFormPage`, `UserProfilePage`, `SettingsPage`, `NotificationListPage`) SHALL move it to their
`<Page>.data.ts` module.

The migration inventory was re-verified on 2026-11-19 with a block-level scan of every non-test
`.ts`/`.tsx` file in `apps/web/src` (useEffect bodies that call `api.*`, `*Api.*`, `fetch(` or the
static-cache getters, directly or through a local function, plus every import of `api/client.ts`,
`api/index.ts` and `api/static-cache.ts`). It matches `openspec/changes/archive/2026-11-21-wave-6-audit-remediation/audit/t5-web-state.md` section 4 and is
recorded in `openspec/changes/archive/2026-11-21-wave-6-audit-remediation/audit/_refine/coverage.md`:

- 42 `useEffect` fetch blocks in 39 files; all SHALL be migrated except the allowlisted
  `AuthContext` session bootstrap (41 blocks in 38 files);
- 25 further files call the API client outside an effect: the 13 inline-loader page modules above
  and 12 mutation-only modules (`CollectionRecipeList`, `EmailVerificationBanner`,
  `NotificationItem`, `PhotoUpload`, `RecipeNotesSection`, `useBanUser`, `AdminCachePage`,
  `AdminUserCreatePage`, `ForgotPasswordPage`, `ResetPasswordPage`, `CollectionCreatePage`,
  `ContactPage`);
- 2 modules call `fetch(` directly in an event handler (`components/qrcode/RecipeQRCode.tsx:34`,
  `components/recipe/ShareSection.tsx:48`, the QR SVG download).

In total 65 modules SHALL end up with no value import of the API client and no direct `fetch(`.
After the migration the only non-test modules outside `apps/web/src/api/` that value-import the
API client SHALL be `*.data.ts` modules, modules under `apps/web/src/routes/`, and
`contexts/AuthContext.tsx`.

#### Scenario: Superseded navigation aborts the previous request
- **WHEN** a user opens `/equipment/A` and, before its loader resolves, navigates to `/equipment/B`
- **THEN** the signal passed to the `/equipment/A` API request is aborted
- **AND** only equipment B's data is ever rendered

#### Scenario: Detail page never shows the previous record
- **WHEN** a user moves from `/recipes/a/focus` to `/recipes/b/focus`
- **THEN** the page renders recipe B only after B's loader resolves and never renders recipe A's data under B's URL

#### Scenario: Admin pages load through loaders
- **WHEN** a signed-in admin opens `/admin/vendors`
- **THEN** the vendors list comes from the `/admin/vendors` route loader
- **AND** `AdminVendorsPage.tsx` contains no `useEffect` that calls the API client

#### Scenario: Missing resource renders the not-found page
- **WHEN** a loader's API call fails with HTTP 404 (for example `/coffee-varieties/<unknown-id>`)
- **THEN** the route renders the 404 page through its `errorElement`, not an empty list

### Requirement: Loader failures render an error state inside the app shell
Every route with a `loader` or `lazy` definition SHALL have a route-level `errorElement` so that a failed load renders an error state with a retry action inside its layout shell, and a failed load SHALL NOT be rendered as an empty or "no results" state.

#### Scenario: Failed list load is not shown as empty
- **WHEN** the `/recipes/:slug/versions` loader fails with HTTP 500
- **THEN** the route renders the server-error state with a retry control
- **AND** it does not render `common.noResults`

#### Scenario: Admin error keeps the admin shell
- **WHEN** an admin child route's loader throws a non-404 error
- **THEN** the error renders inside `AdminLayout` with the sidebar still visible

### Requirement: Component-level reads use fetchers against resource routes
Data that a component needs independently of its page's route (typeaheads, the notification unread badge and dropdown, the add-to-collection list, recipe brew history and stats, taste-note lookups, the viewer's private recipe note, the recipe QR-code SVG download) SHALL be read with `useFetcher().load()` from resource-route loaders registered under the `resources/` path prefix, so that a new `load()` cancels the fetcher's previous in-flight load.

A `useEffect` MAY call `fetcher.load()` or `revalidator.revalidate()` in response to mount or an
external event (window focus, the `brewform:notifications-changed` event); it SHALL NOT call the API
client directly. The QR-code download (`RecipeQRCode`, `ShareSection`) SHALL use one shared hook
(`apps/web/src/components/qrcode/useRecipeQrDownload.ts`) that calls
`fetcher.load('/resources/qrcode/recipe/<slug>')`; the resource loader returns
`{ ok: true, svg }` from `qrcodeApi.recipeSvg(slug, { signal })` (a domain client method built on a
new `api.getText` helper, so the runtime `VITE_API_URL` base applies) or `{ ok: false, error }`; the
hook turns `svg` into a `Blob` download named `brewform-<slug>-qr.svg` and shows
`toast.error('qrcode.downloadFailed')` on `{ ok: false }` (replacing `ShareSection`'s silent catch).
The `<img>` preview keeps its plain `src` URL, which is not a script fetch.

#### Scenario: Typeahead discards stale results
- **WHEN** a user types `ge` then `gesha` into the coffee-variety filter and the `ge` response arrives after the `gesha` response
- **THEN** the dropdown shows only the `gesha` results because the earlier fetcher load was cancelled

#### Scenario: Unread badge refreshes on focus through a fetcher
- **WHEN** the window regains focus while a user is signed in
- **THEN** `NotificationBell` calls `fetcher.load('/resources/notifications/unread-count')`
- **AND** `NotificationBell.tsx` does not import the API client

### Requirement: Mutations go through route actions that return a result object
Every mutation SHALL be performed by a route or resource-route `action` submitted via `<Form>`, `useSubmit()`, or `useFetcher().submit()`, and every action SHALL return `{ ok: true, ...payload }` on success and `{ ok: false, error }` for expected failures (validation errors, 4xx API errors, network errors) instead of throwing.

Actions MAY still throw for programmer errors that should reach an error boundary (for example a
missing route param is a 400 `Response` only when the route itself is mis-wired). Actions SHALL log
entry, exit and failure (`log.error({ err, ...ids })`, no PII). Components SHALL branch on the
returned `ok` flag to roll back optimistic UI and SHALL surface failures through `useToast()` (or an
inline `ErrorState` for form validation). This replaces the direct client calls in the roughly 35
mutating files listed in `openspec/changes/archive/2026-11-21-wave-6-audit-remediation/audit/t5-web-state.md` section 4, including `SettingsPage`, all admin CRUD
pages, `useBanUser`, collections, notifications, `BrewLogFormPage`, `RecipeNotesSection` and
`PhotoUpload`.

#### Scenario: Comment create failure keeps the recipe page
- **WHEN** a user submits a comment and `commentApi.create` fails with HTTP 500
- **THEN** `createCommentAction` returns `{ ok: false, error }`
- **AND** the recipe detail page stays rendered, the typed comment text is preserved, and an error toast is shown

#### Scenario: Comment delete failure rolls back
- **WHEN** a user deletes a comment and `commentApi.delete` fails
- **THEN** `deleteCommentAction` returns `{ ok: false, error }`
- **AND** `CommentSection` restores the deleted comment and the total count from its snapshot

#### Scenario: Failed list mutation is not silent
- **WHEN** deleting an item on `/equipment` fails
- **THEN** the action returns `{ ok: false, error }` and the page shows `toast.error(...)`
- **AND** the failure is not only logged

### Requirement: Revalidation after actions is scoped to affected data
Routes SHALL declare `shouldRevalidate` (or submissions SHALL pass `defaultShouldRevalidate: false`) so that an action only re-runs loaders whose data it changed; social toggles (like, favourite, follow) and comment create/delete SHALL NOT re-run the recipe detail loader when they succeed.

Components that accumulate fetcher-loaded data (comment "Load more" pages) SHALL merge revalidated
loader data instead of resetting to the first page.

#### Scenario: Liking a recipe issues one request
- **WHEN** a user clicks Like on `/recipes/:slug` and the like action returns `{ ok: true }`
- **THEN** exactly one HTTP request (the like) is sent
- **AND** the recipe, comments and collections GETs are not re-issued

#### Scenario: Loaded comment pages survive an action
- **WHEN** a user has loaded comment pages 1-3 and then favourites the recipe
- **THEN** all three pages of comments remain visible

### Requirement: Auth-guarded loaders redirect to login with a return path
Every loader and action of an auth-guarded route SHALL be wrapped by a shared `requireAuth` helper that converts a final HTTP 401 from the API into `redirect('/login?next=<encoded pathname+search>')`, and every admin route SHALL use a `requireAdmin` helper that additionally redirects HTTP 403 to `/`.

`RequireAuth` SHALL remain as the render-time guard for routes whose loaders call only public
endpoints, and SHALL navigate with `replace` to `/login?next=<encoded pathname+search>`. The helpers
SHALL live in `apps/web/src/routes/auth-guards.ts` with unit tests, and SHALL log redirects at
`debug` without logging user identifiers beyond ids.

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

### Requirement: Login and registration honour a safe return path
After a successful login or registration the app SHALL navigate (with `replace`) to the `next` search parameter when it is a same-origin relative path, and SHALL fall back to `/` otherwise.

A `next` value is safe only if it starts with a single `/`, does not start with `//` or `/\`, and
contains no scheme. The check SHALL be a unit-tested helper (`isSafeNextPath`).

#### Scenario: Return to the original page
- **WHEN** a user logs in from `/login?next=%2Fcollections%3Fpage%3D2`
- **THEN** they land on `/collections?page=2`

#### Scenario: Open redirect is refused
- **WHEN** a user logs in from `/login?next=%2F%2Fevil.example`
- **THEN** they land on `/`

### Requirement: API client supports cancellation, single-flight refresh and defensive parsing
The web API client SHALL accept an optional `{ signal }` on every verb helper and domain-client method and pass it to `fetch`, SHALL share a single in-flight `POST /auth/refresh` among all concurrent requests that receive HTTP 401, and SHALL convert non-JSON or empty error bodies into an `ApiError` carrying the HTTP status.

Aborted requests SHALL be rethrown unchanged (an `AbortError`) and logged at `debug`, not `error`.
The shared refresh SHALL NOT be bound to any single caller's signal; each original request is
retried once with its own signal after the refresh settles. The client SHALL keep logging request
start/completion at `debug` without logging tokens or bodies.

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

### Requirement: Static lookup cache is single-flight
The static lookup cache (`apps/web/src/api/static-cache.ts`) SHALL memoise the in-flight promise for each lookup so that concurrent callers share one HTTP request, SHALL drop a rejected promise so the next call retries, and SHALL be the only path by which loaders and resource routes read the flat taste-note list and the equipment lookup.

#### Scenario: Concurrent loaders share one request
- **WHEN** two loaders call `getTasteNotesCached()` before the first request resolves
- **THEN** exactly one `GET /taste-notes/flat` is sent and both receive the same array

#### Scenario: Failure is not cached
- **WHEN** the first `getEquipmentCached()` call rejects
- **THEN** the next call issues a new request

### Requirement: A guard prevents new useEffect-based fetching
The repository SHALL fail `make lint` when a web module outside the data layer imports the API client, and SHALL fail `make test-web` when any `useEffect` callback in `apps/web/src` calls the API client, `fetch(`, or the static-cache getters.

The lint guard SHALL be a Biome `style/noRestrictedImports` override (gitignore-style `patterns`)
that forbids importing `**/api/client.ts`, `**/api/index.ts` and `**/api/static-cache.ts` from
`apps/web/src/**`, except in `apps/web/src/api/**`, `apps/web/src/routes/**`,
`apps/web/src/**/*.data.ts`, `apps/web/src/contexts/AuthContext.tsx`,
`apps/web/src/hooks/useStaticCacheSync.ts` (static-cache import only), and test files. `ApiError`
and error helpers SHALL be importable from a non-restricted `api/errors.ts`. The test guard SHALL be
a Vitest architecture test whose allowlist contains only `contexts/AuthContext.tsx`. The rule
reaches level `error` when the migration ends.

#### Scenario: New effect fetch is rejected
- **WHEN** a contributor adds `useEffect(() => { api.get('/badges').then(setBadges); }, [])` to a page
- **THEN** `make lint` reports a restricted import and the architecture test fails naming the file

#### Scenario: Allowed effects pass
- **WHEN** a component uses `useEffect` only to subscribe to `focus` and call `fetcher.load(...)`
- **THEN** both guards pass

### Requirement: A static enforcement test keeps API access inside loaders, actions and resource routes
`make test-web` SHALL run `apps/web/src/data-loading.enforcement.test.ts`, which reads every non-test `.ts`/`.tsx` file under `apps/web/src` and fails, naming each offending `file:line`, when any module outside the allowed data layer value-imports the domain API clients, calls `fetch` directly, or bypasses the loader/action modules.

The test is the authoritative, lint-independent check that loaders, actions and fetchers are the
only data-fetching mechanism (Biome can be suppressed per line; this test cannot). It SHALL be a
pure source scan with no network or DOM, using regular expressions over the file text (multi-line
`import` statements included) and resolving relative specifiers and the `@/` alias to paths under
`apps/web/src`. Rules:

1. **API client imports.** A value import (any `import` that is not `import type`, including
   `export … from` and dynamic `import()`) of `api/client.ts`, `api/index.ts` or
   `api/static-cache.ts` is allowed only in: `apps/web/src/api/**`, `apps/web/src/**/*.data.ts`,
   `apps/web/src/routes/**` (route actions and `resources/*` resource routes),
   `apps/web/src/contexts/AuthContext.tsx`, and `apps/web/src/hooks/useStaticCacheSync.ts` when the
   imported names are only `CACHE_BUST_KEY` and `clearStaticCache`. `import type { … }` from these
   modules is allowed everywhere. `api/errors.ts` (`ApiError`, `isApiError`) is unrestricted.
2. **Direct network calls.** `fetch(`, `XMLHttpRequest`, `new EventSource(` and
   `navigator.sendBeacon(` are allowed only in `apps/web/src/api/**`.
3. **Loader and action placement.** A `.tsx` module outside `apps/web/src/routes/` SHALL NOT export
   a `loader` or an `action`: it SHALL NOT contain `export const loader`, `export async function
   loader`, `export function loader`, `export const action`, `export async function action` or
   `export function action`.
4. **Data-module imports.** A value import from a `*.data.ts` module is allowed only in
   `apps/web/src/router.tsx`, `apps/web/src/routes/**` and other `*.data.ts` modules; components
   and pages use `import type { loader } from './X.data.ts'` for `useLoaderData<typeof loader>()`.
   This stops a component from calling a data-module function directly as a disguised client call.

The test SHALL include a self-check block that runs the same matcher over inline fixture strings
and asserts it flags a value import of `../../api/index.ts` from a page, a multi-line value import,
a dynamic `import('../api/client.ts')`, a `fetch(` call in a component and an inline
`export const loader` in a page, and that it accepts `import type { AdminUser } from
'../../api/index.ts'`, an `api/errors.ts` import and the `useStaticCacheSync` exception. While the
migration is in progress the test MAY carry a temporary `PENDING` list of not-yet-migrated files;
the list SHALL be empty, and removed, before the change is archived, and a file on the list that no
longer violates SHALL fail the test (so the list only shrinks).

#### Scenario: A component importing a domain client fails
- **WHEN** a contributor adds `import { recipeApi } from '../../api/index.ts'` to `apps/web/src/components/recipe/LikeButton.tsx`
- **THEN** `make test-web` fails with `components/recipe/LikeButton.tsx:<line>` and rule "API client imports"

#### Scenario: A direct fetch in a component fails
- **WHEN** a component calls `fetch('/api/v1/qrcode/recipe/x.svg')` in a click handler
- **THEN** `make test-web` fails naming that file and line under rule "Direct network calls"

#### Scenario: Type-only imports pass
- **WHEN** a page contains `import type { AdminUser } from '../../api/index.ts'` and `import type { loader } from './AdminUsersPage.data.ts'`
- **THEN** the enforcement test passes for that page

#### Scenario: Loaders cannot stay in page modules
- **WHEN** `apps/web/src/pages/HomePage.tsx` still contains `export const loader`
- **THEN** the enforcement test fails naming the file under rule "Loader and action placement"

#### Scenario: Pending list only shrinks
- **WHEN** a file listed in `PENDING` has been migrated and no longer violates any rule
- **THEN** the test fails and asks for the entry to be removed

#### Scenario: Migration complete
- **WHEN** all 65 modules in the migration inventory are migrated
- **THEN** `PENDING` is empty and removed, and the test passes with only the documented allowlist

