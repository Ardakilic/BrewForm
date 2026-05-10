/**
 * Property-Based Tests for Navbar
 *
 * Feature: modernize-navigation-menu
 * Property 1: Active Route Matching Invariant
 *
 * Validates: Requirements 2.1, 2.3, 2.4, 2.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import { Navbar } from './Navbar';

// ---------------------------------------------------------------------------
// React-router mock — mirrors the mock in Navbar.test.tsx but uses a
// module-level mutable object so fast-check can update the path per run.
// ---------------------------------------------------------------------------

const { mockNavState } = vi.hoisted(() => {
  const mockNavState = { activePath: '/' };
  return { mockNavState };
});

vi.mock('react-router', () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <a href={to} {...props}>{children}</a>,

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
    const currentPath = mockNavState.activePath;
    const isActive = end
      ? currentPath === to
      : currentPath === to || currentPath.startsWith(to + '/');
    const resolvedClassName =
      typeof className === 'function' ? className({ isActive }) : className;
    return (
      <a href={to} className={resolvedClassName} onClick={onClick} {...props}>
        {children}
      </a>
    );
  },
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

// ---------------------------------------------------------------------------
// Default mock values
// ---------------------------------------------------------------------------

const enTranslations: Record<string, string> = {
  'app.name': 'BrewForm',
  'nav.recipes': 'Recipes',
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

const authenticatedUser = {
  id: 'user-1',
  email: 'alice@example.com',
  username: 'alice',
  displayName: 'Alice',
  avatarUrl: null,
  isAdmin: false,
  onboardingCompleted: true,
};

const defaultAuth = {
  user: authenticatedUser,
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: (key: string) => enTranslations[key] ?? key,
  availableLocales: ['en', 'tr'],
};

const defaultTheme = {
  theme: 'light' as const,
  setTheme: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockNavState.activePath = '/';
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockUseAuth.mockReturnValue(defaultAuth as ReturnType<typeof useAuth>);
  mockUseTheme.mockReturnValue(defaultTheme as ReturnType<typeof useTheme>);
});

// ---------------------------------------------------------------------------
// Active class fragments (must match NavItem implementation in Navbar.tsx)
// ---------------------------------------------------------------------------

const ACTIVE_CLASS_FRAGMENT = 'rounded-full border';

// ---------------------------------------------------------------------------
// NAV_ITEMS config — mirrors the config in Navbar.tsx so we can compute the
// expected active item deterministically in the test.
// ---------------------------------------------------------------------------

interface NavItemConfig {
  to: string;
  end: boolean;
}

// Static nav items (profile is dynamic: /u/alice for the authenticated user)
const STATIC_NAV_ITEMS: NavItemConfig[] = [
  { to: '/recipes', end: true },
  { to: '/recipes/new', end: true },
  { to: '/setups', end: false },
];

// Profile item for the authenticated user used in tests
const PROFILE_NAV_ITEM: NavItemConfig = { to: '/u/alice', end: false };

// All nav items rendered when authenticated
const ALL_NAV_ITEMS: NavItemConfig[] = [...STATIC_NAV_ITEMS, PROFILE_NAV_ITEM];

/**
 * Compute the expected active nav item href for a given path, using the same
 * logic as the NavLink mock:
 *   - end=true  → exact match only
 *   - end=false → exact match OR path starts with `to + '/'`
 *
 * If multiple items match (shouldn't happen with the current config, but we
 * handle it defensively), we pick the one with the longest `to` path
 * (longest prefix match wins).
 *
 * Returns null if no item matches.
 */
function computeExpectedActiveHref(path: string): string | null {
  const matches = ALL_NAV_ITEMS.filter(({ to, end }) =>
    end ? path === to : path === to || path.startsWith(to + '/'),
  );

  if (matches.length === 0) return null;

  // Longest prefix match wins
  matches.sort((a, b) => b.to.length - a.to.length);
  return matches[0].to;
}

// ---------------------------------------------------------------------------
// Arbitrary generators
// ---------------------------------------------------------------------------

/**
 * Generates URL path strings that cover the interesting parts of the input
 * space:
 *   - Exact nav item paths (/recipes, /recipes/new, /setups, /u/alice)
 *   - Sub-paths of nav items (/recipes/123, /setups/abc, /u/alice/settings)
 *   - Completely unrelated paths (/about, /contact, /)
 *   - Arbitrary paths (random segments)
 */
