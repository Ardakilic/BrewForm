# error-handling Specification

## Purpose

This document specifies the cross-project error-handling patterns and conventions for client-side
data fetching in the frontend, describing how critical and non-critical fetch failures are surfaced
(or silently logged). It serves as a guideline for maintainers and integrators to ensure
deterministic error propagation, structured logging, and prevention of silent error swallowing
across the application.

The scenarios in this spec use concrete examples from existing changes (D17 — fix-error-swallowing)
to illustrate the patterns. For change-specific requirements — such as the action-layer
`{ ok: false }` return pattern used in optimistic UI rollback (D18 — fix-optimistic-rollback) —
see the respective change documentation and the `optimistic-rollback` spec.
## Requirements
### Requirement: Critical fetch failures show user-facing error

The component SHALL display a user-facing error message via i18n when a client-side data fetch
essential for rendering the page fails (e.g., the main recipe data in RecipeFocusModePage), and
SHALL log the error with structured context including the error object and relevant identifiers
(e.g., the recipe slug).

The error state SHALL take visual priority over the loading state — if both `error` and `!recipe`
are true, the error message SHALL be displayed, not the loading spinner.

#### Scenario: Recipe fetch fails in focus mode

- **WHEN** `recipeApi.get(slug)` rejects with an Error on the RecipeFocusModePage
- **THEN** the UI SHALL display the translated `recipe.focusMode.loadError` message in a centered
  text block styled with `color: var(--error)`
- **AND** a structured `log.error({ err, slug })` call SHALL be emitted with message "Failed to
  fetch recipe for focus mode"
- **AND** the loading spinner SHALL NOT be displayed

#### Scenario: Recipe fetch succeeds in focus mode

- **WHEN** `recipeApi.get(slug)` resolves successfully on the RecipeFocusModePage
- **THEN** the error state SHALL NOT be displayed
- **AND** the recipe content SHALL render normally

### Requirement: Non-critical fetch failures log silently

The component SHALL log the error with structured context and SHALL NOT display any user-facing
error message when a client-side data fetch that is optional or degrades gracefully fails (e.g.,
taste notes autocomplete list, bean pre-fill from URL param). The component SHALL continue to
render its default state (empty list, empty form field, etc.).

#### Scenario: Taste notes fetch fails in focus mode

- **WHEN** `tasteApi.flat()` rejects with an Error on the RecipeFocusModePage
- **THEN** a structured `log.error({ err })` call SHALL be emitted with message "Failed to fetch
  taste notes for focus mode"
- **AND** the page SHALL render normally with taste notes data as an empty array
- **AND** no user-facing error message SHALL be shown

#### Scenario: Bean pre-fill fetch fails in recipe create page

- **WHEN** `beanApi.get(beanId)` rejects with an Error on the RecipeCreatePage (triggered by
  `?beanId=<uuid>` URL param)
- **THEN** a structured `log.error({ err, beanId })` call SHALL be emitted with message "Failed to
  pre-fill bean info from URL param"
- **AND** the form SHALL render normally with empty bean-related fields
- **AND** no user-facing error message SHALL be shown

#### Scenario: Taste notes autocomplete list fetch fails

- **WHEN** `api.get('/taste-notes/flat')` rejects with an Error in the TasteAutocomplete component
- **THEN** a structured `log.error({ err })` call SHALL be emitted with message "Failed to fetch
  taste notes list"
- **AND** the autocomplete SHALL render with an empty suggestions list
- **AND** the "Loading taste notes..." placeholder SHALL NOT persist (the fetch completed, it just
  failed)
- **AND** no user-facing error message SHALL be shown

### Requirement: Structured logging follows project conventions

All new `log.error()` calls SHALL follow the project's logging conventions as defined in AGENTS.md:

- SHALL include the `err` object as the first argument
- SHALL include relevant traceable identifiers (e.g., `slug`, `beanId`) in the context object
- SHALL use a descriptive message string as the second argument
- SHALL NOT include passwords, tokens, secrets, API keys, or PII
- SHALL create a module-scoped logger once at the top of the file via `createLogger('ModuleName')`

#### Scenario: Logger is instantiated per component

- **WHEN** a component file imports `createLogger`
- **THEN** the file SHALL contain exactly one top-level `const log = createLogger(...)` call with a
  human-readable module name matching the component name
- **AND** no `console.log`, `console.error`, or `console.warn` calls SHALL be added

### Requirement: i18n keys are provided for both supported locales

Any new user-facing error message SHALL have a corresponding translation key in both
`packages/shared/src/i18n/en.json` and `packages/shared/src/i18n/tr.json`. Keys SHALL follow the
existing namespace hierarchy (e.g., `recipe.focusMode.*`).

#### Scenario: Error message displays in English

- **WHEN** the locale is set to `en` and `recipe.focusMode.loadError` is rendered
- **THEN** the user SHALL see "Failed to load recipe"

#### Scenario: Error message displays in Turkish

- **WHEN** the locale is set to `tr` and `recipe.focusMode.loadError` is rendered
- **THEN** the user SHALL see "Tarif yüklenemedi"

### Requirement: Exported functions have JSDoc docblocks

