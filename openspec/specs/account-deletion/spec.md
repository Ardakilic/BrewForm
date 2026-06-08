# account-deletion Specification

## Purpose

Define the account-deletion capability for authenticated users. The Settings page exposes a
"Delete Account" action in the Danger Zone that lets a user permanently remove their own
account, their personal data, and any related sessions. After a successful deletion the
frontend MUST clear local auth state and redirect to the public home page, leaving no
half-authenticated UI. Failures (network errors, server errors) MUST be surfaced to the user
through a translated banner so they can retry, and the user MUST stay authenticated until
deletion actually succeeds. The capability exists so that "delete my account" reliably means
"delete my account" — no stale session, no silent failures, no language-specific rendering
bugs.
## Requirements
### Requirement: Post-deletion auth cleanup and redirect

When a user successfully deletes their account via the Settings page, the application SHALL
clear the local auth state (`AuthContext.user` set to `null`) and redirect the browser to the
home page (`/`). The logout MUST happen before the navigation so the home page does not mount
with stale auth state.

The `logout()` function from `AuthContext` SHALL be used for auth cleanup. Even though its
internal `authApi.logout()` call will likely fail against an already-deleted account's session,
the function unconditionally calls `setUser(null)` after catching any errors, which is the
critical side effect.

The redirect target SHALL be `/` (the public home page), not `/login`. The home page is public
and does not require authentication, so there is no redirect loop risk.

#### Scenario: Successful deletion logs out and redirects

- **GIVEN** a logged-in user on `/settings`
- **WHEN** the user clicks "Delete Account", confirms the browser dialog, and `DELETE
  /users/me` returns 200
