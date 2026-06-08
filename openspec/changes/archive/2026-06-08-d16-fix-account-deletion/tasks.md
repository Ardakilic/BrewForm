## 1. Add `messageType` state and refactor message color logic

- [x] 1.1 Open `apps/web/src/pages/settings/SettingsPage.tsx`. On line 39 (after
  `const [message, setMessage] = useState('');`), add:

  ```ts
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(null);
  ```

- [x] 1.2 In the `savePreferences` function (lines ~46-73), update each `setMessage()` call
  to also set `messageType`:

  a. At the start (where `setMessage('')` is called, around line 49): add
     `setMessageType(null);` on the next line.

  b. In the `try` block (where `setMessage(t('settings.savedMsg'))` is called, around line
     58): add `setMessageType('success');` on the next line.

  c. In the `catch` block (where `setMessage(t('settings.failedMsg'))` is called, around line
     60): add `setMessageType('error');` on the next line.

- [x] 1.3 Locate the message display JSX (the `{message && (` block). Replace the
  `backgroundColor` line from:

  ```tsx
  backgroundColor: message.includes('Failed') || message.includes('kaydedilemedi')
    ? 'var(--error)'
    : 'var(--success)',
  ```

  to:

  ```tsx
  backgroundColor: messageType === 'error' ? 'var(--error)' : 'var(--success)',
  ```

  Note: the full JSX block spans lines ~96-107 (exact lines may shift after edits). Search
  for `message.includes('Failed')` to find the exact location.

- [x] 1.4 Run `make check` and `make check-web`. Confirm zero new type or lint errors.

## 2. Update `handleDeleteAccount` with logout, navigate, error handling, and JSDoc

- [x] 2.1 On line 2, extend the `react-router` import from:

  ```ts
  import { useLoaderData } from 'react-router';
  ```

  to:

  ```ts
  import { useLoaderData, useNavigate } from 'react-router';
  ```

- [x] 2.2 On line 32, add `logout` to the `useAuth()` destructuring:

  ```ts
  // Before:
  const { user, refreshUser } = useAuth();
  // After:
  const { user, refreshUser, logout } = useAuth();
  ```

- [x] 2.3 After the `useState` declarations (after line 39, before `savePreferences`), add
  the `useNavigate` hook:

  ```ts
  const navigate = useNavigate();
  ```

- [x] 2.4 Add a JSDoc block above `handleDeleteAccount` following the conventions in this
  file (the existing `savePreferences` JSDoc at lines 40-46) and the codebase's `{@link}`
  inline tag pattern:

  ```ts
  /**
   * Delete the current user's account and clean up frontend state.
   *
   * Calls {@link logout} to clear {@link AuthContext} (sets user to {@code null}, then
   * attempts the server-side logout endpoint — expected to fail since the account is
   * already deleted, but the local state cleanup always runs). Then calls
   * {@link navigate} to redirect to the public home page ({@code /}).
   *
   * On failure the error is logged and a user-facing error message is displayed via the
   * shared banner. The auth state is preserved so the user can retry.
   */
  ```

  Place this block immediately above `async function handleDeleteAccount()`.

- [x] 2.5 Replace the body of `handleDeleteAccount` with:

  ```ts
  async function handleDeleteAccount() {
    if (!globalThis.confirm(t('settings.deleteConfirm'))) return;
    setMessage('');
    setMessageType(null);
    try {
      await api.delete('/users/me');
      await logout();
      navigate('/');
    } catch (err) {
      log.error({ err }, 'Account deletion failed');
      setMessage(t('settings.deleteFailed'));
      setMessageType('error');
    }
  }
  ```

  Key points:
  - `setMessage('')` and `setMessageType(null)` clear any stale banner (matching
    `savePreferences` pattern).
  - `await logout()` is called after successful deletion. Its internal `authApi.logout()` call
    will most likely fail (account already deleted), but `setUser(null)` runs unconditionally
    — which is the side effect we need.
  - `navigate('/')` targets the public home page.
  - The `catch` block logs the error with structured logging, then sets the error message and
    message type.
  - The user is NOT logged out or redirected on error — the account still exists.

