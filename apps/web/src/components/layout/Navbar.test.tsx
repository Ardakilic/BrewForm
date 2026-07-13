import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Navbar } from './Navbar.tsx';

// Use vi.hoisted so the mockActivePath variable is available inside the vi.mock factory
// (vi.mock calls are hoisted to the top of the file by Vitest, before any imports/variables).
const { mockNavState } = vi.hoisted(() => {
  const mockNavState = { activePath: '/' };
  return { mockNavState };
});

vi.mock('react-router', () => ({
  Link: (
    { to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown },
  ) => <a href={to} {...props}>{children}</a>,
  NavLink: ({
    to,
    children,
    className,
    onClick,
    end,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
    className?: string | ((args: { isActive: boolean }) => string);
    onClick?: () => void;
    end?: boolean;
    [key: string]: unknown;
  }) => {
    // Determine isActive based on the current mockActivePath and the `end` prop.
    // When end=true: only exact match is active.
    // When end=false (default): prefix match is active.
    const currentPath = mockNavState.activePath;
    const isActive = end
      ? currentPath === to
      : currentPath === to || currentPath.startsWith(to + '/');
    const resolvedClassName = typeof className === 'function' ? className({ isActive }) : className;
    return (
      <a href={to} className={resolvedClassName} onClick={onClick} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../contexts/AuthContext.tsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../contexts/ThemeContext.tsx', () => ({
  useTheme: vi.fn(),
}));

vi.mock('../../api/index.ts', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
  ApiError: class extends Error {
    code = '';
    status = 500;
  },
  authApi: {
    registrationStatus: vi.fn().mockResolvedValue({ enabled: true }),
    logout: vi.fn().mockResolvedValue({}),
  },
  notificationApi: {
    unreadCount: vi.fn().mockResolvedValue({ count: 0 }),
    list: vi.fn().mockResolvedValue({
      success: true,
      data: [],
      meta: { requestId: 'test', pagination: { page: 1, perPage: 20, total: 0, totalPages: 0 } },
    }),
    markRead: vi.fn().mockResolvedValue({}),
    markAllRead: vi.fn().mockResolvedValue({ message: 'ok' }),
  },
}));

import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTheme } from '../../contexts/ThemeContext.tsx';
import { authApi } from '../../api/index.ts';

const mockUseTranslation = vi.mocked(useTranslation);
const mockUseAuth = vi.mocked(useAuth);
const mockUseTheme = vi.mocked(useTheme);

// A t() that returns the Turkish value for a known set of keys, falling back to the key itself.
// This lets us assert that the component re-renders with translated text when locale changes.
const trTranslations: Record<string, string> = {
  'app.name': 'BrewForm',
  'nav.recipes': 'Tarifler',
  'nav.equipment': 'Ekipmanlar',
  'nav.login': 'Giriş Yap',
  'nav.register': 'Kayıt Ol',
  'nav.logout': 'Çıkış Yap',
  'nav.profile': 'Profil',
  'recipe.create': 'Yeni Tarif',
  'setup.title': 'Kurulumlarım',
  'theme.light': 'Açık Kavurma',
  'theme.dark': 'Koyu Kavurma',
  'theme.coffee': 'Orta Kavurma',
  'nav.menu': 'Gezinme menüsü',
  'nav.menuToggle': 'Gezinme menüsünü aç/kapat',
  'nav.close': 'Menüyü kapat',
  'nav.main': 'Ana gezinme',
};

const enTranslations: Record<string, string> = {
  'app.name': 'BrewForm',
  'nav.recipes': 'Recipes',
  'nav.equipment': 'Equipment',
  'nav.login': 'Log In',
  'nav.register': 'Sign Up',
  'nav.logout': 'Log Out',
  'nav.profile': 'Profile',
  'recipe.create': 'New Recipe',
  'setup.title': 'My Setups',
  'theme.light': 'Light Roast',
  'theme.dark': 'Dark Roast',
  'theme.coffee': 'Medium Roast',
  'nav.menu': 'Navigation menu',
  'nav.menuToggle': 'Toggle navigation menu',
  'nav.close': 'Close menu',
  'nav.main': 'Main navigation',
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
  sessionError: null as 'network' | 'server' | null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
  clearSessionError: vi.fn(),
};