All exported functions, components, and interfaces in the affected source files SHALL have JSDoc
docblocks (`/** ... */`) immediately preceding the declaration. Docblocks for components SHALL
describe the component's purpose. Docblocks for helper functions SHALL describe behavior,
parameters, and side effects.

This applies to ALL currently undocumented exported declarations in the affected files, not just the
ones being modified for error handling.

#### Scenario: Component docblock is present

- **WHEN** a file exports a React component function (e.g., `RecipeFocusModePage`,
  `RecipeCreatePage`, `TasteAutocomplete`)
- **THEN** a `/** ... */` JSDoc block SHALL be present immediately before the `export function`
  declaration
- **AND** the docblock SHALL describe the component's purpose and any notable behavior

#### Scenario: Helper function docblock is present

- **WHEN** a file exports or contains a named helper function (e.g., `toggleNote`, `handleSubmit`,
  `handleKeyDown`, `handleFork`)
- **THEN** a `/** ... */` JSDoc block SHALL be present before the function declaration
- **AND** the docblock SHALL describe the function's behavior, parameters, and side effects

#### Scenario: Interface docblock is present

- **WHEN** a file defines an exported interface (e.g., `TasteNote`, `Props`)
- **THEN** a `/** ... */` JSDoc block SHALL be present before the interface declaration
- **AND** the docblock SHALL describe what the interface represents

### Requirement: AuthContext.refreshUser distinguishes 401 from 5xx/network errors

The `refreshUser` function in `apps/web/src/contexts/AuthContext.tsx` (L36-52) SHALL branch its catch block on the error type and status, instead of applying a single `log.warn` + `setUser(null)` to all failures. The branches SHALL be:

1. **Banned user** (`err instanceof ApiError && (err.code === 'USER_BANNED' || err.message.toLowerCase().includes('banned'))`) — keep the existing behaviour: `log.warn({ err }, 'AuthContext user account is banned')` + `setUser(null)` + `sessionError` stays `null`. (Existing branch at L43-44, unchanged.)

2. **401 (session genuinely expired)** (`err instanceof ApiError && err.status === 401`) — silent logout is correct because the web API client (`apps/web/src/api/client.ts:34-49`) already silently attempted a `/auth/refresh` retry before throwing, so a 401 reaching `refreshUser` means the refresh cookie is also dead. SHALL: `log.warn({ err }, 'AuthContext session expired or not authenticated')` + `setUser(null)` + `sessionError` stays `null`. No banner is shown — the user is genuinely logged out.

3. **5xx server error** (`err instanceof ApiError && err.status >= 500`) — the session may still be valid; the server had an error. SHALL: `log.error({ err }, 'Session restore failed — server error')` + `setUser(null)` + `setSessionError('server')`. The banner is shown.

4. **Network error** (`!(err instanceof ApiError)`) — `fetch` threw before a response (offline, DNS failure, CORS — typically `TypeError: Failed to fetch`). The session may still be valid; the client could not reach the server. SHALL: `log.error({ err }, 'Session restore failed — network error')` + `setUser(null)` + `setSessionError('network')`. The banner is shown.

5. **Other 4xx (e.g. 403, 404)** (`err instanceof ApiError && err.status < 500 && err.status !== 401`) — uncommon for `/users/me`, but treated as a logged-out-adjacent case. SHALL: `log.warn({ err }, 'AuthContext token refresh failed')` + `setUser(null)` + `sessionError` stays `null` (no banner — these are typically auth-state issues, not server health).

The outer `refreshUser().catch(() => {})` at L54-56 SHALL be removed. The inner catch block already prevents any throw from escaping `refreshUser`, so the outer `.catch` is redundant. Removing it eliminates the D17-survivor empty catch.

`ApiError` is imported from `../api/index.ts` (or wherever the web API client re-exports it — `apps/web/src/api/index.ts` re-exports `ApiError` from `./client.ts`). `ApiError` exposes `.status: number` (verified at `client.ts:83-99`).

#### Scenario: 401 on refresh — silent logout, no banner

- **WHEN** `userApi.me()` rejects with `new ApiError('UNAUTHORIZED', '...', undefined, 401)` (meaning the silent `/auth/refresh` retry also failed)
- **THEN** `user` is set to `null`
- **AND** `sessionError` is `null`
- **AND** `log.warn` is called with message containing 'session expired' or 'not authenticated'
- **AND** `log.error` is NOT called

#### Scenario: 500 on refresh — banner shown, error logged

- **WHEN** `userApi.me()` rejects with `new ApiError('INTERNAL_ERROR', '...', undefined, 500)`
- **THEN** `user` is set to `null`
- **AND** `sessionError` is set to `'server'`
- **AND** `log.error` is called with message containing 'server error'

#### Scenario: Network failure on refresh — banner shown, error logged

- **WHEN** `userApi.me()` rejects with `new TypeError('Failed to fetch')` (not an `ApiError`)
- **THEN** `user` is set to `null`
- **AND** `sessionError` is set to `'network'`
- **AND** `log.error` is called with message containing 'network error'

#### Scenario: Banned user on refresh — existing behaviour preserved

- **WHEN** `userApi.me()` rejects with `new ApiError('USER_BANNED', '...', undefined, 403)`
- **THEN** `user` is set to `null`
- **AND** `sessionError` is `null`
- **AND** `log.warn` is called with message containing 'banned' (existing behaviour unchanged)

