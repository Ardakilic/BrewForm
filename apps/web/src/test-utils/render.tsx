import type { AuthUser } from '@brewform/shared/types';
import { type RenderResult, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from '../AppProviders.tsx';
import type { AuthContextType } from '../contexts/AuthContext.tsx';

/** A signed-in regular user fixture. */
export const TEST_USER: AuthUser = {
  id: '00000000-0000-4000-8000-0000000000a1',
  email: 'user@example.test',
  username: 'tester',
  displayName: 'Tester',
  avatarUrl: null,
  isAdmin: false,
  onboardingCompleted: true,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
};

/** A signed-in admin fixture. */
export const TEST_ADMIN: AuthUser = {
  ...TEST_USER,
  id: '00000000-0000-4000-8000-0000000000a2',
  email: 'admin@example.test',
  username: 'admin',
  displayName: 'Admin',
  isAdmin: true,
};

/** Auth fixture accepted by {@link renderWithAppProviders}. */
export type AuthFixture = 'signed-out' | 'user' | 'admin' | Partial<AuthContextType>;

/**
 * Builds a fixed, settled auth context value (`isLoading: false`) for a fixture. Callbacks are
 * resolved no-ops unless overridden.
 */
export function makeAuth(fixture: AuthFixture = 'signed-out'): AuthContextType {
  const base: AuthContextType = {
    user: null,
    isLoading: false,
    isAuthenticated: false,
    sessionError: null,
    login: () => Promise.resolve(),
    register: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    refreshUser: () => Promise.resolve(),
    clearSessionError: () => {},
  };
  if (fixture === 'signed-out') return base;
  if (fixture === 'user') return { ...base, user: TEST_USER, isAuthenticated: true };
  if (fixture === 'admin') return { ...base, user: TEST_ADMIN, isAuthenticated: true };
  const merged = { ...base, ...fixture };
  return { ...merged, isAuthenticated: fixture.isAuthenticated ?? merged.user !== null };
}

/**
 * Installs a no-op `matchMedia` when jsdom lacks one (it does not implement it); the theme
 * provider and `useMediaQuery` read it. Leaves an existing stub in place.
 */
export function ensureMatchMedia(): void {
  if (typeof globalThis.matchMedia === 'function') return;
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

/** Hydration fallback for test routes with loaders (renders nothing while loaders run). */
const NullHydrateFallback = () => null;

/** Adds a null `HydrateFallback` to routes with a loader that lack one (avoids router warnings). */
function withHydrateFallback(routes: RouteObject[]): RouteObject[] {
  return routes.map((route) => {
    const children = route.children ? withHydrateFallback(route.children) : undefined;
    const needsFallback =
      (route.loader || route.lazy) &&
      !route.HydrateFallback &&
      route.hydrateFallbackElement === undefined;
    return {
      ...route,
      ...(needsFallback ? { HydrateFallback: NullHydrateFallback } : {}),
      ...(children ? { children } : {}),
    } as RouteObject;
  });
}

/** Options for {@link renderWithAppProviders}. */
export interface RenderWithAppProvidersOptions {
  /** Memory-router history entries; defaults to `['/']`. */
  initialEntries?: string[];
  /** Auth state; defaults to signed-out. */
  auth?: AuthFixture;
  /** Route path for a single element; defaults to `'*'` (matches any entry). */
  path?: string;
  /** UI locale, written to `localStorage` before render; defaults to the stored value or `en`. */
  locale?: 'en' | 'tr';
}

/** Result of {@link renderWithAppProviders}: the RTL result plus the router and auth value. */
export type RenderWithAppProvidersResult = RenderResult & {
  router: ReturnType<typeof createMemoryRouter>;
  auth: AuthContextType;
};

/**
 * Renders a page element, or a route tree, through `createMemoryRouter` inside the real
 * {@link AppProviders} stack (theme, i18n, toast, confirm, auth), so tests never wrap
 * themselves in individual providers. The auth provider is replaced by a fixed context value
 * built from `options.auth` so no session request is made.
 */
export function renderWithAppProviders(
  uiOrRoutes: ReactElement | RouteObject[],
  options: RenderWithAppProvidersOptions = {},
): RenderWithAppProvidersResult {
  ensureMatchMedia();
  if (options.locale) localStorage.setItem('brewform_locale', options.locale);
  const routes: RouteObject[] = Array.isArray(uiOrRoutes)
    ? withHydrateFallback(uiOrRoutes)
    : [{ path: options.path ?? '*', element: uiOrRoutes }];
  const router = createMemoryRouter(routes, { initialEntries: options.initialEntries ?? ['/'] });
  const auth = makeAuth(options.auth);
  const result = render(
    <AppProviders auth={auth}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...result, router, auth };
}