const pathArbitrary = fc.oneof(
  // Exact nav item paths
  fc.constantFrom(
    '/recipes',
    '/recipes/new',
    '/setups',
    '/u/alice',
  ),
  // Sub-paths of nav items
  fc.oneof(
    fc.string({ minLength: 1, maxLength: 20 }).map((s) => `/recipes/${s.replace(/\//g, '-')}`),
    fc.string({ minLength: 1, maxLength: 20 }).map((s) => `/setups/${s.replace(/\//g, '-')}`),
    fc.string({ minLength: 1, maxLength: 20 }).map((s) => `/u/alice/${s.replace(/\//g, '-')}`),
    fc.string({ minLength: 1, maxLength: 20 }).map((s) => `/u/${s.replace(/\//g, '-')}`),
  ),
  // Unrelated paths
  fc.constantFrom('/', '/about', '/contact', '/login', '/register', '/404'),
  // Arbitrary paths: one or more segments
  fc
    .array(
      fc.stringMatching(/^[a-z0-9-]{1,10}$/),
      { minLength: 1, maxLength: 4 },
    )
    .map((segments) => '/' + segments.join('/')),
);

// ---------------------------------------------------------------------------
// Helper: collect all nav link <a> elements from the rendered Navbar
// ---------------------------------------------------------------------------

function getNavLinks(): HTMLElement[] {
  return screen
    .getAllByRole('link')
    .filter((el) => {
      const href = el.getAttribute('href');
      return (
        href !== null &&
        href !== '/' && // exclude brand link
        href !== '/login' &&
        href !== '/register'
      );
    });
}

// ---------------------------------------------------------------------------
// Property 1: Active Route Matching Invariant
//
// Feature: modernize-navigation-menu, Property 1: Active Route Matching Invariant
// Validates: Requirements 2.1, 2.3, 2.4, 2.5
// ---------------------------------------------------------------------------