- [x] 2.6 Run `make check` and `make check-web`. Confirm zero new errors.

## 3. Add i18n translation keys

- [x] 3.1 Open `packages/shared/src/i18n/en.json`. The file is a single JSON object. Find the
  `settings.failedMsg` entry. Add a new key on the next line:

  ```json
  "settings.deleteFailed": "Account deletion failed.",
  ```

  Verify: the JSON remains valid (trailing comma before this line if it's not the last key;
  no trailing comma after if it IS the last key — use the existing file's pattern).

- [x] 3.2 Open `packages/shared/src/i18n/tr.json`. Find `settings.failedMsg`. Add on the
  next line:

  ```json
  "settings.deleteFailed": "Hesap silinemedi.",
  ```

- [x] 3.3 Run `make check` to confirm JSON validity and zero new errors.

## 4. Create test file at `apps/web/src/pages/settings/SettingsPage.test.tsx`

This test file follows the established patterns from the 48 existing `*.test.tsx` files.
Key conventions:
- Module-level `vi.mock()` calls BEFORE imports (Vitest hoists them)
- `vi.mocked()` for typed mock references
- `@testing-library/jest-dom` matchers auto-loaded via `test-setup.ts` (no explicit import
  needed; `toBeInTheDocument()`, `toHaveBeenCalled()`, etc. work globally)
- `createMemoryRouter` + `RouterProvider` for rendering pages with loaders
- `globalThis.confirm` stubbed via `vi.spyOn(globalThis, 'confirm')`
- `waitFor` for async assertions (navigation, banner appearance)

> **Caveat — `userEvent` API style**: `@testing-library/user-event` v14+ requires calling
> `userEvent.setup()` before use. The test snippets in this task use the direct
> `await userEvent.click(...)` style. If the installed version is v14+, replace each
> `await userEvent.click(...)` with:
> ```ts
> const user = userEvent.setup();
> await user.click(...);
> ```
> Check one existing test (e.g., `LoginPage.test.tsx`) to confirm the convention before
> writing. This is the only stylistic variability — the test logic, assertions, and mock
> setup are correct regardless of which style the codebase uses.

- [x] 4.1 Create the file `apps/web/src/pages/settings/SettingsPage.test.tsx` with the
  following structure. The test file MUST follow this exact pattern — placing all `vi.mock()`
  calls at module top-level BEFORE any imports:

  ```tsx
  // ── Module-level mocks (hoisted by Vitest — MUST come before imports) ──

  vi.mock('../../contexts/I18nContext.tsx', () => ({
    I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useTranslation: vi.fn(),
  }));

  vi.mock('../../contexts/AuthContext.tsx', () => ({
    AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useAuth: vi.fn(),
  }));

  vi.mock('../../contexts/ThemeContext.tsx', () => ({
    useTheme: vi.fn(),
  }));

  vi.mock('../../api/client.ts', () => ({
    api: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  }));

  vi.mock('@/utils/logger.ts', () => ({
    createLogger: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }));

  vi.mock('../../components/seo/SEOHead.tsx', () => ({
    SEOHead: () => null,
  }));

  // ── Imports (after all vi.mock calls) ──

  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { render, screen, waitFor } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import { createMemoryRouter, RouterProvider } from 'react-router';
  import { useAuth } from '../../contexts/AuthContext.tsx';
  import { useTranslation } from '../../contexts/I18nContext.tsx';
  import { useTheme } from '../../contexts/ThemeContext.tsx';
  import { api } from '../../api/client.ts';
  import SettingsPage, { loader } from './SettingsPage.tsx';

  // ── Typed mock references ──

  const mockUseAuth = vi.mocked(useAuth);
  const mockUseTranslation = vi.mocked(useTranslation);
  const mockUseTheme = vi.mocked(useTheme);
  const mockApi = vi.mocked(api);

  // ── Shared mock state ──

  const mockLogout = vi.fn();
  const authenticatedUser = {
    id: 'user-1',
    email: 'alice@example.com',
    emailVerifiedAt: null,
    username: 'alice',
    displayName: 'Alice',
    avatarUrl: null,
    isAdmin: false,
    onboardingCompleted: true,
  };

  const mockPreferences = {
    unitSystem: 'metric' as const,
    temperatureUnit: 'celsius' as const,
    locale: 'en',
    timezone: 'UTC',
    dateFormat: 'YYYY_MM_DD',
    emailNotifications: {
      newFollower: true,
      recipeLiked: true,
      recipeCommented: false,
      followedUserPosted: true,
    },
  };
  ```

- [x] 4.2 Add the `beforeEach` hook and translation tables:

  ```tsx
  const enT = (key: string) => {
    const map: Record<string, string> = {
      'settings.title': 'Settings',
      'settings.profile': 'Profile',
      'settings.appearance': 'Appearance',
      'settings.displayName': 'Display Name',
      'settings.notSet': 'Not set',
      'auth.username': 'Username',
      'auth.email': 'Email',
      'settings.saving': 'Saving...',
      'settings.savePreferences': 'Save Preferences',
      'settings.saveNotifications': 'Save Notifications',
      'settings.unitSystem.metric': 'Metric (g, ml, °C)',
      'settings.unitSystem.imperial': 'Imperial (oz, fl oz, °F)',
      'settings.temperatureUnit.celsius': 'Celsius',
      'settings.temperatureUnit.fahrenheit': 'Fahrenheit',
      'settings.emailNotifications': 'Email Notifications',
      'settings.notif.newFollower': 'New follower',
      'settings.notif.recipeLiked': 'Recipe liked',
      'settings.notif.recipeCommented': 'Recipe commented',
      'settings.notif.followedUserPosted': 'Followed user posted',
      'settings.dangerZone': 'Danger Zone',
      'settings.dangerZoneDesc': 'Permanently delete your account and all your data.',
      'settings.deleteAccountBtn': 'Delete Account',
      'settings.deleteConfirm': 'Are you sure? This action cannot be undone.',
      'settings.savedMsg': 'Preferences saved!',
      'settings.failedMsg': 'Failed to save preferences.',
      'settings.deleteFailed': 'Account deletion failed.',
      'settings.dateFormat': 'Date Format',
      'preferences.title': 'Preferences',
      'preferences.unitSystem': 'Unit System',
      'preferences.temperature': 'Temperature Unit',
      'preferences.theme': 'Theme',
      'preferences.locale': 'Language',
      'preferences.timezone': 'Timezone',
      'preferences.dateFormat': 'Date Format',
      'theme.light': 'Light Roast',
      'theme.dark': 'Dark Roast',
      'theme.coffee': 'Medium Roast',
    };
    return map[key] ?? key;
  };

  const trT = (key: string) => {
    const map: Record<string, string> = {
      'settings.title': 'Ayarlar',
      'settings.deleteAccountBtn': 'Hesabı Sil',
      'settings.deleteConfirm': 'Emin misiniz? Bu işlem geri alınamaz.',
      'settings.deleteFailed': 'Hesap silinemedi.',
      'settings.savedMsg': 'Tercihler kaydedildi!',
      'settings.failedMsg': 'Tercihler kaydedilemedi.',
      'settings.savePreferences': 'Tercihleri Kaydet',
      // Other keys fall back to key name (in practice not needed for assertion tests)
    };
    return map[key] ?? key;
  };

  function renderSettingsPage(
    options: { locale?: 'en' | 'tr'; auth?: Partial<ReturnType<typeof useAuth>> } = {},
  ) {
    // Build the router with a home route (target of navigate('/')) and the settings route
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <div data-testid='home-page'>Home Page</div>,
        },
        {
          path: '/settings',
          element: <SettingsPage />,
          loader,
        },
      ],
      { initialEntries: ['/settings'] },
    );

    // Set up translation mock
    const t = options.locale === 'tr' ? trT : enT;
    mockUseTranslation.mockReturnValue({
      locale: options.locale ?? 'en',
      setLocale: vi.fn(),
      t,
      availableLocales: ['en', 'tr'],
    });

    // Set up auth mock
    mockUseAuth.mockReturnValue({
      user: authenticatedUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: mockLogout,
      refreshUser: vi.fn(),
      ...options.auth,
    });

    // Set up theme mock
    mockUseTheme.mockReturnValue({
      theme: 'light',
      setTheme: vi.fn(),
    });

    // Default API mocks
    mockApi.get.mockResolvedValue(mockPreferences);
    mockApi.patch.mockResolvedValue({});
    mockApi.delete.mockResolvedValue({});

    const renderResult = render(<RouterProvider router={router} />);

    return { ...renderResult, router };
  }
  ```

- [x] 4.3 Add a `beforeEach` at the top of the first `describe` block:

  ```tsx
  describe('SettingsPage', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Default API responses
      mockApi.get.mockResolvedValue(mockPreferences);
      mockApi.patch.mockResolvedValue({});
      mockApi.delete.mockResolvedValue({});
    });

    // ... tests go here
  });
  ```

- [x] 4.4 Add the test cases inside the `describe('SettingsPage', () => { ... })` block:

  ```tsx
    describe('Delete Account', () => {
      it('logs out and navigates home on successful deletion', async () => {
        const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
        const { router } = renderSettingsPage();

        await waitFor(() => {
          expect(screen.getByText('Delete Account')).toBeInTheDocument();
        });

        await userEvent.click(screen.getByText('Delete Account'));

        await waitFor(() => {
          expect(mockApi.delete).toHaveBeenCalledWith('/users/me');
          expect(mockLogout).toHaveBeenCalledOnce();
          expect(router.state.location.pathname).toBe('/');
        });

        confirmSpy.mockRestore();
      });

      it('does nothing when dialog is cancelled', async () => {
        const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
        renderSettingsPage();

        await waitFor(() => {
          expect(screen.getByText('Delete Account')).toBeInTheDocument();
        });

        await userEvent.click(screen.getByText('Delete Account'));

        expect(mockApi.delete).not.toHaveBeenCalled();
        expect(mockLogout).not.toHaveBeenCalled();

        confirmSpy.mockRestore();
      });

      it('shows error banner on failure in English', async () => {
        const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
        mockApi.delete.mockRejectedValueOnce(new Error('Network error'));

        renderSettingsPage({ locale: 'en' });

        await waitFor(() => {
          expect(screen.getByText('Delete Account')).toBeInTheDocument();
        });

        await userEvent.click(screen.getByText('Delete Account'));

        await waitFor(() => {
          expect(screen.getByText('Account deletion failed.')).toBeInTheDocument();
        });

        expect(mockLogout).not.toHaveBeenCalled();

        confirmSpy.mockRestore();
      });

      it('shows error banner on failure in Turkish', async () => {
        const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
        mockApi.delete.mockRejectedValueOnce(new Error('Network error'));

        renderSettingsPage({ locale: 'tr' });

        await waitFor(() => {
          expect(screen.getByText('Hesabı Sil')).toBeInTheDocument();
        });

        await userEvent.click(screen.getByText('Hesabı Sil'));

        await waitFor(() => {
          expect(screen.getByText('Hesap silinemedi.')).toBeInTheDocument();
        });

        expect(mockLogout).not.toHaveBeenCalled();

        confirmSpy.mockRestore();
      });
    });

    describe('Preferences save (messageType regression)', () => {
      it('shows success banner with green styling', async () => {
        mockApi.patch.mockResolvedValueOnce({});

        renderSettingsPage({ locale: 'en' });

        await waitFor(() => {
          expect(screen.getByText('Save Preferences')).toBeInTheDocument();
        });

        await userEvent.click(screen.getByText('Save Preferences'));

        await waitFor(() => {
          const banner = screen.getByText('Preferences saved!');
          expect(banner).toBeInTheDocument();
          expect(banner.style.backgroundColor).toBe('var(--success)');
        });
      });

      it('shows error banner with red styling', async () => {
        mockApi.patch.mockRejectedValueOnce(new Error('Save failed'));

        renderSettingsPage({ locale: 'tr' });

        await waitFor(() => {
          expect(screen.getByText('Tercihleri Kaydet')).toBeInTheDocument();
        });

        await userEvent.click(screen.getByText('Tercihleri Kaydet'));

        await waitFor(() => {
          const banner = screen.getByText('Tercihler kaydedilemedi.');
          expect(banner).toBeInTheDocument();
          expect(banner.style.backgroundColor).toBe('var(--error)');
        });
      });
    });

    describe('Deletion error banner styling', () => {
      it('renders deletion error with red background', async () => {
        const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
        mockApi.delete.mockRejectedValueOnce(new Error('Server error'));

        renderSettingsPage({ locale: 'en' });

        await waitFor(() => {
          expect(screen.getByText('Delete Account')).toBeInTheDocument();
        });

        await userEvent.click(screen.getByText('Delete Account'));

        await waitFor(() => {
          const banner = screen.getByText('Account deletion failed.');
          expect(banner).toBeInTheDocument();
          expect(banner.style.backgroundColor).toBe('var(--error)');
        });

        confirmSpy.mockRestore();
      });
    });
  ```

  The closing `});` for the outer `describe` block must be placed after all test cases.

- [x] 4.5 Run `make test-web` (or `deno task --cwd apps/web test` inside Docker). All tests
  MUST pass with zero failures.

- [x] 4.6 Run `make check` and `make lint` to confirm zero new errors across all workspaces.

## 5. Create PR description

- [x] 5.1 Create a file `pr_description.md` in the repository root
  (`/Users/arda.kilicdagi/projects/personal/BrewForm/pr_description.md`) with:

  ```markdown
  ## Summary

  Fix account deletion not logging out the user or redirecting after account removal.

  ## Problem

  When a user deletes their account via Settings → Danger Zone → "Delete Account":
  - The API call succeeds, but the user stays on the Settings page with stale auth state
  - The navbar still shows the user as logged in
  - Any subsequent action fails with 401/404 errors
  - Errors are silently swallowed with no user feedback

  ## Changes

  ### `apps/web/src/pages/settings/SettingsPage.tsx`
  - Added `logout` and `useNavigate` for post-deletion auth cleanup and redirect
  - After successful deletion: logout (clear auth state) → navigate to home page
  - On deletion failure: error banner with `settings.deleteFailed` translation + structured log
  - Added JSDoc documenting `handleDeleteAccount` behavior and side effects
  - Replaced fragile language-specific substring matching for banner color with explicit
    `messageType` state (`'success' | 'error' | null`) — fixes a latent bug where non-English
    error messages could render with green/success styling

  ### `apps/web/src/pages/settings/SettingsPage.test.tsx` (new)
  - Automated tests for: successful deletion, failed deletion (en + tr), cancel dialog,
    banner color styling (messageType regression), preferences save (en + tr)

  ### `packages/shared/src/i18n/en.json`
  - Added `settings.deleteFailed`: "Account deletion failed."

  ### `packages/shared/src/i18n/tr.json`
  - Added `settings.deleteFailed`: "Hesap silinemedi."

  ## Testing

  `make test-web` — 6 new test cases covering:
  - Successful deletion → redirected to `/`, logout called
  - Cancel dialog → no API call, no logout
  - Network error (English) → red error banner, user stays on page
  - Network error (Turkish) → red error banner, user stays on page
  - Preferences save success → green banner (messageType regression)
  - Preferences save failure → red banner (messageType regression)

  ## Risk

  Low. Frontend-only change. No backend modifications. No schema changes. The `logout()`
  function gracefully handles the expected failure of its internal API call against an
  already-deleted account's session.
  ```

- [x] 5.2 Verify the file is well-formed and renders correctly in GitHub-flavored Markdown.