#### Scenario: Successful refresh — no error state

- **WHEN** `userApi.me()` resolves with a user object
- **THEN** `user` is set to that object
- **AND** `sessionError` is `null`
- **AND** `isLoading` is set to `false`

#### Scenario: Outer .catch(() => {}) is removed

- **WHEN** the source of `apps/web/src/contexts/AuthContext.tsx` is inspected at the mount `useEffect`
- **THEN** it does NOT contain `refreshUser().catch(() => {})`
- **AND** the `useEffect` calls `refreshUser()` directly (the inner catch prevents unhandled rejections)

### Requirement: AuthContext exposes sessionError and clearSessionError

The `AuthContextType` interface in `apps/web/src/contexts/AuthContext.tsx` (L8-18) SHALL be extended with two new fields:

```typescript
interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionError: 'network' | 'server' | null;  // new
  login: (...) => Promise<void>;
  register: (...) => Promise<void>;
  logout: (leave?: () => Promise<void> | void) => Promise<void>;  // leave runs between the server logout and clearing the user (web-data-loading)
  refreshUser: () => Promise<void>;
  clearSessionError: () => void;  // new
}
```

`sessionError` SHALL be `null` by default, set to `'server'` or `'network'` by `refreshUser`'s catch block per the requirement above, and reset to `null` by `clearSessionError()`. A successful `refreshUser` call (e.g. a manual retry from the banner) SHALL also reset `sessionError` to `null` — this can be done either in the `refreshUser` try block (`setSessionError(null)` on success) or by having `clearSessionError` call `refreshUser`. The preferred approach: set `sessionError = null` at the start of the `try` block in `refreshUser`, so any successful refresh clears the error, and `clearSessionError` is a standalone `() => setSessionError(null)` for the banner's dismiss-without-retry path.

`useAuth()` (L113-118) SHALL return the extended context unchanged in shape — consumers reading `{ user, isLoading }` are unaffected; consumers that want the banner read `{ sessionError, clearSessionError, refreshUser }`.

#### Scenario: sessionError is exposed from useAuth

- **WHEN** a component calls `const { sessionError, clearSessionError } = useAuth()`
- **THEN** `sessionError` is `null`, `'server'`, or `'network'`
- **AND** `clearSessionError` is a function that resets `sessionError` to `null`

#### Scenario: Successful refreshUser clears sessionError

- **WHEN** `sessionError` is `'server'` and `refreshUser()` is called and succeeds
- **THEN** `sessionError` is reset to `null` (and `user` is set to the refreshed user)

### Requirement: SessionRestoreBanner renders on sessionError

A new component `apps/web/src/components/SessionRestoreBanner.tsx` SHALL render a user-visible banner when `sessionError` is not `null`. The component SHALL:

- Call `useAuth()` to read `sessionError`, `clearSessionError`, and `refreshUser`.
- Early `return null` when `sessionError === null`.
- Render a banner with inline Tailwind classes + CSS custom properties, modeled on `apps/web/src/components/EmailVerificationBanner.tsx` (44 lines — self-contained, no props, calls `useAuth()` directly).
- Show different copy for `'server'` vs. `'network'`:
  - `'network'`: "Couldn't reach the server. Check your connection and retry."
  - `'server'`: "Couldn't restore your session — the server had an error. Retry?"
- Render a "Retry" button that calls `refreshUser()`. On success (the `refreshUser` try block sets `sessionError = null`), the banner unmounts via the early-return-null. On failure, the banner stays and `sessionError` is updated to the new error category.
- Render a "Dismiss" button (or `clearSessionError()` on click of a close icon) that clears `sessionError` to `null` without retrying — for users who want to dismiss the banner and continue in a logged-out state.
- The banner text is inline English in this change; i18n keys (`t()`) are a D40-wave follow-up, explicitly out of scope here.

The banner SHALL be mounted in `apps/web/src/components/layout/Layout.tsx` as a sibling to `<EmailVerificationBanner />` (currently at L31), placed immediately before or after it (above `<Navbar />`). The Layout change is a one-line addition.

#### Scenario: Banner renders on server error

- **WHEN** `sessionError === 'server'`
- **THEN** the `SessionRestoreBanner` renders with the server-error copy and a Retry button

#### Scenario: Banner renders on network error

- **WHEN** `sessionError === 'network'`
- **THEN** the `SessionRestoreBanner` renders with the network-error copy and a Retry button

#### Scenario: Banner does not render when sessionError is null

- **WHEN** `sessionError === null`
- **THEN** the `SessionRestoreBanner` renders nothing (early return null)

#### Scenario: Retry button calls refreshUser

- **WHEN** the Retry button is clicked
- **THEN** `refreshUser()` is called
- **AND** if it succeeds, `sessionError` becomes `null` and the banner unmounts

#### Scenario: Dismiss clears sessionError without retry

- **WHEN** the Dismiss button is clicked
- **THEN** `clearSessionError()` is called
- **AND** `sessionError` becomes `null`
- **AND** the banner unmounts
- **AND** `refreshUser` is NOT called

#### Scenario: Banner is mounted in Layout