const defaultTheme = {
  theme: 'light' as const,
  setTheme: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the active path to a non-matching route before each test so existing
  // tests that don't care about active state are unaffected.
  mockNavState.activePath = '/';
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

  it('renders theme selector trigger showing current theme using t()', () => {
    // Base UI Select renders a custom trigger button with role="combobox".
    // Select.Value shows the raw value string (not the translated label).
    render(<Navbar />);

    // There are two ThemeSwitcher instances (desktop + mobile).
    // Both render a combobox trigger — verify at least one exists.
    const triggers = screen.getAllByRole('combobox');
    expect(triggers.length).toBeGreaterThan(0);
  });

  it('renders theme selector trigger in Turkish when locale is tr', () => {
    mockUseTranslation.mockReturnValue({
      ...defaultTranslation,
      locale: 'tr',
      t: (key: string) => trTranslations[key] ?? key,
    });

    render(<Navbar />);

    // The trigger still renders as a combobox regardless of locale.
    const triggers = screen.getAllByRole('combobox');
    expect(triggers.length).toBeGreaterThan(0);
  });

  it('calls setTheme when theme trigger is clicked and option is selected', async () => {
    const setTheme = vi.fn();
    mockUseTheme.mockReturnValue({ theme: 'light', setTheme } as ReturnType<typeof useTheme>);

    render(<Navbar />);

    // Open the first theme trigger (desktop nav combobox)
    const triggers = screen.getAllByRole('combobox');
    await userEvent.click(triggers[0]);

    // After opening, click the 'Dark Roast' option in the popup
    const darkOption = await screen.findByText('Dark Roast');
    await userEvent.click(darkOption);

    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});

describe('Navbar — authenticated state', () => {
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

  it('renders the hamburger button with an aria-label', () => {
    render(<Navbar />);

    const hamburger = screen.getByRole('button', { name: enTranslations['nav.menuToggle'] });
    expect(hamburger).toBeInTheDocument();
  });

  it('does not show the mobile menu dialog initially', () => {
    render(<Navbar />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the mobile menu dialog after clicking the hamburger button', async () => {
    render(<Navbar />);

    const hamburger = screen.getByRole('button', { name: enTranslations['nav.menuToggle'] });
    await act(async () => {
      await userEvent.click(hamburger);
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('mobile menu shows all authenticated nav items when logged in', async () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth,
      user: authenticatedUser,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    render(<Navbar />);

    const hamburger = screen.getByRole('button', { name: enTranslations['nav.menuToggle'] });
    await act(async () => {
      await userEvent.click(hamburger);
    });

    const dialog = screen.getByRole('dialog');

    // All authenticated nav items should appear inside the mobile menu
    expect(dialog).toHaveTextContent('Recipes');
    expect(dialog).toHaveTextContent('New Recipe');
    expect(dialog).toHaveTextContent('My Setups');
    expect(dialog).toHaveTextContent('Profile');
    expect(dialog).toHaveTextContent('Log Out');
  });

  it('mobile menu shows only unauthenticated nav items when logged out', async () => {
    render(<Navbar />);

    const hamburger = screen.getByRole('button', { name: enTranslations['nav.menuToggle'] });
    await act(async () => {
      await userEvent.click(hamburger);
    });

    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveTextContent('Recipes');
    expect(dialog).toHaveTextContent('Log In');
    expect(dialog).toHaveTextContent('Sign Up');
    expect(dialog).not.toHaveTextContent('New Recipe');
    expect(dialog).not.toHaveTextContent('My Setups');
    expect(dialog).not.toHaveTextContent('Log Out');
  });

  it('mobile menu shows all authenticated nav items in Turkish when locale is tr', async () => {
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

    const hamburger = screen.getByRole('button', { name: trTranslations['nav.menuToggle'] });
    await act(async () => {
      await userEvent.click(hamburger);
    });

    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveTextContent('Tarifler');
    expect(dialog).toHaveTextContent('Yeni Tarif');
    expect(dialog).toHaveTextContent('Kurulumlarım');
    expect(dialog).toHaveTextContent('Profil');
    expect(dialog).toHaveTextContent('Çıkış Yap');
  });
});

describe('Navbar — i18n theme options', () => {
  it('renders theme switcher trigger with role combobox in English', () => {
    render(<Navbar />);

    // Both desktop and mobile ThemeSwitcher instances render a combobox trigger
    const triggers = screen.getAllByRole('combobox');
    expect(triggers.length).toBeGreaterThan(0);
  });

  it('renders theme switcher trigger with role combobox in Turkish', () => {
    mockUseTranslation.mockReturnValue({
      ...defaultTranslation,
      locale: 'tr',
      t: (key: string) => trTranslations[key] ?? key,
    });

    render(<Navbar />);

    const triggers = screen.getAllByRole('combobox');
    expect(triggers.length).toBeGreaterThan(0);
  });

  it('shows translated theme options in popup after clicking trigger — English', async () => {
    render(<Navbar />);

    const triggers = screen.getAllByRole('combobox');
    await userEvent.click(triggers[0]);

    // After opening the popup, all three theme options should be visible
    expect(await screen.findByRole('option', { name: 'Light Roast' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Dark Roast' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Medium Roast' })).toBeInTheDocument();
  });

  it('shows translated theme options in popup after clicking trigger — Turkish', async () => {
    mockUseTranslation.mockReturnValue({
      ...defaultTranslation,
      locale: 'tr',
      t: (key: string) => trTranslations[key] ?? key,
    });

    render(<Navbar />);

    const triggers = screen.getAllByRole('combobox');
    await userEvent.click(triggers[0]);

    // After opening the popup, all three theme options should appear in Turkish
    expect(await screen.findByRole('option', { name: 'Açık Kavurma' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Koyu Kavurma' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Orta Kavurma' })).toBeInTheDocument();
  });
});

describe('Navbar — mobile menu', () => {
  // Helper: get the hamburger button by its aria-label
  const getHamburger = () => screen.getByRole('button', { name: 'Toggle navigation menu' });

  // Helper: get the mobile menu dialog (only present when open)
  const getMobileMenu = () => screen.getByRole('dialog', { name: 'Navigation menu' });

  // ── Visibility toggle ──────────────────────────────────────────────────────

  it('mobile menu is not rendered initially', () => {
    render(<Navbar />);
    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();
  });

  it('hamburger button opens the mobile menu', async () => {
    render(<Navbar />);
    await userEvent.click(getHamburger());
    expect(getMobileMenu()).toBeInTheDocument();
  });

  it('hamburger button closes the mobile menu when already open', async () => {
    render(<Navbar />);
    await userEvent.click(getHamburger());
    expect(getMobileMenu()).toBeInTheDocument();
    await userEvent.click(getHamburger());
    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();
  });

  // ── Escape key ─────────────────────────────────────────────────────────────

  it('Escape key closes the mobile menu', async () => {
    render(<Navbar />);
    await userEvent.click(getHamburger());
    expect(getMobileMenu()).toBeInTheDocument();

    // Fire Escape on the panel
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();
  });

  // ── Backdrop click ─────────────────────────────────────────────────────────

  it('clicking the backdrop closes the mobile menu', async () => {
    render(<Navbar />);
    await userEvent.click(getHamburger());
    expect(getMobileMenu()).toBeInTheDocument();

    // The backdrop is aria-hidden, so query by its role-less presence via aria-hidden attribute
    const backdrop = document.querySelector('[aria-hidden="true"].fixed.inset-0') as HTMLElement;
    expect(backdrop).not.toBeNull();
    await userEvent.click(backdrop);

    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();
  });

  // ── Nav item closes menu ───────────────────────────────────────────────────

  it('selecting a nav item closes the mobile menu', async () => {
    render(<Navbar />);
    await userEvent.click(getHamburger());
    expect(getMobileMenu()).toBeInTheDocument();

    // Click the "Recipes" link inside the mobile menu
    const recipesLinks = screen.getAllByRole('link', { name: 'Recipes' });
    // The mobile menu link is the one inside the dialog
    const mobileRecipesLink = recipesLinks.find((el) => getMobileMenu().contains(el));
    expect(mobileRecipesLink).toBeDefined();
    await userEvent.click(mobileRecipesLink!);

    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();
  });

  // ── Focus management ───────────────────────────────────────────────────────

  it('focus moves to the first focusable element (close button) when menu opens', async () => {
    const user = userEvent.setup();
    render(<Navbar />);
    await user.click(getHamburger());

    const closeButton = screen.getByRole('button', { name: 'Close menu' });
    await waitFor(() => {
      expect(document.activeElement).toBe(closeButton);
    });
  });

  it('focus returns to the hamburger button when menu closes via Escape', async () => {
    const user = userEvent.setup();
    render(<Navbar />);
    await user.click(getHamburger());

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(document.activeElement).toBe(getHamburger());
    });
  });

  it('focus returns to the hamburger button when menu closes via close button', async () => {
    const user = userEvent.setup();
    render(<Navbar />);
    await user.click(getHamburger());

    const closeButton = screen.getByRole('button', { name: 'Close menu' });
    await user.click(closeButton);

    await waitFor(() => {
      expect(document.activeElement).toBe(getHamburger());
    });
  });

  // ── ARIA attributes ────────────────────────────────────────────────────────

  it('hamburger button has aria-expanded="false" when menu is closed', () => {
    render(<Navbar />);
    const hamburger = getHamburger();
    expect(hamburger).toHaveAttribute('aria-expanded', 'false');
  });

  it('hamburger button has aria-expanded="true" when menu is open', async () => {
    render(<Navbar />);
    await userEvent.click(getHamburger());
    expect(getHamburger()).toHaveAttribute('aria-expanded', 'true');
  });

  it('hamburger button has aria-controls="mobile-menu"', () => {
    render(<Navbar />);
    expect(getHamburger()).toHaveAttribute('aria-controls', 'mobile-menu');
  });

  it('hamburger button has aria-label from i18n', () => {
    render(<Navbar />);
    expect(getHamburger()).toHaveAttribute('aria-label', 'Toggle navigation menu');
  });

  it('mobile menu panel has id="mobile-menu", role="dialog", aria-modal="true", and aria-label from i18n', async () => {
    render(<Navbar />);
    await userEvent.click(getHamburger());

    const panel = getMobileMenu();
    expect(panel).toHaveAttribute('id', 'mobile-menu');
    expect(panel).toHaveAttribute('role', 'dialog');
    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(panel).toHaveAttribute('aria-label', 'Navigation menu');
  });
});

describe('Navbar — ThemeSwitcher (task 2.2)', () => {
  // ── Theme selection calls setTheme with correct value ──────────────────────

  it('selecting "light" theme calls setTheme with "light"', async () => {
    const setTheme = vi.fn();
    mockUseTheme.mockReturnValue({ theme: 'dark', setTheme } as ReturnType<typeof useTheme>);

    render(<Navbar />);

    const triggers = screen.getAllByRole('combobox');
    await userEvent.click(triggers[0]);

    const lightOption = await screen.findByRole('option', { name: 'Light Roast' });
    await userEvent.click(lightOption);

    expect(setTheme).toHaveBeenCalledWith('light');
  });

  it('selecting "dark" theme calls setTheme with "dark"', async () => {
    const setTheme = vi.fn();
    mockUseTheme.mockReturnValue({ theme: 'light', setTheme } as ReturnType<typeof useTheme>);

    render(<Navbar />);

    const triggers = screen.getAllByRole('combobox');
    await userEvent.click(triggers[0]);

    const darkOption = await screen.findByRole('option', { name: 'Dark Roast' });
    await userEvent.click(darkOption);

    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('selecting "coffee" theme calls setTheme with "coffee"', async () => {
    const setTheme = vi.fn();
    mockUseTheme.mockReturnValue({ theme: 'light', setTheme } as ReturnType<typeof useTheme>);

    render(<Navbar />);

    const triggers = screen.getAllByRole('combobox');
    await userEvent.click(triggers[0]);

    const coffeeOption = await screen.findByRole('option', { name: 'Medium Roast' });
    await userEvent.click(coffeeOption);

    expect(setTheme).toHaveBeenCalledWith('coffee');
  });

  // ── i18n option labels — English ───────────────────────────────────────────

  it('theme options display English translated labels when locale is en', async () => {
    render(<Navbar />);

    const triggers = screen.getAllByRole('combobox');
    await userEvent.click(triggers[0]);

    expect(await screen.findByRole('option', { name: enTranslations['theme.light'] }))
      .toBeInTheDocument();
    expect(screen.getByRole('option', { name: enTranslations['theme.dark'] })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: enTranslations['theme.coffee'] }))
      .toBeInTheDocument();
  });

  // ── i18n option labels — Turkish ───────────────────────────────────────────

  it('theme options display Turkish translated labels when locale is tr', async () => {
    mockUseTranslation.mockReturnValue({
      ...defaultTranslation,
      locale: 'tr',
      t: (key: string) => trTranslations[key] ?? key,
    });

    render(<Navbar />);

    const triggers = screen.getAllByRole('combobox');
    await userEvent.click(triggers[0]);

    expect(await screen.findByRole('option', { name: trTranslations['theme.light'] }))
      .toBeInTheDocument();
    expect(screen.getByRole('option', { name: trTranslations['theme.dark'] })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: trTranslations['theme.coffee'] }))
      .toBeInTheDocument();
  });

  it('selecting "coffee" theme in Turkish calls setTheme with "coffee"', async () => {
    const setTheme = vi.fn();
    mockUseTheme.mockReturnValue({ theme: 'light', setTheme } as ReturnType<typeof useTheme>);
    mockUseTranslation.mockReturnValue({
      ...defaultTranslation,
      locale: 'tr',
      t: (key: string) => trTranslations[key] ?? key,
    });

    render(<Navbar />);

    const triggers = screen.getAllByRole('combobox');
    await userEvent.click(triggers[0]);

    // Option label is in Turkish but the value passed to setTheme must still be 'coffee'.
    // Use getByRole('option') to target the clickable item element, not the inner text span
    // which may have pointer-events: none applied by Base UI.
    const coffeeOption = await screen.findByRole('option', {
      name: trTranslations['theme.coffee'],
    }); // 'Orta Kavurma'
    await userEvent.click(coffeeOption);

    expect(setTheme).toHaveBeenCalledWith('coffee');
  });

  // ── Keyboard navigation ────────────────────────────────────────────────────

  it('opens the theme dropdown with Enter key when trigger is focused', async () => {
    render(<Navbar />);

    const triggers = screen.getAllByRole('combobox');
    triggers[0].focus();
    await userEvent.keyboard('{Enter}');

    // After pressing Enter, the popup should be open and options visible
    expect(await screen.findByRole('option', { name: 'Light Roast' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Dark Roast' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Medium Roast' })).toBeInTheDocument();
  });

  it('opens the theme dropdown with Space key when trigger is focused', async () => {
    render(<Navbar />);

    const triggers = screen.getAllByRole('combobox');
    triggers[0].focus();
    await userEvent.keyboard(' ');

    expect(await screen.findByRole('option', { name: 'Light Roast' })).toBeInTheDocument();
  });

  it('closes the theme dropdown with Escape key', async () => {
    render(<Navbar />);

    const triggers = screen.getAllByRole('combobox');
    await userEvent.click(triggers[0]);

    // Popup is open — listbox is present and trigger is expanded
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(triggers[0]).toHaveAttribute('aria-expanded', 'true');

    await userEvent.keyboard('{Escape}');

    // After Escape, the trigger should report closed state.
    // Base UI may keep the listbox in DOM during exit animation, but the
    // combobox aria-expanded should reflect the closed state.
    expect(triggers[0]).toHaveAttribute('aria-expanded', 'false');
  });

  it('navigates through options with ArrowDown key', async () => {
    render(<Navbar />);

    const triggers = screen.getAllByRole('combobox');
    triggers[0].focus();
    await userEvent.keyboard('{Enter}');

    // Popup is open; press ArrowDown to move highlight
    await userEvent.keyboard('{ArrowDown}');

    // The highlighted option should be accessible — all options still visible
    expect(await screen.findByRole('option', { name: 'Light Roast' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Dark Roast' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Medium Roast' })).toBeInTheDocument();
  });

  it('selects highlighted option with Enter key during keyboard navigation', async () => {
    const setTheme = vi.fn();
    mockUseTheme.mockReturnValue({ theme: 'light', setTheme } as ReturnType<typeof useTheme>);

    render(<Navbar />);

    const triggers = screen.getAllByRole('combobox');
    triggers[0].focus();

    // Open dropdown, navigate to 'Dark' (second option), select it.
    // Starting from 'light' (first item), one ArrowDown moves to 'dark'.
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Enter}');

    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});

// Active styling class fragments used by NavItem.
// Active items have a border; inactive items have no border but do have a hover bg class.
const ACTIVE_CLASS_FRAGMENT = 'rounded-full border';
// Inactive items use rounded-full WITHOUT a border — distinguish by checking for hover class
const INACTIVE_CLASS_FRAGMENT = 'hover:bg-';

// Helper: get all NavLink <a> elements rendered in the desktop nav.
// The Navbar renders NavLinks in both the desktop nav and the mobile menu.
// We query by href to find the specific link regardless of duplication.
function getNavLinkByHref(href: string) {
  // getAllByRole returns all matching elements; filter to the first <a> with the given href.
  const links = screen.getAllByRole('link');
  return links.find((el) => el.getAttribute('href') === href);
}

describe('Navbar — active route indicator', () => {
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

  // Set up authenticated state so all nav items are rendered
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth,
      user: authenticatedUser,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);
  });

  it('highlights Recipes link when current path is /recipes', () => {
    mockNavState.activePath = '/recipes';
    render(<Navbar />);

    const recipesLink = getNavLinkByHref('/recipes');
    expect(recipesLink).toBeDefined();
    expect(recipesLink!.className).toContain(ACTIVE_CLASS_FRAGMENT);

    // Other nav items should be in default (inactive) state
    const newRecipeLink = getNavLinkByHref('/recipes/new');
    expect(newRecipeLink).toBeDefined();
    expect(newRecipeLink!.className).toContain(INACTIVE_CLASS_FRAGMENT);
    expect(newRecipeLink!.className).not.toContain(ACTIVE_CLASS_FRAGMENT);
  });

  it('highlights New Recipe link when current path is /recipes/new', () => {
    mockNavState.activePath = '/recipes/new';
    render(<Navbar />);

    const newRecipeLink = getNavLinkByHref('/recipes/new');
    expect(newRecipeLink).toBeDefined();
    expect(newRecipeLink!.className).toContain(ACTIVE_CLASS_FRAGMENT);

    // Recipes link uses end=true so it should NOT be active at /recipes/new
    const recipesLink = getNavLinkByHref('/recipes');
    expect(recipesLink).toBeDefined();
    expect(recipesLink!.className).toContain(INACTIVE_CLASS_FRAGMENT);
    expect(recipesLink!.className).not.toContain(ACTIVE_CLASS_FRAGMENT);
  });

  it('highlights My Setups link when current path is /setups', () => {
    mockNavState.activePath = '/setups';
    render(<Navbar />);

    const setupsLink = getNavLinkByHref('/setups');
    expect(setupsLink).toBeDefined();
    expect(setupsLink!.className).toContain(ACTIVE_CLASS_FRAGMENT);

    // Recipes should be inactive
    const recipesLink = getNavLinkByHref('/recipes');
    expect(recipesLink).toBeDefined();
    expect(recipesLink!.className).toContain(INACTIVE_CLASS_FRAGMENT);
    expect(recipesLink!.className).not.toContain(ACTIVE_CLASS_FRAGMENT);
  });

  it('shows all nav items in default (inactive) state when path does not match any nav item', () => {
    mockNavState.activePath = '/';
    render(<Navbar />);

    const recipesLink = getNavLinkByHref('/recipes');
    const newRecipeLink = getNavLinkByHref('/recipes/new');
    const setupsLink = getNavLinkByHref('/setups');

    expect(recipesLink!.className).toContain(INACTIVE_CLASS_FRAGMENT);
    expect(recipesLink!.className).not.toContain(ACTIVE_CLASS_FRAGMENT);

    expect(newRecipeLink!.className).toContain(INACTIVE_CLASS_FRAGMENT);
    expect(newRecipeLink!.className).not.toContain(ACTIVE_CLASS_FRAGMENT);

    expect(setupsLink!.className).toContain(INACTIVE_CLASS_FRAGMENT);
    expect(setupsLink!.className).not.toContain(ACTIVE_CLASS_FRAGMENT);
  });

  it('highlights closest parent prefix match for nested sub-route /setups/123', () => {
    // /setups uses end=false, so it should match /setups/123 as a prefix
    mockNavState.activePath = '/setups/123';
    render(<Navbar />);

    const setupsLink = getNavLinkByHref('/setups');
    expect(setupsLink).toBeDefined();
    expect(setupsLink!.className).toContain(ACTIVE_CLASS_FRAGMENT);

    // Recipes (end=true) should remain inactive
    const recipesLink = getNavLinkByHref('/recipes');
    expect(recipesLink!.className).toContain(INACTIVE_CLASS_FRAGMENT);
    expect(recipesLink!.className).not.toContain(ACTIVE_CLASS_FRAGMENT);
  });

  it('highlights Profile link when current path matches /u/alice', () => {
    mockNavState.activePath = '/u/alice';
    render(<Navbar />);

    const profileLink = getNavLinkByHref('/u/alice');
    expect(profileLink).toBeDefined();
    expect(profileLink!.className).toContain(ACTIVE_CLASS_FRAGMENT);

    // Other items should be inactive
    const recipesLink = getNavLinkByHref('/recipes');
    expect(recipesLink).toBeDefined();
    expect(recipesLink!.className).toContain(INACTIVE_CLASS_FRAGMENT);
    expect(recipesLink!.className).not.toContain(ACTIVE_CLASS_FRAGMENT);
  });

  it('renders equipment nav link with correct href', () => {
    render(<Navbar />);

    const equipmentLink = getNavLinkByHref('/equipments');
    expect(equipmentLink).toBeDefined();
    expect(equipmentLink!.textContent).toContain('Equipment');
  });

  it('renders equipment nav link in Turkish', () => {
    mockUseTranslation.mockReturnValue({
      ...defaultTranslation,
      locale: 'tr',
      t: (key: string) => trTranslations[key] ?? key,
    });
    render(<Navbar />);

    const equipmentLink = getNavLinkByHref('/equipments');
    expect(equipmentLink).toBeDefined();
    expect(equipmentLink!.textContent).toContain('Ekipmanlar');
  });

  it('highlights Equipment link when current path is /equipments', () => {
    mockNavState.activePath = '/equipments';
    render(<Navbar />);

    const equipmentLink = getNavLinkByHref('/equipments');
    expect(equipmentLink).toBeDefined();
    expect(equipmentLink!.className).toContain(ACTIVE_CLASS_FRAGMENT);

    // Other items should be inactive
    const recipesLink = getNavLinkByHref('/recipes');
    expect(recipesLink).toBeDefined();
    expect(recipesLink!.className).toContain(INACTIVE_CLASS_FRAGMENT);
    expect(recipesLink!.className).not.toContain(ACTIVE_CLASS_FRAGMENT);
  });

  it('at most one nav item is active at any given route', () => {
    mockNavState.activePath = '/recipes/new';
    render(<Navbar />);

    // Collect all nav links rendered in the desktop nav (first occurrence of each href)
    const allLinks = screen.getAllByRole('link');
    const navHrefs = ['/recipes', '/recipes/new', '/setups', '/u/alice'];
    const activeLinks = allLinks.filter(
      (el) =>
        navHrefs.includes(el.getAttribute('href') ?? '') &&
        el.className.includes(ACTIVE_CLASS_FRAGMENT),
    );

    // Deduplicate by href (desktop + mobile render the same links twice)
    const activeHrefs = new Set(activeLinks.map((el) => el.getAttribute('href')));
    expect(activeHrefs.size).toBeLessThanOrEqual(1);
  });
});

