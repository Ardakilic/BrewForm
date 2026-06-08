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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useTheme } from '../../contexts/ThemeContext.tsx';
import { api } from '../../api/client.ts';
import { loader, SettingsPage } from './SettingsPage.tsx';

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
    'settings.saveNotifications': 'Bildirimleri Kaydet',
    'settings.saving': 'Kaydediliyor...',
    'settings.dangerZone': 'Tehlikeli Bölge',
    'settings.dangerZoneDesc':
      'Hesabınızı ve tüm verilerinizi kalıcı olarak silin. Bu geri alınamaz.',
    'preferences.title': 'Tercihler',
  };
  return map[key] ?? key;
};

function renderSettingsPage(
  options: { locale?: 'en' | 'tr'; auth?: Partial<ReturnType<typeof useAuth>> } = {},
) {
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

  const t = options.locale === 'tr' ? trT : enT;
  mockUseTranslation.mockReturnValue({
    locale: options.locale ?? 'en',
    setLocale: vi.fn(),
    t,
    availableLocales: ['en', 'tr'],
  });

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

  mockUseTheme.mockReturnValue({
    theme: 'light',
    setTheme: vi.fn(),
  });

  mockApi.get.mockResolvedValue(mockPreferences);
  mockApi.patch.mockResolvedValue({});
  mockApi.delete.mockResolvedValue({});

  const renderResult = render(<RouterProvider router={router} />);

  return { ...renderResult, router };
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
    it('logs out and navigates home on successful deletion', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
      const { router } = renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByText('Delete Account')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Delete Account'));

      await waitFor(() => {
        expect(mockApi.delete).toHaveBeenCalledWith('/users/me');
        expect(mockLogout).toHaveBeenCalledOnce();
        expect(router.state.location.pathname).toBe('/');
      });

      confirmSpy.mockRestore();
    });

    it('does nothing when dialog is cancelled', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByText('Delete Account')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Delete Account'));

      expect(mockApi.delete).not.toHaveBeenCalled();
      expect(mockLogout).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it('shows error banner on failure in English', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
      mockApi.delete.mockRejectedValueOnce(new Error('Network error'));

      renderSettingsPage({ locale: 'en' });

      await waitFor(() => {
        expect(screen.getByText('Delete Account')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Delete Account'));

      await waitFor(() => {
        expect(screen.getByText('Account deletion failed.')).toBeInTheDocument();
      });

      expect(mockLogout).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it('shows error banner on failure in Turkish', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
      mockApi.delete.mockRejectedValueOnce(new Error('Network error'));

      renderSettingsPage({ locale: 'tr' });

      await waitFor(() => {
        expect(screen.getByText('Hesabı Sil')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Hesabı Sil'));

      await waitFor(() => {
        const banner = screen.getByText('Hesap silinemedi.');
        expect(banner).toBeInTheDocument();
        expect(banner.style.backgroundColor).toBe('var(--error)');
      });

      expect(mockLogout).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
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
        const banner = screen.getByText('Tercihler kaydedilemedi.');
        expect(banner).toBeInTheDocument();
        expect(banner.style.backgroundColor).toBe('var(--error)');
      });
    });
  });

  describe('Deletion error banner styling', () => {
    it('renders deletion error with red background', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
      mockApi.delete.mockRejectedValueOnce(new Error('Server error'));

      renderSettingsPage({ locale: 'en' });

      await waitFor(() => {
        expect(screen.getByText('Delete Account')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Delete Account'));

      await waitFor(() => {
        const banner = screen.getByText('Account deletion failed.');
        expect(banner).toBeInTheDocument();
        expect(banner.style.backgroundColor).toBe('var(--error)');
      });

      confirmSpy.mockRestore();
    });
  });
});