- **WHEN** the source of `apps/web/src/components/layout/Layout.tsx` is inspected
- **THEN** `<SessionRestoreBanner />` is rendered as a sibling to `<EmailVerificationBanner />`

### Requirement: AuthContext test coverage for refresh failure cases

The web package SHALL contain a test file `apps/web/src/contexts/AuthContext.test.tsx` that exercises the `refreshUser` error branches via mocked `userApi.me`. The test SHALL follow the convention established by `apps/web/src/pages/auth/LoginPage.test.tsx`:

- Vitest + `@testing-library/react` + jsdom (config at `apps/web/vitest.config.ts`, setup at `apps/web/src/test-setup.ts`).
- `vi.hoisted` for the logger mock (so `createLogger` returns a mock with `debug/info/warn/error` spies).
- `vi.mock('../../api/index', ...)` with a stubbed `ApiError` class extending `Error` with `code`, `status`, `details?` (matching `apps/web/src/api/client.ts:83-99`). The mock SHALL export `userApi` with `me: vi.fn()` so each test can flip it between `mockResolvedValue(user)`, `mockRejectedValue(new ApiError('UNAUTHORIZED', '...', undefined, 401))`, `mockRejectedValue(new ApiError('INTERNAL_ERROR', '...', undefined, 500))`, and `mockRejectedValue(new TypeError('Failed to fetch'))`.
- Render via `MemoryRouter > I18nProvider > AuthProvider > <TestConsumer/>` where `<TestConsumer/>` is a tiny component that calls `useAuth()` and renders `sessionError` and `user?.id` into the DOM for assertion.
- `waitFor` for `isLoading` to flip to `false` before asserting.

Test cases SHALL cover:
1. **401** → `user` null, `sessionError` null, `mockLogger.warn` called, `mockLogger.error` NOT called.
2. **500** → `user` null, `sessionError === 'server'`, `mockLogger.error` called.
3. **Network `TypeError`** → `user` null, `sessionError === 'network'`, `mockLogger.error` called.
4. **Banned** → `user` null, `sessionError` null, `mockLogger.warn` called with 'banned' message.
5. **Success** → `user` set, `sessionError` null, no `warn`/`error` calls.

#### Scenario: AuthContext test file exists and follows conventions

- **WHEN** the source of `apps/web/src/contexts/AuthContext.test.tsx` is inspected
- **THEN** it uses `vi.hoisted` for the logger mock, `vi.mock` for the api module with a stubbed `ApiError` class, and renders `AuthProvider` inside `MemoryRouter > I18nProvider`

#### Scenario: 401 refresh-failure case passes

- **WHEN** the AuthContext test suite is executed
- **THEN** the 401 case asserts `sessionError` is `null` and `mockLogger.warn` was called

#### Scenario: 500 refresh-failure case passes

- **WHEN** the AuthContext test suite is executed
- **THEN** the 500 case asserts `sessionError === 'server'` and `mockLogger.error` was called

#### Scenario: Network refresh-failure case passes

- **WHEN** the AuthContext test suite is executed
- **THEN** the network case asserts `sessionError === 'network'` and `mockLogger.error` was called

#### Scenario: All AuthContext tests pass

- **WHEN** the web test suite is executed
- **THEN** all `describe('refreshUser', ...)` cases pass with zero regressions in pre-existing web tests

### Requirement: JSDoc on new and modified exported functions

All new exported functions/components in the D38-p3 scope SHALL have JSDoc docblocks per the project convention:

- `SessionRestoreBanner` component in `apps/web/src/components/SessionRestoreBanner.tsx` — JSDoc describing its purpose (renders a banner when `sessionError` is set, with retry/dismiss actions).
- `clearSessionError` function in `AuthContext.tsx` — JSDoc describing that it resets `sessionError` to `null`.
- The `sessionError` field on `AuthContextType` — JSDoc on the interface field describing its three states.

The `refreshUser` function's existing JSDoc (if any) SHALL be updated to mention the `sessionError` side-effect.

#### Scenario: SessionRestoreBanner has JSDoc

- **WHEN** the source of `apps/web/src/components/SessionRestoreBanner.tsx` is inspected
- **THEN** a `/** ... */` JSDoc block is present immediately before `export function SessionRestoreBanner`

#### Scenario: clearSessionError has JSDoc

- **WHEN** the source of `apps/web/src/contexts/AuthContext.tsx` is inspected at the `clearSessionError` definition
- **THEN** a `/** ... */` JSDoc block is present describing its behaviour

### Requirement: API global error handler unwraps Drizzle-wrapped Postgres errors

The API global error handler (`apps/api/src/middleware/errorHandler.ts`, registered via `app.onError`) SHALL locate the underlying postgres-js `PostgresError` by walking the `cause` chain of the thrown error (at most 5 levels, starting with the error itself), because drizzle-orm 0.45 wraps every driver error in a `DrizzleQueryError` whose `name` is `Error` and whose `cause` holds the `PostgresError`.

Detection SHALL be structural (an object with `name === 'PostgresError'` and a 5-character string
`code`), implemented once in `apps/api/src/utils/errors.ts` as
`getPostgresError(err: unknown): PostgresErrorLike | null`, so neither the middleware nor services
need to import `drizzle-orm` or `postgres`.