describe('Navbar — registration toggle', () => {
  it('should show register link when registration is enabled', async () => {
    vi.mocked(authApi.registrationStatus).mockResolvedValue({ enabled: true });
    render(<Navbar />);
    await waitFor(() => {
      expect(screen.getByText('Sign Up')).toBeInTheDocument();
    });
  });

  it('should hide register link when registration is disabled', async () => {
    vi.mocked(authApi.registrationStatus).mockResolvedValue({ enabled: false });
    render(<Navbar />);
    await waitFor(() => {
      expect(screen.queryByText('Sign Up')).not.toBeInTheDocument();
    });
  });

  it('should still show login link when registration is disabled', async () => {
    vi.mocked(authApi.registrationStatus).mockResolvedValue({ enabled: false });
    render(<Navbar />);
    await waitFor(() => {
      expect(screen.getByText('Log In')).toBeInTheDocument();
    });
  });

  it('should not fetch registration status for authenticated users', async () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth,
      user: {
        id: 'user-1',
        email: 'alice@example.com',
        emailVerifiedAt: null,
        username: 'alice',
        displayName: 'Alice',
        avatarUrl: null,
        isAdmin: false,
        onboardingCompleted: true,
      },
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);
    render(<Navbar />);
    await waitFor(() => {
      expect(authApi.registrationStatus).not.toHaveBeenCalled();
    });
  });
});

