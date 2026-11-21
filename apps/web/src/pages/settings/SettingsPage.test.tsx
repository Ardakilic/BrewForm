// ── Module-level mocks (hoisted by Vitest — MUST come before imports) ──

vi.mock('../../contexts/I18nContext.tsx', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTranslation: vi.fn(),
}));

vi.mock('../../contexts/ThemeContext.tsx', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client.ts';
import { ApiError } from '../../api/errors.ts';
import type { AuthContextType } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useTheme } from '../../contexts/ThemeContext.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action, loader } from './SettingsPage.data.ts';
import { SettingsPage } from './SettingsPage.tsx';

// ── Typed mock references ──

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
  id: 'pref-1',
  userId: 'u1',
  unitSystem: 'metric' as const,
  temperatureUnit: 'celsius' as const,
  theme: 'light',
  locale: 'en',
  timezone: 'UTC',
  dateFormat: 'YYYY_MM_DD',
  notifyNewFollower: true,
  notifyRecipeLiked: true,
  notifyRecipeCommented: false,
  notifyFollowedUserPosted: true,
  notifyMentionedInComment: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

// ── Translation tables ──

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
    'settings.notifications': 'Notifications',
    'settings.notif.newFollower': 'New follower',
    'settings.notif.recipeLiked': 'Recipe liked',
    'settings.notif.recipeCommented': 'Recipe commented',
    'settings.notif.followedUserPosted': 'Followed user posted',
    'settings.notif.mentionedInComment': 'Someone mentions me in a comment',
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
    'common.delete': 'Delete',
    'common.cancel': 'Cancel',
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
    'settings.saveNotifications': 'Bildirimleri Kaydet',
    'settings.saving': 'Kaydediliyor...',
    'settings.dangerZone': 'Tehlikeli Bölge',
    'settings.dangerZoneDesc':
      'Hesabınızı ve tüm verilerinizi kalıcı olarak silin. Bu geri alınamaz.',
    'preferences.title': 'Tercihler',
    'common.delete': 'Sil',
    'common.cancel': 'İptal',
  };
  return map[key] ?? key;
};

function renderSettingsPage(
  options: { locale?: 'en' | 'tr'; auth?: Partial<AuthContextType> } = {},
) {
  const t = options.locale === 'tr' ? trT : enT;
  mockUseTranslation.mockReturnValue({
    locale: options.locale ?? 'en',
    setLocale: vi.fn(),
    t,
    availableLocales: ['en', 'tr'],
  });

  mockUseTheme.mockReturnValue({
    theme: 'light',
    setTheme: vi.fn(),
  });

  mockApi.get.mockResolvedValue(mockPreferences);
  mockApi.patch.mockResolvedValue({});
  mockApi.delete.mockResolvedValue({});

  return renderWithAppProviders(
    [
      {
        path: '/',
        element: <div data-testid="home-page">Home Page</div>,
      },
      {
        path: '/settings',
        element: <SettingsPage />,
        loader,
        action,
      },
    ],
    {
      initialEntries: ['/settings'],
      auth: { user: authenticatedUser, logout: mockLogout, ...options.auth },
    },
  );
}