When a `PostgresError` is found, the handler SHALL map its SQLSTATE as follows and SHALL respond with
the standard envelope `{ success: false, error: { code, message, requestId } }`:

| SQLSTATE | Meaning | Status | `error.code` | `error.message` |
|---|---|---|---|---|
| `23505` | unique violation | 409 | `CONFLICT` | `A record with this value already exists` |
| `23503` on an `insert`/`update` statement | referenced row missing | 400 | `VALIDATION_ERROR` | `A referenced record does not exist` |
| `23503` on a `delete` statement | row still referenced | 409 | `CONFLICT` | `The record is still referenced by other records` |
| `23502`, `23514`, and class `22` (`22001`, `22003`, `22007`, `22008`, `22P02`, …) | invalid stored value | 400 | `VALIDATION_ERROR` | `A value is invalid for this field` |
| `57014` | statement cancelled by `statement_timeout` (see the `advanced-search` capability) | 503 | `QUERY_TIMEOUT` | `The query took too long. Try a more specific search.` |
| anything else | — | 500 | `INTERNAL_ERROR` | production: `Something went wrong` |

The statement kind for `23503` SHALL be read from the leading keyword of the wrapper's `query`
string when present; when it is absent the handler SHALL use the `400` row. Responses SHALL NOT
include SQL text, parameters, constraint names, table names or column names.

#### Scenario: Wrapped unique violation returns 409

- **WHEN** a route handler throws `new DrizzleQueryError('insert into "user_follow" ...', [...], pgErr)` where `pgErr.name === 'PostgresError'` and `pgErr.code === '23505'`
- **THEN** the response status is `409` and `error.code` is `CONFLICT`
- **AND** the body contains no SQL text and no parameter values

#### Scenario: Unwrapped PostgresError keeps working

- **WHEN** a route handler throws a bare object-shaped `PostgresError` with `code === '23505'`
- **THEN** the response status is `409` and `error.code` is `CONFLICT`

#### Scenario: Foreign-key violation on insert returns 400

- **WHEN** `POST /api/v1/recipes` is called with a `vendorId` that does not exist and the insert raises `23503`
- **THEN** the response status is `400` and `error.code` is `VALIDATION_ERROR` (today it is `500`)

#### Scenario: Non-Postgres wrapped error stays 500

- **WHEN** a `DrizzleQueryError` whose `cause` is a connection error (`ECONNREFUSED`) reaches the handler
- **THEN** the response status is `500` and `error.code` is `INTERNAL_ERROR`

### Requirement: API global error handler maps Hono HTTPException to the standard envelope

The API global error handler SHALL detect `err instanceof HTTPException` (from `hono/http-exception`) before any other branch and SHALL respond with the exception's own `status` and the standard JSON error envelope, so framework-raised client errors are never reported as `500`.

- When the exception carries a custom response (`res`), the handler SHALL return
  `err.getResponse()` unchanged.
- Otherwise `error.code` SHALL be derived from the status: `400` → `BAD_REQUEST`, `401` →
  `UNAUTHORIZED`, `403` → `FORBIDDEN`, `404` → `NOT_FOUND`, `405` → `METHOD_NOT_ALLOWED`, `409` →
  `CONFLICT`, `413` → `PAYLOAD_TOO_LARGE`, `415` → `UNSUPPORTED_MEDIA_TYPE`, `422` →
  `VALIDATION_ERROR`, `429` → `RATE_LIMITED`, any other `4xx` → `BAD_REQUEST`, any `5xx` →
  `INTERNAL_ERROR`.
- For `4xx`, `error.message` SHALL be the exception message (these are framework- or
  author-controlled strings). For `5xx`, the production message SHALL be `Something went wrong`.
- `4xx` HTTPExceptions SHALL be logged with `log.warn({ requestId, status, method, path }, 'HTTP exception')`
  and SHALL NOT produce the `Unhandled error` log line; `5xx` SHALL be logged with `log.error`.
- The envelope SHALL be built with `c.json(...)` so headers already set on the context (CORS,
  request id, secure headers) are preserved.

#### Scenario: Malformed JSON body returns 400

- **WHEN** `POST /api/v1/collections` is sent with `Content-Type: application/json` and the body `{"name":`
- **THEN** the response status is `400`, `error.code` is `BAD_REQUEST` and `error.message` is `Malformed JSON in request body` (today it is `500`)
- **AND** no `Unhandled error` log line is emitted

#### Scenario: HTTPException status is preserved

- **WHEN** a handler throws `new HTTPException(429, { message: 'Too many requests' })`
- **THEN** the response status is `429` and `error.code` is `RATE_LIMITED`

#### Scenario: Custom HTTPException response is honoured

- **WHEN** a handler throws `new HTTPException(401, { res: new Response('nope', { status: 401 }) })`
- **THEN** the response is that custom response

### Requirement: Typed AppError hierarchy is mapped by the global error handler

The API SHALL provide a small typed error hierarchy in `apps/api/src/utils/errors.ts` and the global error handler SHALL map any thrown `AppError` to its declared status and envelope without per-route `try/catch` code.