describe('Navbar — ThemeSwitcher PBT (task 6.2)', () => {
  const allThemeTranslations: Record<string, Record<string, string>> = {
    en: {
      'theme.light': 'Light Roast',
      'theme.dark': 'Dark Roast',
      'theme.coffee': 'Medium Roast',
    },
    tr: {
      'theme.light': 'Açık Kavurma',
      'theme.dark': 'Koyu Kavurma',
      'theme.coffee': 'Orta Kavurma',
    },
  };

  it(
    'for any theme value and locale, trigger displays translated label and popup options are translated',
    async () => {
      // The cartesian product is 3 themes × 2 locales = 6 cases. We run
      // multiple cycles so fast-check exercises each combination repeatedly
      // and shrinks on failure. The per-iteration timeout bounds a hung
      // render/cleanup so one slow iteration can't blow the whole budget.
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('light', 'dark', 'coffee'),
          fc.constantFrom('en', 'tr'),
          async (theme, locale) => {
            const user = userEvent.setup({ delay: null });
            const translations = allThemeTranslations[locale];
            const t = (key: string) => translations[key] ?? key;

            mockUseTheme.mockReturnValue(
              { theme, setTheme: vi.fn() } as ReturnType<typeof useTheme>,
            );
            mockUseTranslation.mockReturnValue({
              ...defaultTranslation,
              locale,
              t,
              availableLocales: ['en', 'tr'],
            });

            const { unmount } = render(<Navbar />);

            try {
              const triggers = screen.getAllByRole('combobox');

              // Verify trigger shows the translated label for the selected theme
              const expectedTriggerLabel = translations[`theme.${theme}`];
              expect(triggers[0]).toHaveTextContent(expectedTriggerLabel);

              // Open the popup
              await user.click(triggers[0]);

              // All options in popup should have translated names
              expect(await screen.findByRole('option', { name: translations['theme.light'] }))
                .toBeInTheDocument();
              expect(screen.getByRole('option', { name: translations['theme.dark'] }))
                .toBeInTheDocument();
              expect(screen.getByRole('option', { name: translations['theme.coffee'] }))
                .toBeInTheDocument();
            } finally {
              unmount();
            }
          },
        ),
        { numRuns: 30, interruptAfterTimeLimit: 5000 },
      );
    },
    15000,
  );
});
