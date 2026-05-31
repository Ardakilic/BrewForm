# D16 — Account Deletion Doesn't Logout

## Severity

**Medium**

## Issue Description

After a user successfully deletes their account via the Settings page, they remain "logged in" with stale state. The deletion handler calls the API but doesn't clear the auth state or redirect:

```ts
// SettingsPage.tsx:57-63
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
| `apps/web/src/pages/settings/SettingsPage.tsx` | 57-63 | Deletion handler |
| `apps/web/src/contexts/AuthContext.tsx` | 60-67 | `logout()` function |

## Fix Approach

Call `logout()` and `navigate('/')` after successful deletion.

### Current Code

```ts
async function handleDeleteAccount() {
  if (!globalThis.confirm(t('settings.deleteConfirm'))) return;
  try {
    await api.delete('/users/me');
  } catch {
  }
}
```

### Fixed Code

```ts
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

## Implementation Steps

1. Read `SettingsPage.tsx` to find the deletion handler (lines 57-63)
2. Add `useAuth()` destructuring to include `logout` (currently only destructures `user` and `refreshUser`)
3. Add `useNavigate()` from `react-router` (already imported but not used for deletion)
4. After `api.delete('/users/me')` succeeds, call `await logout()`
5. After logout, call `navigate('/')` to redirect to home
6. Add error handling with user-facing message in the `catch` block
7. Add a success message before redirect (brief flash is fine since user will be redirected)
8. Test the deletion flow end-to-end

## Testing Strategy

- Log in as a test user
- Navigate to Settings → Danger Zone
- Click "Delete Account" → confirm
- Verify: user is redirected to home page
- Verify: user is logged out (nav shows login/register links)
- Try to access `/settings` — verify redirect to login
- Verify API returns 401 for the deleted user's session
- Test cancel flow — click "Delete Account" → cancel → verify nothing happens

## Risk Assessment

- **Low**: Simple addition of two function calls after the API call
- **Low**: `logout()` already handles cookie/session cleanup
- **Low**: No backend changes needed — the delete endpoint already works

## Dependencies

- None (standalone fix)
