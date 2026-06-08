## Why

After a user deletes their account via Settings → Danger Zone → "Delete Account", the
deletion handler at `apps/web/src/pages/settings/SettingsPage.tsx:76-82` calls
`api.delete('/users/me')` but never clears auth state or redirects. The user remains on the
Settings page with stale UI — their data still renders, the nav shows they're logged in, but
their account no longer exists server-side. Any subsequent API call fails with 401/404, and
the user has no idea what happened.

The handler also swallows errors silently: the `catch` block is empty, so network failures or
server errors leave zero feedback.

Additionally, the error-vs-success message color logic at line 105 uses fragile
language-specific substring matching (`message.includes('Failed') || message.includes('kaydedilemedi')`).
This pattern cannot distinguish error from success for any message that doesn't happen to
contain one of those two magic strings — a bug that surfaces immediately when adding new error
translations.

## What Changes

- **`SettingsPage.tsx`** — Extend the deletion handler to call `logout()` and
  `navigate('/')` after a successful `DELETE /users/me`. Add proper error handling with
  structured logging and a user-facing error message. Clear any stale message before starting
  deletion (consistent with `savePreferences`). Add a JSDoc block documenting the function's
  behavior and side effects.

- **`SettingsPage.tsx`** — Replace the fragile substring-matching message color logic with an
  explicit `messageType` state discriminated as `'success' | 'error' | null`. Update all
  `setMessage()` call sites (`savePreferences` and `handleDeleteAccount`) to also set
  `messageType`. This makes the logic language-agnostic and prevents the same class of bugs
  for all future translations.

- **`packages/shared/src/i18n/en.json`** — Add `settings.deleteFailed` key for the English
  deletion error message.

- **`packages/shared/src/i18n/tr.json`** — Add `settings.deleteFailed` key for the Turkish
  deletion error message.

- **`apps/web/src/pages/settings/SettingsPage.test.tsx`** — New test file covering the
  deletion flow (success, failure, cancel), message color logic (both locales), and the
  `messageType` refactoring. Uses Vitest, Testing Library, and React Router memory router
  matching the existing test patterns in the codebase.

No backend changes. No schema changes. No new dependencies.

## Capabilities

### New Capability

- **`account-deletion`**: Defines what happens when a user deletes their account through the
  settings page — auth state cleanup, navigation, error messaging, logging, i18n coverage,
  and automated test coverage.