```ts
/** Base class for expected, client-facing API errors. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: ContentfulStatusCode,
    message: string,
    readonly details?: Array<{ field: string; message: string }>,
    options?: { cause?: unknown },
  );
}
export class NotFoundError extends AppError {}   // 404, code 'NOT_FOUND', message '<Resource> not found'
export class ForbiddenError extends AppError {}  // 403, code 'FORBIDDEN'
export class ConflictError extends AppError {}   // 409, code defaults to 'CONFLICT' (e.g. 'SLUG_CONFLICT')
export class ValidationError extends AppError {} // 400, code 'VALIDATION_ERROR', optional details
```

- Each class SHALL set `name` to its class name and SHALL have a JSDoc docblock.
- The handler SHALL respond `{ success: false, error: { code, message, details?, requestId } }`
  with `status`, and SHALL log `AppError`s at `debug` (`4xx`) without the `Unhandled error` line.
- Code introduced or touched by this change (slug conflicts, title validation) SHALL throw these
  classes. Migrating the remaining string-coded throw sites is out of scope; existing controller
  `message === 'X'` mappings SHALL keep working unchanged.

#### Scenario: ConflictError maps to 409 with its code

- **WHEN** a service throws `new ConflictError('SLUG_CONFLICT', 'Could not allocate a unique recipe slug')`
- **THEN** the response status is `409`, `error.code` is `SLUG_CONFLICT` and `error.message` is `Could not allocate a unique recipe slug`

#### Scenario: ValidationError carries details

- **WHEN** a service throws `new ValidationError('Title cannot be empty', [{ field: 'title', message: 'Title cannot be empty' }])`
- **THEN** the response status is `400`, `error.code` is `VALIDATION_ERROR` and `error.details[0].field` is `title`

### Requirement: String-coded domain errors that escape controllers map to client statuses

The API global error handler SHALL map legacy string-coded domain errors (thrown as `new Error('UPPER_SNAKE')`) that no controller handled to a client status instead of `500`, using these message conventions:

| `err.message` | Status | `error.code` | `error.message` |
|---|---|---|---|
| `FORBIDDEN` | 403 | `FORBIDDEN` | `Not authorized` |
| matches `/^[A-Z][A-Z0-9_]*_NOT_FOUND$/` | 404 | `NOT_FOUND` | humanized subject + ` not found` (e.g. `COFFEE_VARIETY_NOT_FOUND` → `Coffee variety not found`) |
| matches `/^ALREADY_[A-Z0-9_]+$/` or `/^[A-Z0-9_]+_ALREADY_EXISTS$/` | 409 | `CONFLICT` | `A record with this value already exists` |
| starts with `VALIDATION_ERROR` | 400 | `VALIDATION_ERROR` | text after the first `:` trimmed, or `Validation failed` |

- The existing `COFFEE_VARIETY_NOT_FOUND` branch SHALL be subsumed by this mapping with an
  identical response.
- Each such mapping SHALL be logged at `warn` as
  `log.warn({ requestId, domainCode, method, path }, 'Unmapped domain error reached global handler')`
  so remaining controller gaps stay visible, and SHALL NOT produce the `Unhandled error` line.
- Any other message SHALL fall through to the `500` branch unchanged.

#### Scenario: Title that sanitizes to empty returns 400

- **WHEN** `POST /api/v1/recipes` is called with `title: '<b></b>'` (passes `z.string().min(1)`, sanitizes to `''`)
- **THEN** the response status is `400`, `error.code` is `VALIDATION_ERROR` and `error.message` is `Title cannot be empty` (today it is `500`)

#### Scenario: Unhandled not-found code returns 404

- **WHEN** a service throws `new Error('RECIPE_NOT_FOUND')` on a route whose controller does not map it
- **THEN** the response status is `404`, `error.code` is `NOT_FOUND` and `error.message` is `Recipe not found`

#### Scenario: Coffee variety not-found response is unchanged

- **WHEN** a service throws `new Error('COFFEE_VARIETY_NOT_FOUND')`
- **THEN** the response is `404` with `error.code === 'NOT_FOUND'` and `error.message === 'Coffee variety not found'`, exactly as before

#### Scenario: Arbitrary errors still return 500

- **WHEN** a handler throws `new Error('boom')`
- **THEN** the response status is `500` and `error.code` is `INTERNAL_ERROR`

### Requirement: Database error logs never contain query parameters or row values

The API SHALL NOT write `DrizzleQueryError` parameters, its parameter-bearing `message`, or `PostgresError` `detail` text to logs, because those values contain user data (emails, usernames, bcrypt password hashes) that the AGENTS.md logging rules forbid.

- Mapped database errors (`4xx`) SHALL be logged at `warn` with only
  `{ requestId, pgCode, constraint, table, method, path }`.
- Unmapped database errors (`500`) SHALL be logged at `error` with a sanitized error object built by
  a helper in `apps/api/src/utils/errors.ts` (`toLoggableError(err)`) that keeps the error name,
  the SQL text without parameters, the SQLSTATE, the constraint name and the stack, and drops
  `params`, `parameters` and `detail`.
- In non-production environments the `500` response message SHALL NOT echo a `DrizzleQueryError`
  message (it embeds parameters); it SHALL use `Database error` instead.
