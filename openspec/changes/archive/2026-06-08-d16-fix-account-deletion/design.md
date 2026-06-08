## Context

`SettingsPage.tsx` is a client-side React component rendered under `<RequireAuth>` at route
`/settings`. It loads user preferences via a `loader` (which calls `GET /preferences`) and
renders sections for profile info, appearance, preferences, email notifications, and a danger
zone with a "Delete Account" button.

The current deletion handler (lines 76-82) calls `api.delete('/users/me')` and does nothing
else — no state cleanup, no redirect, no error handling. This design doc captures the
decisions made to close that gap.

## Decisions

### 1. Order of operations: logout → navigate

The handler calls `await logout()` (which sets `AuthContext.user` to `null` via
`setUser(null)`) and THEN calls `navigate('/')`. This order is intentional:

- `/` is a public route (no `RequireAuth` guard), so navigating with a null user is safe.
- If we navigated before logout, the HomePage would briefly mount with stale auth state
  before `setUser(null)` fires.
- `logout()` is async but the only async part is `authApi.logout()` which is expected to fail
  after account deletion (the session/cookie is already invalid). The error is caught and
  ignored; `setUser(null)` always runs.

Alternative considered: calling `navigate('/login')` directly. Rejected because `/login` may
redirect back if the router has a pending navigation state, and the idiomatic flow for
post-deletion is the home page.

### 2. Explicit `messageType` state for error-vs-success styling

The current display logic at line 105:

```tsx
backgroundColor: message.includes('Failed') || message.includes('kaydedilemedi')
  ? 'var(--error)' : 'var(--success)',
```

is fragile. It requires every error translation to coincidentally contain the substring
`"Failed"` (English) or `"kaydedilemedi"` (Turkish). The proposed `settings.deleteFailed`
translations — `"Account deletion failed."` (en) and `"Hesap silinemedi."` (tr) — match
neither substring, so both would render with the green success background.

**Decision**: Replace substring matching with an explicit discriminated union:

```ts
const [messageType, setMessageType] = useState<'success' | 'error' | null>(null);
```

All message-setting code paths explicitly set the type:

| Code path | `setMessage(...)` | `setMessageType(...)` |
|-----------|-------------------|----------------------|
| `savePreferences` start | `''` | `null` |
| `savePreferences` success | `t('settings.savedMsg')` | `'success'` |
| `savePreferences` failure | `t('settings.failedMsg')` | `'error'` |
| `handleDeleteAccount` start | `''` | `null` |
| `handleDeleteAccount` failure | `t('settings.deleteFailed')` | `'error'` |

The JSX condition becomes:

```tsx
backgroundColor: messageType === 'error' ? 'var(--error)' : 'var(--success)',
```

This is language-agnostic and immune to translation changes. It does not change the visual
behavior for existing flows (`settings.savedMsg` / `settings.failedMsg`).

### 3. Using `api.delete('/users/me')` directly vs `userApi.deleteAccount()`

The web API module at `apps/web/src/api/index.ts:32` already defines:

```ts
deleteAccount: () => api.delete<{ message: string }>('/users/me'),
```

Switching to `userApi.deleteAccount()` would add type safety on the response shape and follow
the module's encapsulation pattern. However, the SettingsPage currently imports only `{ api }`
from `'../../api/client.ts'`, not from `'../../api/index.ts'`. Switching would require
changing the import and changing another file — adding surface area beyond the fix.

**Decision**: Keep using `api.delete('/users/me')` directly. The endpoint string is stable and
the response shape is not consumed (the handler ignores the response and immediately logs out).
A follow-up refactor can centralize all raw `api.delete('/users/me')` call sites to
`userApi.deleteAccount()`.

### 4. Clearing stale messages before deletion

`savePreferences` calls `setMessage('')` at the top before making the API call. The current
`handleDeleteAccount` does not. If a user saves preferences (getting a success/error banner),
then immediately deletes their account, the stale banner persists during the deletion
confirmation dialog and briefly after.

**Decision**: Call `setMessage('')` and `setMessageType(null)` at the start of
`handleDeleteAccount`, matching the `savePreferences` pattern.

### 5. Test approach

**Decision**: Create a new test file at `apps/web/src/pages/settings/SettingsPage.test.tsx`
using the established Vitest + Testing Library + React Router memory router pattern.

The test file follows the conventions observed across 48 existing web test files:

- **Module-level `vi.mock()` hoisting** for I18nContext, AuthContext, ThemeContext, API client,
  logger, and SEOHead — all declared before any imports, matching the lazy import pattern.
- **`createMemoryRouter` + `RouterProvider`** for rendering the page with its loader.
- **`vi.mocked()`** for typed mock references.
- **Translation mock** returning a simple `Record<string, string>` lookup for both `en` and
  `tr` locales.
- **Auth mock** with `logout: vi.fn()` to assert it was called.
- **`globalThis.confirm`** stubbed via `vi.spyOn(globalThis, 'confirm')` for accept/cancel
  scenarios.
- **`fireEvent.click`** or **`userEvent`** for triggering the Delete Account button.
- **`waitFor`** for async assertions (navigation, error banner visibility).

The test file is colocated alongside the source (`SettingsPage.test.tsx` next to
`SettingsPage.tsx`), matching the pattern used by `LoginPage.test.tsx`,
`RecipeListPage.test.tsx`, and 42 other page/component test files.

## Risks / Trade-offs

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `authApi.logout()` inside `logout()` hits the server with an already-invalidated session (account deleted) | Near-certain | `logout()` catches and ignores the error; `setUser(null)` runs unconditionally |
| Flash of null content between `setUser(null)` and `navigate('/')` | Low | React 18 batches the state update with the navigation, and `/` is a fast-mounting page |
| The `messageType` refactor accidentally changes color for existing flows | None | Every existing `setMessage()` call is updated to also set `messageType`; the mapping is 1:1 with the old substring behavior |
| Turkish error messages could still render green for future additions | None | `messageType` is explicit per call site, not derived from translation content |
| Test assertions on `navigate('/')` via router state are fragile | Low | React Router's `createMemoryRouter` exposes `state.location.pathname` as a stable API; all 48 existing tests rely on it |

## Open Questions

None. This is a straightforward frontend-only fix with tests covering the new and modified
behavior.
