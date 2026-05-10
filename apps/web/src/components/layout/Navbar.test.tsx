import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Navbar } from './Navbar';

vi.mock('react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

vi.mock('../../contexts/I18nContext', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: vi.fn(),
}));

import { useTranslation } from '../../contexts/I18nContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

const mockUseTranslation = vi.mocked(useTranslation);
const mockUseAuth = vi.mocked(useAuth);
const mockUseTheme = vi.mocked(useTheme);

// A t() that returns the Turkish value for a known set of keys, falling back to the key itself.
// This lets us assert that the component re-renders with translated text when locale changes.
const trTranslations: Record<string, string> = {
  'app.name': 'BrewForm',
  'nav.recipes': 'Tarifler',
  'nav.login': 'Giriş Yap',
  'nav.register': 'Kayıt Ol',
  'nav.logout': 'Çıkış Yap',
  'nav.profile': 'Profil',
  'recipe.create': 'Yeni Tarif',
  'setup.title': 'Kurulumlarım',
  'theme.light': 'Açık',
  'theme.dark': 'Koyu',
  'theme.coffee': 'Kahve',
};

const enTranslations: Record<string, string> = {
  'app.name': 'BrewForm',
  'nav.recipes': 'Recipes',
  'nav.login': 'Log In',
  'nav.register': 'Sign Up',
  'nav.logout': 'Log Out',
  'nav.profile': 'Profile',
  'recipe.create': 'New Recipe',
  'setup.title': 'My Setups',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.coffee': 'Coffee',
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: (key: string) => enTranslations[key] ?? key,
  availableLocales: ['en', 'tr'],
};

const defaultAuth = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
};

const defaultTheme = {
  theme: 'light' as const,
  setTheme: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockUseAuth.mockReturnValue(defaultAuth as ReturnType<typeof useAuth>);
  mockUseTheme.mockReturnValue(defaultTheme as ReturnType<typeof useTheme>);
});

describe('Navbar — i18n', () => {
  it('renders nav links using t() — English', () => {
    render(<Navbar />);
    expect(screen.getByText('Recipes')).toBeInTheDocument();
    expect(screen.getByText('Log In')).toBeInTheDocument();
    expect(screen.getByText('Sign Up')).toBeInTheDocument();
  });

  it('renders nav links using t() — Turkish when locale is tr', () => {
    mockUseTranslation.mockReturnValue({
      ...defaultTranslation,
      locale: 'tr',
      t: (key: string) => trTranslations[key] ?? key,
    });

    render(<Navbar />);

    expect(screen.getByText('Tarifler')).toBeInTheDocument();
    expect(screen.getByText('Giriş Yap')).toBeInTheDocument();
    expect(screen.getByText('Kayıt Ol')).toBeInTheDocument();
  });

  it('renders theme selector options using t()', () => {
    render(<Navbar />);

    expect(screen.getByRole('option', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Coffee' })).toBeInTheDocument();
  });

  it('renders theme selector options in Turkish when locale is tr', () => {
    mockUseTranslation.mockReturnValue({
      ...defaultTranslation,
      locale: 'tr',
      t: (key: string) => trTranslations[key] ?? key,
    });

    render(<Navbar />);

    expect(screen.getByRole('option', { name: 'Açık' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Koyu' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Kahve' })).toBeInTheDocument();
  });

  it('calls setTheme when theme selector changes', async () => {
    const setTheme = vi.fn();
    mockUseTheme.mockReturnValue({ theme: 'light', setTheme } as ReturnType<typeof useTheme>);

    render(<Navbar />);

    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'dark');

    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});

describe('Navbar — authenticated state', () => {
  const authenticatedUser = {
    id: 'user-1',
    email: 'alice@example.com',
    username: 'alice',
    displayName: 'Alice',
    avatarUrl: null,
    isAdmin: false,
    onboardingCompleted: true,
  };

  it('shows authenticated links when logged in', () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth,
      user: authenticatedUser,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    render(<Navbar />);

    expect(screen.getByText('New Recipe')).toBeInTheDocument();
    expect(screen.getByText('My Setups')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Log Out')).toBeInTheDocument();
    expect(screen.queryByText('Log In')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign Up')).not.toBeInTheDocument();
  });

  it('shows authenticated links in Turkish when locale is tr', () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth,
      user: authenticatedUser,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);
    mockUseTranslation.mockReturnValue({
      ...defaultTranslation,
      locale: 'tr',
      t: (key: string) => trTranslations[key] ?? key,
    });

    render(<Navbar />);

    expect(screen.getByText('Yeni Tarif')).toBeInTheDocument();
    expect(screen.getByText('Kurulumlarım')).toBeInTheDocument();
    expect(screen.getByText('Profil')).toBeInTheDocument();
    expect(screen.getByText('Çıkış Yap')).toBeInTheDocument();
  });

  it('calls logout when Log Out button is clicked', async () => {
    const logout = vi.fn();
    mockUseAuth.mockReturnValue({
      ...defaultAuth,
      user: authenticatedUser,
      isAuthenticated: true,
      logout,
    } as ReturnType<typeof useAuth>);

    render(<Navbar />);

    await userEvent.click(screen.getByText('Log Out'));
    expect(logout).toHaveBeenCalledOnce();
  });

  it('shows unauthenticated links when logged out', () => {
    render(<Navbar />);

    expect(screen.getByText('Log In')).toBeInTheDocument();
    expect(screen.getByText('Sign Up')).toBeInTheDocument();
    expect(screen.queryByText('Log Out')).not.toBeInTheDocument();
    expect(screen.queryByText('New Recipe')).not.toBeInTheDocument();
  });
});