/** Answers the shared ConfirmProvider dialog (rendered by AppProviders). */
async function answerConfirm(choice: 'confirm' | 'cancel', locale: 'en' | 'tr' = 'en') {
  const dialog = await screen.findByRole('dialog');
  const labels = {
    en: { confirm: 'Delete', cancel: 'Cancel' },
    tr: { confirm: 'Sil', cancel: 'İptal' },
  };
  await userEvent
    .setup()
    .click(within(dialog).getByRole('button', { name: labels[locale][choice] }));
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue(mockPreferences);
    mockApi.patch.mockResolvedValue({});
    mockApi.delete.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Delete Account', () => {
    it('logs out and lands on / on successful deletion (navigating before the user clears)', async () => {
      const user = userEvent.setup();
      let pathAfterLeave = '';
      // Like the real logout: the server logout, then `leave`, then the user is cleared.
      mockLogout.mockImplementation(async (leave?: () => Promise<void> | void) => {
        await leave?.();
        pathAfterLeave = router.state.location.pathname;
      });
      const { router } = renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByText('Delete Account')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Delete Account'));
      await answerConfirm('confirm');

      await waitFor(() => {
        expect(mockApi.delete).toHaveBeenCalledWith('/users/me', {
          signal: expect.any(AbortSignal),
        });
        expect(mockLogout).toHaveBeenCalledOnce();
        expect(router.state.location.pathname).toBe('/');
      });
      expect(mockLogout).toHaveBeenCalledWith(expect.any(Function));
      expect(pathAfterLeave).toBe('/');
      expect(router.state.location.search).toBe('');
    });

    it('does nothing when dialog is cancelled', async () => {
      const user = userEvent.setup();
      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByText('Delete Account')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Delete Account'));
      await answerConfirm('cancel');

      expect(mockApi.delete).not.toHaveBeenCalled();
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('shows error banner on failure in English', async () => {
      const user = userEvent.setup();
      mockApi.delete.mockRejectedValueOnce(new Error('Network error'));

      renderSettingsPage({ locale: 'en' });

      await waitFor(() => {
        expect(screen.getByText('Delete Account')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Delete Account'));
      await answerConfirm('confirm');

      await waitFor(() => {
        expect(screen.getByText('Account deletion failed.')).toBeInTheDocument();
      });

      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('shows error banner on failure in Turkish', async () => {
      const user = userEvent.setup();
      mockApi.delete.mockRejectedValueOnce(new Error('Network error'));

      renderSettingsPage({ locale: 'tr' });

      await waitFor(() => {
        expect(screen.getByText('Hesabı Sil')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Hesabı Sil'));
      await answerConfirm('confirm', 'tr');

      await waitFor(() => {
        const banner = screen
          .getByText('Hesap silinemedi.')
          .closest('[role="alert"]') as HTMLElement | null;
        expect(banner).toBeInTheDocument();
        expect(banner!.style.backgroundColor).toBe('var(--error-bg)');
      });

      expect(mockLogout).not.toHaveBeenCalled();
    });
  });

  describe('Preferences save (messageType regression)', () => {
    it('shows success banner with green styling', async () => {
      const user = userEvent.setup();
      mockApi.patch.mockResolvedValueOnce({});

      renderSettingsPage({ locale: 'en' });

      await waitFor(() => {
        expect(screen.getByText('Save Preferences')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Save Preferences'));

      await waitFor(() => {
        const banner = screen.getByText('Preferences saved!');
        expect(banner).toBeInTheDocument();
        expect(banner.style.backgroundColor).toBe('var(--success)');
      });
    });

    it('shows error banner with red styling', async () => {
      const user = userEvent.setup();
      mockApi.patch.mockRejectedValueOnce(new Error('Save failed'));

      renderSettingsPage({ locale: 'tr' });

      await waitFor(() => {
        expect(screen.getByText('Tercihleri Kaydet')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Tercihleri Kaydet'));

      await waitFor(() => {
        const banner = screen
          .getByText('Tercihler kaydedilemedi.')
          .closest('[role="alert"]') as HTMLElement | null;
        expect(banner).toBeInTheDocument();
        expect(banner!.style.backgroundColor).toBe('var(--error-bg)');
      });
    });
  });

  describe('Email notification preferences', () => {
    it('renders the mentioned-in-comment toggle reflecting the loaded preference', async () => {
      renderSettingsPage({ locale: 'en' });

      const toggle = await screen.findByLabelText('Someone mentions me in a comment');
      expect(toggle).toBeInTheDocument();
      expect(toggle).toBeChecked();
    });

    it('sends the mentionedInComment flag in the save payload when toggled off', async () => {
      const user = userEvent.setup();
      renderSettingsPage({ locale: 'en' });

      const toggle = await screen.findByLabelText('Someone mentions me in a comment');
      await user.click(toggle);
      await user.click(screen.getByText('Save Notifications'));

      await waitFor(() => {
        expect(mockApi.patch).toHaveBeenCalledWith(
          '/preferences',
          expect.objectContaining({
            notifyMentionedInComment: false,
          }),
          { signal: expect.any(AbortSignal) },
        );
      });
    });
  });

  describe('Deletion error banner styling', () => {
    it('renders deletion error with red background', async () => {
      const user = userEvent.setup();
      mockApi.delete.mockRejectedValueOnce(new Error('Server error'));

      renderSettingsPage({ locale: 'en' });

      await waitFor(() => {
        expect(screen.getByText('Delete Account')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Delete Account'));
      await answerConfirm('confirm');

      await waitFor(() => {
        const banner = screen
          .getByText('Account deletion failed.')
          .closest('[role="alert"]') as HTMLElement | null;
        expect(banner).toBeInTheDocument();
        expect(banner!.style.backgroundColor).toBe('var(--error-bg)');
      });
    });
  });
});

describe('SettingsPage loader — auth guard', () => {
  it('redirects a final 401 to /login with the encoded return path', async () => {
    mockApi.get.mockRejectedValue(new ApiError('UNAUTHORIZED', 'no session', undefined, 401));

    const thrown = await loader({
      request: new Request('http://localhost/settings'),
    } as never).catch((err: unknown) => err);

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get('Location')).toBe('/login?next=%2Fsettings');
  });
});

describe('SettingsPage action', () => {
  /** Calls the action with a JSON body. */
  function callAction(body: unknown) {
    return action({
      request: new Request('http://localhost/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      params: {},
      context: undefined,
    } as never);
  }

  it('save-preferences PATCHes the preference fields without the theme', async () => {
    mockApi.patch.mockResolvedValue({});
    await expect(
      callAction({ intent: 'save-preferences', preferences: { ...mockPreferences } }),
    ).resolves.toEqual({ ok: true, intent: 'save-preferences' });
    const body = mockApi.patch.mock.calls[0][1] as Record<string, unknown>;
    expect(body).toMatchObject({ unitSystem: 'metric', notifyMentionedInComment: true });
    expect(body).not.toHaveProperty('theme');
  });

  it('delete-account returns { ok: false, error } when the API fails', async () => {
    mockApi.delete.mockRejectedValue(new ApiError('INTERNAL', 'boom', undefined, 500));
    await expect(callAction({ intent: 'delete-account' })).resolves.toMatchObject({
      ok: false,
      intent: 'delete-account',
      error: 'boom',
    });
  });

  it('rethrows a 401 so requireAuth redirects to login', async () => {
    mockApi.delete.mockRejectedValue(new ApiError('UNAUTHORIZED', 'no', undefined, 401));
    const thrown = await callAction({ intent: 'delete-account' }).catch((err: unknown) => err);
    expect((thrown as Response).headers.get('Location')).toBe('/login?next=%2Fsettings');
  });
});