- Every other log entry that carries a caught error which can come from a database query SHALL
  pass it as `err: toLoggableError(err)`: the catches of `notification/service.ts` (its `notify*`
  email helpers swallow mail errors and throw only recipient-lookup errors), the side-effect
  handlers and catches of the comment, recipe and follow services, `evaluateAllBadges`,
  `listAllPublicCollections`, the brew-log service, the `FLUSH_CACHE` audit write, the auth
  middleware, the crawler middleware, the hourly cron job and the `apps/api/src/setup.ts` admin
  bootstrap (a failed admin insert carries the email and the password hash).
  `apps/api/src/utils/db-error-logging.enforcement.test.ts` lists these files and fails when a log
  call in one of them passes a raw `err`; mail-send errors use `toLoggableMailError` instead
  ("Email send failures are logged without recipient addresses").

#### Scenario: Re-registration conflict does not log the password hash

- **WHEN** a user registration insert fails with `23505` on `user_email_unique`
- **THEN** no log line produced for the request contains the submitted email, the username or a bcrypt hash (`$2a$`/`$2b$` prefix)

#### Scenario: Development 500 does not echo parameters

- **WHEN** `APP_ENV=development` and an unmapped `DrizzleQueryError` reaches the handler
- **THEN** the response `error.message` is `Database error` and does not contain the `params:` text

#### Scenario: A failed notification insert does not log its parameters

- **WHEN** the insert of `createFollowNotification` fails with a Drizzle-wrapped error whose message and `params` carry bound values
- **THEN** the `follow notification create failed` entry's `err` equals `toLoggableError` of that error and no logged argument contains a bound value

#### Scenario: A raw caught error in a listed file fails the enforcement test

- **WHEN** a log call in one of the files listed by `db-error-logging.enforcement.test.ts` passes `{ err, … }`
- **THEN** the test fails and names the file and line

### Requirement: Unique-violation detection uses one shared helper

The API SHALL detect unique violations through `isUniqueViolation(err: unknown, constraint?: string): boolean` exported from `apps/api/src/utils/errors.ts` (built on `getPostgresError`), and SHALL remove every ad-hoc unwrapping or message-substring check.

- `apps/api/src/modules/admin/model.ts` `throwIfUniqueViolation` SHALL use the helper instead of
  reading `err.cause` by hand, keeping its `EMAIL_ALREADY_EXISTS` / `USERNAME_ALREADY_EXISTS` output
  for both the exact and the `_lower_unique` constraints.
- `apps/api/src/modules/collection/service.ts` `addRecipeToCollection` SHALL use
  `isUniqueViolation(err, 'collection_item_collection_id_recipe_id_unique')` instead of searching
  `message`/`cause.message` for `unique` or `duplicate`, keeping its `ALREADY_IN_COLLECTION` output.
- Recipe slug allocation SHALL NOT catch unique violations: it claims slugs with
  `insert … on conflict ("slug") do nothing returning` inside the creation transaction (see the
  `recipe-slug` capability). A `recipe_slug_unique` violation that still reaches the global handler
  maps to `409 CONFLICT` like any other unique violation.
- `apps/api/src/modules/auth` registration SHALL translate a `23505` on `user_email_unique` /
  `user_email_lower_unique` / `user_username_unique` / `user_username_lower_unique` from the user
  insert into the existing `EMAIL_ALREADY_EXISTS` / `USERNAME_ALREADY_EXISTS` errors (already mapped
  to `409` by the auth controller). The availability pre-checks cover soft-deleted rows (see
  `unique-identifiers`), so this mapping is the race fallback.
- `grep -rn "includes('unique')\|includes('duplicate')\|\.cause" apps/api/src/modules` SHALL return
  no unique-violation detection code after the change.

#### Scenario: Duplicate collection add is detected structurally

- **WHEN** `addRecipeToCollection` hits `23505` on `collection_item_collection_id_recipe_id_unique` (wrapped in `DrizzleQueryError`)
- **THEN** it throws `ALREADY_IN_COLLECTION` and the route returns `409` with `error.code === 'CONFLICT'`

#### Scenario: Unrelated unique violation is not misreported

- **WHEN** `addRecipeToCollection` fails with a unique violation on a different constraint
- **THEN** it does not throw `ALREADY_IN_COLLECTION`; the error propagates to the global handler (which returns `409 CONFLICT`)

### Requirement: Known race and conflict paths never return 500

The API SHALL answer the audit's reproducible conflict paths with the correct client status and SHALL NOT log them as `Unhandled error`.

| Path | Reproduction | Required result |
|---|---|---|
| Double follow | two concurrent `POST /api/v1/follow/:userId` from one user; both pass `isFollowing`, second insert hits `user_follow_follower_id_following_id_unique` | one `200`/`201`, the other `409` `CONFLICT` |
| Concurrent first rating | two concurrent `POST /api/v1/recipes/:id/rate` from one user with no prior rating | both succeed; exactly one `user_recipe_rating` row holds the last-written value |
| Re-register after deletion | register with the email (any letter case) of a soft-deleted account; the availability pre-check covers soft-deleted rows and the `user_email_unique`/`user_email_lower_unique` mapping is the race fallback | `409` `CONFLICT` `Email already registered` |
| Register race | two concurrent registrations with the same username | one `201`, the other `409` `CONFLICT` `Username already taken` |
| Concurrent version bump | two concurrent `PATCH /api/v1/recipes/:id` with `bumpVersion` computing the same next version number | one success, the other `409` `CONFLICT` |
| Malformed JSON | any JSON route with an unparsable body | `400` `BAD_REQUEST` |
| Duplicate title / second fork | see the `recipe-slug` capability | `201` |