- **THEN** `AuthContext.user` is set to `null`
- **AND** the browser navigates to `/`
- **AND** the navbar shows Login/Sign Up links (not the user's avatar)
- **AND** visiting `/settings` again redirects to `/login` (via `RequireAuth`)

#### Scenario: Cancel dialog does nothing

- **GIVEN** a logged-in user on `/settings`
- **WHEN** the user clicks "Delete Account" and then cancels the `confirm()` dialog
- **THEN** no API call is made, auth state is unchanged, and the user stays on `/settings`

#### Scenario: Pre-existing message is cleared before deletion

- **GIVEN** a user who previously saved preferences and sees a "Preferences saved!" (or "Failed
  to save preferences.") banner
- **WHEN** the user initiates account deletion (clicks the button, before confirmation)
- **THEN** the banner is cleared (`setMessage('')` and `setMessageType(null)`)

---

### Requirement: Error handling with user-facing message and structured logging

When `DELETE /users/me` fails for any reason (network error, 500, 401), the handler SHALL:

1. Log the error via the existing `log` instance (`log.error({ err }, 'Account deletion
   failed')`) following the structured logging rules in AGENTS.md.
2. Display a user-facing error message via the existing banner using the
   `settings.deleteFailed` translation key.
3. NOT log out the user or redirect — the account still exists, so the user stays on the
   Settings page.

The error message SHALL be displayed with the error color (`var(--error)`), determined by the
`messageType` state being set to `'error'`.

#### Scenario: Network failure shows error message (English)

- **GIVEN** a logged-in user on `/settings` with locale `en`
- **WHEN** the user confirms deletion and the `DELETE /users/me` request fails (network error)
- **THEN** a red banner appears with the text "Account deletion failed."
- **AND** the user remains on `/settings` with their auth state intact
- **AND** `log.error({ err }, 'Account deletion failed')` is emitted

#### Scenario: Network failure shows error message (Turkish)

- **GIVEN** a logged-in user on `/settings` with locale `tr`
- **WHEN** the user confirms deletion and the `DELETE /users/me` request fails (network error)
- **THEN** a red banner appears with the text "Hesap silinemedi."
- **AND** the user remains on `/settings` with their auth state intact

---

### Requirement: Language-agnostic message color logic

The Settings page error/success banner color SHALL NOT be determined by substring matching on
the translated message text. Instead, an explicit `messageType` state variable discriminated as
`'success' | 'error' | null` SHALL be maintained alongside the `message` text state.

Every call to `setMessage()` within the `SettingsPage` component SHALL be paired with a
corresponding `setMessageType()` call:

| Context | `setMessage('...')` | `setMessageType(...)` |
|----------|---------------------|----------------------|
| Clearing message (reset) | `''` | `null` |
| Preferences saved | `t('settings.savedMsg')` | `'success'` |
| Preferences save failed | `t('settings.failedMsg')` | `'error'` |
| Account deletion failed | `t('settings.deleteFailed')` | `'error'` |

The JSX style condition SHALL be:

```tsx
backgroundColor: messageType === 'error' ? 'var(--error)' : 'var(--success)'
```

This replaces the current:

```tsx
backgroundColor: message.includes('Failed') || message.includes('kaydedilemedi')
  ? 'var(--error)' : 'var(--success)'
```

#### Scenario: Preferences save success shows green

- **GIVEN** a user on `/settings` with any locale
- **WHEN** they click "Save Preferences" and the PATCH succeeds
- **THEN** the banner shows with `var(--success)` background color

#### Scenario: Preferences save failure shows red

- **GIVEN** a user on `/settings` with any locale
- **WHEN** they click "Save Preferences" and the PATCH fails
- **THEN** the banner shows with `var(--error)` background color

#### Scenario: Deletion failure shows red (English)

- **GIVEN** a user on `/settings` with locale `en`
- **WHEN** deletion fails
- **THEN** the banner shows with `var(--error)` background color
- **AND** the text is "Account deletion failed."

#### Scenario: Deletion failure shows red (Turkish)

- **GIVEN** a user on `/settings` with locale `tr`
- **WHEN** deletion fails
- **THEN** the banner shows with `var(--error)` background color
- **AND** the text is "Hesap silinemedi."

---

### Requirement: JSDoc on `handleDeleteAccount`

The `handleDeleteAccount` function SHALL carry a JSDoc block documenting its behavior,
side effects (`logout()` clears auth state, `navigate('/')` redirects to home), and error
handling path. The format SHALL follow the existing conventions in `SettingsPage.tsx`
(existing JSDoc on `savePreferences` at line 40) and the codebase pattern of using
`{@link ...}` inline tags for cross-references.

#### Scenario: JSDoc exists on handleDeleteAccount

- **WHEN** `apps/web/src/pages/settings/SettingsPage.tsx` is inspected
- **THEN** the `handleDeleteAccount` function has a `/** ... */` JSDoc block above its
  declaration

---

### Requirement: i18n coverage for deletion error

The translation key `settings.deleteFailed` SHALL exist in both `packages/shared/src/i18n/en.json`
and `packages/shared/src/i18n/tr.json`.

The English value SHALL be `"Account deletion failed."`.

The Turkish value SHALL be `"Hesap silinemedi."`.

#### Scenario: English translation key exists

- **GIVEN** the file `packages/shared/src/i18n/en.json`
- **THEN** the key `settings.deleteFailed` exists with value `"Account deletion failed."`

#### Scenario: Turkish translation key exists

- **GIVEN** the file `packages/shared/src/i18n/tr.json`
- **THEN** the key `settings.deleteFailed` exists with value `"Hesap silinemedi."`

---

### Requirement: Automated test coverage

The deletion flow, message color logic, and `messageType` refactoring SHALL have automated
test coverage in a new test file at `apps/web/src/pages/settings/SettingsPage.test.tsx`.

The test file SHALL follow the established web test conventions:

- Module-level `vi.mock()` hoisting for all external dependencies (contexts, API client,
  logger, SEOHead)
- `createMemoryRouter` + `RouterProvider` for rendering with the page's loader
- `@testing-library/react` for rendering and queries
- `@testing-library/user-event` or `fireEvent` for interactions
- `@testing-library/jest-dom` matchers (via `test-setup.ts`)

#### Scenario: Test file renders without crashing

- **WHEN** `SettingsPage.test.tsx` is loaded by Vitest
- **THEN** the module-level mocks compile and set up without errors

#### Scenario: Successful deletion test

- **GIVEN** `api.delete` resolves successfully and `globalThis.confirm` returns `true`
- **WHEN** the Delete Account button is clicked
- **THEN** `logout` (from `useAuth`) is called exactly once
- **AND** the router navigates to `/`
- **AND** `api.delete('/users/me')` is called exactly once

#### Scenario: Failed deletion test

- **GIVEN** `api.delete` rejects with an error and `globalThis.confirm` returns `true`
- **WHEN** the Delete Account button is clicked and the dialog is confirmed
- **THEN** the error banner is visible with the correct translated text
- **AND** the banner has the error styling (`var(--error)` background)
- **AND** `logout` is NOT called
- **AND** the router remains on `/settings`

#### Scenario: Cancel dialog test

- **GIVEN** `globalThis.confirm` returns `false`
- **WHEN** the Delete Account button is clicked
- **THEN** `api.delete` is NOT called
- **AND** `logout` is NOT called
- **AND** the router remains on `/settings`

#### Scenario: Preferences save success banner color (messageType regression)

- **GIVEN** `api.patch` resolves successfully
- **WHEN** the Save Preferences button is clicked
- **THEN** the success message is visible with `var(--success)` background styling

#### Scenario: Preferences save failure banner color (messageType regression)

- **GIVEN** `api.patch` rejects
- **WHEN** the Save Preferences button is clicked
- **THEN** the error message is visible with `var(--error)` background styling

#### Scenario: Turkish error message displays correctly

- **GIVEN** locale is `tr` and `api.delete` rejects
- **WHEN** the Delete Account button is clicked and confirmed
- **THEN** the error banner displays "Hesap silinemedi." with red (`var(--error)`) background

