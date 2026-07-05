## ADDED Requirements

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
  logout: () => Promise<void>;
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