`upsertUserRating` in `apps/api/src/modules/recipe/model.ts` SHALL become a single
`insert … onConflictDoUpdate({ target: [userRecipeRatings.userId, userRecipeRatings.recipeId], set: { rating, updatedAt } })`
statement instead of select-then-insert-or-update.

#### Scenario: Concurrent first rating does not 500

- **WHEN** the same user sends two `POST /api/v1/recipes/:id/rate` requests concurrently with ratings 3 and 4 and no prior rating exists
- **THEN** both responses are `2xx` and exactly one rating row exists with value 3 or 4

#### Scenario: Re-registration with a deleted account's email returns 409

- **WHEN** account A is soft-deleted with its email still stored and a new registration uses A's email
- **THEN** the response is `409` with `error.code === 'CONFLICT'` and `error.message === 'Email already registered'` (today it is `500`)

#### Scenario: Racing follow returns 409

- **WHEN** the follow insert raises `23505` after the `isFollowing` pre-check passed
- **THEN** the response is `409` with `error.code === 'CONFLICT'`

### Requirement: Error handler tests use realistic error shapes

The API test suite SHALL replace the tautological checks in `apps/api/src/middleware/errorHandler.test.ts` (which assert on objects the test itself builds) with tests that call `errorHandler` with realistic errors and exercise the full Hono pipeline.

- Unit tests SHALL construct a real `DrizzleQueryError` (imported from `drizzle-orm` in the test
  file only) whose `cause` is a `PostgresError`-shaped object, for codes `23505`, `23503` (insert and
  delete), `23514`, `22P02` and an unknown code, plus a bare `PostgresError`, an `HTTPException`, an
  `AppError` of each subclass, each legacy string convention, and an arbitrary `Error`.
- Each unit test SHALL assert status, `error.code`, `error.message`, `requestId` and, for database
  errors, that the body and the captured log calls contain no parameter values.
- A route-level test SHALL mount the real app (`createTestApp` / `app.request`) and send a malformed
  JSON body, asserting `400 BAD_REQUEST`.
- A DB-backed test against `brewform_test` SHALL trigger a real unique violation through a model
  insert (e.g. inserting the same `user_follow` pair twice via the model, or adding the same recipe to
  a collection twice by calling `model.addItem` directly) and assert the HTTP response is `409`.

#### Scenario: Old wrapped-error blind spot is covered

- **WHEN** the new `DrizzleQueryError` 23505 unit test is run against the pre-change `errorHandler.ts`
- **THEN** it fails (status `500`), proving the regression test exercises the bug

#### Scenario: Suite passes after the fix

- **WHEN** `make test-api` runs after the change
- **THEN** all error-handler unit, route and DB-backed tests pass

### Requirement: OpenAPI documents newly reachable error statuses

Routes whose reachable error statuses change in this change SHALL document them in `describeRoute` with `resolver(ErrorEnvelopeSchema)`, keeping `zValidator` as the request validator and without changing success response shapes.

- `POST /api/v1/recipes`, `PATCH /api/v1/recipes/:id`, `POST /api/v1/recipes/:id/fork` and
  `POST /api/v1/recipes/merge` SHALL document `400` (validation, including a title that sanitizes
  to empty) and `409` (`SLUG_CONFLICT` on create/fork/merge; version conflict on update).
- `POST /api/v1/auth/register` SHALL document `409` for email/username conflicts if not already
  documented.

#### Scenario: Coverage test passes with the new responses

- **WHEN** `apps/api/src/routes/openapi.coverage.test.ts` runs after the change
- **THEN** it passes and the generated spec at `/api/v1/openapi.json` lists `409` for `POST /api/v1/recipes`

### Requirement: Email send failures are logged without recipient addresses

Every log entry for a failed email send, and for any error caught around one, SHALL pass the error through `toLoggableMailError` from `apps/api/src/utils/errors.ts`, which keeps only the error name, `code`, `command`, `responseCode` and the stack frames for mail errors (database errors go through `toLoggableError`), because nodemailer puts recipient addresses into `message`, `response`, `rejected` and `rejectedErrors[].recipient`.

- This covers `apps/api/src/modules/auth/email.ts`, the verification and password-reset catches in
  `auth/service.ts`, the welcome-email catch in `admin/service.ts`, the notification `sendEmail` in
  `apps/api/src/utils/notify/index.ts` and the contact route.

#### Scenario: A rejected recipient does not reach the logs

- **WHEN** the SMTP server rejects every recipient of a welcome email to `victim@example.com` (nodemailer `EENVELOPE` with `rejected: ['victim@example.com']` and the reply `550 5.1.1 <victim@example.com>` in its message)
- **THEN** the error log entry has `code: 'EENVELOPE'`, `command: 'RCPT TO'` and `responseCode: 550`
- **AND** no log entry contains `victim@example.com`

#### Scenario: Database errors keep the database-safe shape

- **WHEN** the verification-token insert fails during registration with a Drizzle-wrapped Postgres error
- **THEN** the warn log carries the same `err` object `toLoggableError` produces (no query parameters)