describe('Navbar — Property 1: Active Route Matching Invariant', () => {
  it(
    'at most one NavItem has active styling for any URL path',
    () => {
      fc.assert(
        fc.property(pathArbitrary, (path) => {
          // Set the mocked current path
          mockNavState.activePath = path;

          const { unmount } = render(<Navbar />);

          try {
            const navLinks = getNavLinks();

            // Collect unique hrefs that have the active class
            const activeHrefs = new Set(
              navLinks
                .filter((el) => el.className.includes(ACTIVE_CLASS_FRAGMENT))
                .map((el) => el.getAttribute('href')),
            );

            // INVARIANT: at most one nav item is active at any time
            expect(activeHrefs.size).toBeLessThanOrEqual(1);
          } finally {
            unmount();
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'the active NavItem (if any) is the correct one based on exact or longest prefix match',
    () => {
      fc.assert(
        fc.property(pathArbitrary, (path) => {
          mockNavState.activePath = path;

          const { unmount } = render(<Navbar />);

          try {
            const navLinks = getNavLinks();

            // Find which nav links have the active class
            const activeLinks = navLinks.filter((el) =>
              el.className.includes(ACTIVE_CLASS_FRAGMENT),
            );

            // Deduplicate by href (desktop + mobile render the same links twice)
            const activeHrefs = new Set(
              activeLinks.map((el) => el.getAttribute('href')),
            );

            const expectedActiveHref = computeExpectedActiveHref(path);

            if (expectedActiveHref === null) {
              // No item should be active
              expect(activeHrefs.size).toBe(0);
            } else {
              // Exactly the expected item should be active
              expect(activeHrefs.size).toBe(1);
              expect(activeHrefs.has(expectedActiveHref)).toBe(true);
            }
          } finally {
            unmount();
          }
        }),
        { numRuns: 100 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Property 2: Mobile Menu Closes on Navigation
//
// Feature: modernize-navigation-menu, Property 2: Mobile Menu Closes on Navigation
// Validates: Requirements 3.4
// ---------------------------------------------------------------------------

/**
 * Nav items rendered inside the mobile menu when the user is authenticated.
 * These mirror the NavItem components rendered in Navbar.tsx's mobile drawer,
 * each of which receives `onClick={() => setIsMenuOpen(false)}`.
 *
 * Order matches the render order in the component:
 *   1. NAV_ITEMS filtered by auth (recipes, recipes/new, setups)
 *   2. Profile link (/u/alice for the test user)
 */
const MOBILE_NAV_ITEMS = [
  { href: '/recipes', label: 'Recipes' },
  { href: '/recipes/new', label: 'New Recipe' },
  { href: '/setups', label: 'My Setups' },
  { href: '/u/alice', label: 'Profile' },
];

describe('Navbar — Property 2: Mobile Menu Closes on Navigation', () => {
  it(
    'clicking any nav item in the mobile menu closes the menu (isMenuOpen becomes false)',
    async () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * Feature: modernize-navigation-menu, Property 2: Mobile Menu Closes on Navigation
       *
       * For any nav item index in the mobile menu, opening the menu and clicking
       * that item must result in the mobile menu being removed from the DOM
       * (isMenuOpen transitions to false).
       */
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: MOBILE_NAV_ITEMS.length - 1 }),
          async (navItemIndex) => {
            const user = userEvent.setup();

            const { unmount } = render(<Navbar />);

            try {
              // Step 1: Open the mobile menu via the hamburger button
              const hamburger = screen.getByRole('button', {
                name: enTranslations['nav.menuToggle'],
              });
              await user.click(hamburger);

              // Verify the menu is open
              const dialog = screen.getByRole('dialog', {
                name: enTranslations['nav.menu'],
              });
              expect(dialog).toBeInTheDocument();

              // Step 2: Find the nav item at the generated index inside the mobile menu
              const targetItem = MOBILE_NAV_ITEMS[navItemIndex];
              const allLinks = screen.getAllByRole('link', { name: targetItem.label });

              // The mobile menu link is the one inside the dialog
              const mobileLink = allLinks.find((el) => dialog.contains(el));
              expect(mobileLink).toBeDefined();

              // Step 3: Click the nav item
              await user.click(mobileLink!);

              // Step 4: Verify the mobile menu is no longer in the DOM
              expect(
                screen.queryByRole('dialog', { name: enTranslations['nav.menu'] }),
              ).not.toBeInTheDocument();
            } finally {
              unmount();
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Property 3: All Visible Text From i18n
//
// Feature: modernize-navigation-menu, Property 3: All Visible Text From i18n
// Validates: Requirements 5.1, 5.3
// ---------------------------------------------------------------------------

/**
 * Translation tables for all supported locales.
 *
 * These mirror the actual translation files in packages/shared/src/i18n/
 * and cover every i18n key used by the Navbar component.
 */
const LOCALE_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    'app.name': 'BrewForm',
    'nav.recipes': 'Recipes',
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
  },
  tr: {
    'app.name': 'BrewForm',
    'nav.recipes': 'Tarifler',
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
  },
};

const SUPPORTED_LOCALES = Object.keys(LOCALE_TRANSLATIONS) as Array<'en' | 'tr'>;

/**
 * The set of i18n keys used for user-visible text in the Navbar (Req 5.1).
 * Unauthenticated state keys:
 */
const UNAUTHENTICATED_TEXT_KEYS = [
  'app.name',
  'nav.recipes',
  'nav.login',
  'nav.register',
] as const;

/**
 * Additional keys visible only when authenticated.
 */
const AUTHENTICATED_ONLY_TEXT_KEYS = [
  'recipe.create',
  'setup.title',
  'nav.profile',
  'nav.logout',
] as const;

/**
 * Keys used for aria-labels (Req 5.3 — hamburger button aria-label from i18n).
 * These are not visible text nodes but are part of the accessible name.
 */
const ARIA_LABEL_KEYS = [
  'nav.menuToggle',
] as const;

describe('Navbar — Property 3: All Visible Text From i18n', () => {
  /**
   * **Validates: Requirements 5.1, 5.3**
   *
   * Feature: modernize-navigation-menu, Property 3: All Visible Text From i18n
   *
   * For any supported locale and unauthenticated state, all user-visible text
   * in the Navbar SHALL be the output of t(key) for that locale — no hardcoded
   * display strings.
   */
  it(
    'all visible text in unauthenticated state matches t(key) for any supported locale',
    () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...SUPPORTED_LOCALES),
          (locale) => {
            const translations = LOCALE_TRANSLATIONS[locale];
            const t = (key: string) => translations[key] ?? key;

            mockUseTranslation.mockReturnValue({
              locale,
              setLocale: vi.fn(),
              t,
              availableLocales: SUPPORTED_LOCALES,
            });

            // Unauthenticated state
            mockUseAuth.mockReturnValue({
              user: null,
              isAuthenticated: false,
              isLoading: false,
              login: vi.fn(),
              register: vi.fn(),
              logout: vi.fn(),
              refreshUser: vi.fn(),
            } as ReturnType<typeof useAuth>);

            const { unmount } = render(<Navbar />);

            try {
              // Verify each unauthenticated text key is rendered with the correct translation
              for (const key of UNAUTHENTICATED_TEXT_KEYS) {
                const expectedText = t(key);
                // app.name is rendered as part of "☕ BrewForm" — check it's present
                if (key === 'app.name') {
                  // The brand link contains the app name
                  const brandLink = screen.getByRole('link', { name: new RegExp(expectedText) });
                  expect(brandLink).toBeInTheDocument();
                } else {
                  // Nav items and auth actions should appear as text
                  const elements = screen.getAllByText(expectedText);
                  expect(elements.length).toBeGreaterThan(0);
                }
              }

              // Verify authenticated-only items are NOT present
              for (const key of AUTHENTICATED_ONLY_TEXT_KEYS) {
                // nav.profile and nav.logout should not appear when unauthenticated
                if (key === 'nav.profile' || key === 'nav.logout') {
                  expect(screen.queryByText(t(key))).not.toBeInTheDocument();
                }
              }

              // Verify hamburger button aria-label comes from i18n (Req 5.3)
              for (const key of ARIA_LABEL_KEYS) {
                const expectedLabel = t(key);
                const hamburger = screen.getByRole('button', { name: expectedLabel });
                expect(hamburger).toHaveAttribute('aria-label', expectedLabel);
              }
            } finally {
              unmount();
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * **Validates: Requirements 5.1, 5.3**
   *
   * Feature: modernize-navigation-menu, Property 3: All Visible Text From i18n
   *
   * For any supported locale and authenticated state, all user-visible text
   * in the Navbar SHALL be the output of t(key) for that locale — no hardcoded
   * display strings.
   */
  it(
    'all visible text in authenticated state matches t(key) for any supported locale',
    () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...SUPPORTED_LOCALES),
          (locale) => {
            const translations = LOCALE_TRANSLATIONS[locale];
            const t = (key: string) => translations[key] ?? key;

            mockUseTranslation.mockReturnValue({
              locale,
              setLocale: vi.fn(),
              t,
              availableLocales: SUPPORTED_LOCALES,
            });

            // Authenticated state
            mockUseAuth.mockReturnValue({
              user: authenticatedUser,
              isAuthenticated: true,
              isLoading: false,
              login: vi.fn(),
              register: vi.fn(),
              logout: vi.fn(),
              refreshUser: vi.fn(),
            } as ReturnType<typeof useAuth>);

            const { unmount } = render(<Navbar />);

            try {
              // Verify all authenticated text keys are rendered with the correct translation
              const allKeys = [
                ...UNAUTHENTICATED_TEXT_KEYS.filter(
                  (k) => k !== 'nav.login' && k !== 'nav.register',
                ),
                ...AUTHENTICATED_ONLY_TEXT_KEYS,
              ] as const;

              for (const key of allKeys) {
                const expectedText = t(key);
                if (key === 'app.name') {
                  const brandLink = screen.getByRole('link', { name: new RegExp(expectedText) });
                  expect(brandLink).toBeInTheDocument();
                } else {
                  const elements = screen.getAllByText(expectedText);
                  expect(elements.length).toBeGreaterThan(0);
                }
              }

              // Verify unauthenticated-only items are NOT present
              expect(screen.queryByText(t('nav.login'))).not.toBeInTheDocument();
              expect(screen.queryByText(t('nav.register'))).not.toBeInTheDocument();

              // Verify hamburger button aria-label comes from i18n (Req 5.3)
              for (const key of ARIA_LABEL_KEYS) {
                const expectedLabel = t(key);
                const hamburger = screen.getByRole('button', { name: expectedLabel });
                expect(hamburger).toHaveAttribute('aria-label', expectedLabel);
              }
            } finally {
              unmount();
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * **Validates: Requirements 5.1, 5.3**
   *
   * Feature: modernize-navigation-menu, Property 3: All Visible Text From i18n
   *
   * For any supported locale and any authentication state, the hamburger button
   * aria-label SHALL be provided by the i18n system and change according to the
   * active locale (Req 5.3).
   */
  it(
    'hamburger button aria-label changes with locale for any supported locale and auth state',
    () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...SUPPORTED_LOCALES),
          fc.boolean(),
          (locale, isAuthenticated) => {
            const translations = LOCALE_TRANSLATIONS[locale];
            const t = (key: string) => translations[key] ?? key;

            mockUseTranslation.mockReturnValue({
              locale,
              setLocale: vi.fn(),
              t,
              availableLocales: SUPPORTED_LOCALES,
            });

            mockUseAuth.mockReturnValue({
              user: isAuthenticated ? authenticatedUser : null,
              isAuthenticated,
              isLoading: false,
              login: vi.fn(),
              register: vi.fn(),
              logout: vi.fn(),
              refreshUser: vi.fn(),
            } as ReturnType<typeof useAuth>);

            const { unmount } = render(<Navbar />);

            try {
              const expectedLabel = t('nav.menuToggle');

              // The hamburger button must have the locale-specific aria-label
              const hamburger = screen.getByRole('button', { name: expectedLabel });
              expect(hamburger).toHaveAttribute('aria-label', expectedLabel);

              // The aria-label must equal the t('nav.menuToggle') output for this locale
              expect(hamburger.getAttribute('aria-label')).toBe(expectedLabel);
            } finally {
              unmount();
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
