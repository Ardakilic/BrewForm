# D16 — Account Deletion Doesn't Logout

## Severity

**Medium**

## Issue Description

After a user successfully deletes their account via the Settings page, they remain "logged in" with stale state. The deletion handler calls the API but doesn't clear the auth state or redirect:

```ts
// SettingsPage.tsx:76-82
async function handleDeleteAccount() {
  if (!globalThis.confirm(t('settings.deleteConfirm'))) return;
  try {
    await api.delete('/users/me');
  } catch {
  }
}
```

## Impact

- **UX**: User clicks "Delete Account", confirms, sees no feedback, and remains on the Settings page with their data still displayed. They appear logged in but their account no longer exists.
- **Stale state**: `AuthContext` still holds the deleted user object. Any subsequent API calls will fail with 401/404 errors.
- **No redirect**: User is not sent to the home page or login page after deletion.

## Root Cause

The `handleDeleteAccount` function doesn't call `logout()` from `AuthContext` or `navigate('/')` after a successful deletion. The error case is also silently swallowed.

## Affected Files

| File | Lines | Description |
|------|-------|-------------|
| `apps/web/src/pages/settings/SettingsPage.tsx` | 76–82 | Deletion handler |
| `apps/web/src/contexts/AuthContext.tsx` | 48–55 | `logout()` function |
| `packages/shared/src/i18n/en.json` | — | Add `settings.deleteFailed` key |
| `packages/shared/src/i18n/tr.json` | — | Add `settings.deleteFailed` key |

## Fix Approach

Import `useNavigate`, destructure `logout` from `useAuth()`, then call both after a successful deletion. Add a missing `settings.deleteFailed` translation key to both locale files.

### Current Code

```ts
// SettingsPage.tsx:76-82
async function handleDeleteAccount() {
  if (!globalThis.confirm(t('settings.deleteConfirm'))) return;
  try {
    await api.delete('/users/me');
  } catch {
  }
}
```

### Fixed Code

**`apps/web/src/pages/settings/SettingsPage.tsx`** — extend the `react-router` import, destructure `logout`, add `useNavigate`:

```ts
// Line 2 — extend existing import
import { useLoaderData, useNavigate } from 'react-router';

// Line 32 — extend existing useAuth() destructuring
const { user, refreshUser, logout } = useAuth();

// Add inside component body alongside other hooks
const navigate = useNavigate();

// Lines 76-82 — updated handler
async function handleDeleteAccount() {
  if (!globalThis.confirm(t('settings.deleteConfirm'))) return;
  try {
    await api.delete('/users/me');
    await logout(); // Clear auth state
    navigate('/');  // Redirect to home
  } catch (err) {
    log.error({ err }, 'Account deletion failed');
    setMessage(t('settings.deleteFailed'));
  }
}
```

**`packages/shared/src/i18n/en.json`** — add new key (alongside the existing `settings.failedMsg` entry):

```json
"settings.deleteFailed": "Account deletion failed."
```

**`packages/shared/src/i18n/tr.json`** — add new key (alongside the existing `settings.failedMsg` entry):

```json
"settings.deleteFailed": "Hesap silinemedi."
```

## Implementation Steps

1. Read `SettingsPage.tsx` to find the deletion handler (lines 76–82)
2. Extend the `react-router` import on line 2 from `{ useLoaderData }` to `{ useLoaderData, useNavigate }`
3. Add `useNavigate` from `react-router` — it is **not** currently imported in `SettingsPage.tsx`; add `const navigate = useNavigate()` inside the component alongside the other hook calls
4. Add `logout` to the `useAuth()` destructuring on line 32 (currently only destructures `user` and `refreshUser`)
5. After `api.delete('/users/me')` succeeds, call `await logout()` to clear auth state
6. After logout, call `navigate('/')` to redirect to home
7. Add error handling with a user-facing message in the `catch` block using `t('settings.deleteFailed')`
8. Add the `settings.deleteFailed` translation key to **both** `packages/shared/src/i18n/en.json` and `packages/shared/src/i18n/tr.json` — this key does not currently exist and `t()` falls back to returning the raw key string, so it must be added before the error path is usable
9. Test the deletion flow end-to-end

## Testing Strategy

- Log in as a test user
- Navigate to Settings → Danger Zone
- Click "Delete Account" → confirm
- Verify: user is redirected to home page
- Verify: user is logged out (nav shows login/register links)
- Try to access `/settings` — verify redirect to login
- Verify API returns 401 for the deleted user's session
- Test cancel flow — click "Delete Account" → cancel → verify nothing happens
- Simulate a network failure on `DELETE /users/me` and verify the `settings.deleteFailed` error message renders correctly in both `en` and `tr` locales

## Risk Assessment

- **Low**: Simple addition of two function calls after the API call
- **Low**: `logout()` already handles cookie/session cleanup; it catches and ignores errors internally, so calling it on a deleted account's session is safe
- **Low**: No backend changes needed — the delete endpoint already works
- **Low**: Two new i18n keys with no structural schema changes

## Dependencies

- None (standalone fix)