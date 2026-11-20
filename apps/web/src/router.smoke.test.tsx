import { t } from '@brewform/shared/i18n';
import type { AuthUser } from '@brewform/shared/types';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from './AppProviders.tsx';
import { routes } from './router.tsx';

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

const OOPS = t('error.boundary.oops');
const ADMIN_TITLE = t('admin.title');
const FIXTURE_UUID = '00000000-0000-4000-8000-000000000001';

/** Fixture values substituted for each dynamic route segment. */
const PARAM_FIXTURES: Record<string, string> = {
  slug: 'smoke-recipe',
  slug1: 'smoke-recipe-a',
  slug2: 'smoke-recipe-b',
  id: FIXTURE_UUID,
  username: 'smoke-user',
  userId: FIXTURE_UUID,
  recipeId: FIXTURE_UUID,
};

/** Every admin route that exists today (a lower bound for the derived path list). */
const ADMIN_PATHS = [
  '/admin',
  '/admin/users',
  '/admin/users/new',
  '/admin/users/:id',
  '/admin/users/:id/edit',
  '/admin/recipes',
  '/admin/equipment',
  '/admin/vendors',
  '/admin/taste-notes',
  '/admin/coffee-varieties',
  '/admin/compatibility',
  '/admin/badges',
  '/admin/audit-log',
  '/admin/cache',
];

const ADMIN: AuthUser = {
  id: '00000000-0000-4000-8000-0000000000ad',
  email: 'admin@example.test',
  username: 'admin',
  displayName: 'Admin',
  avatarUrl: null,
  isAdmin: true,
  onboardingCompleted: true,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
};

/** The user an admin views or edits at `/admin/users/:id` (a different account). */
const TARGET_USER = {
  ...ADMIN,
  id: FIXTURE_UUID,
  username: 'smoke-target',
  email: 'target@example.test',
  isAdmin: false,
  isBanned: false,
  bio: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Endpoints whose success payload is an object rather than a list. */
const OBJECT_FIXTURES: Record<string, unknown> = {
  [`/admin/users/${FIXTURE_UUID}`]: TARGET_USER,
  '/admin/users': { users: [], total: 0 },
  '/admin/stats': {
    totalUsers: 0,
    totalRecipes: 0,
    totalComments: 0,
    totalPhotos: 0,
    recentSignups: 0,
    recentRecipes: 0,
  },
};

/** A renderable route found by walking {@link routes}. */
interface RenderableRoute {
  /** The full route pattern, e.g. `/recipes/:slug`. */
  pattern: string;
  /** The pattern with fixture values substituted, e.g. `/recipes/smoke-recipe`. */
  url: string;
  admin: boolean;
}

/** Joins a parent pattern and a child segment into a full pattern. */
function joinPath(parent: string, child: string): string {
  if (child.startsWith('/')) return child;
  const base = parent.endsWith('/') ? parent.slice(0, -1) : parent;
  return `${base}/${child}`;
}

/** True when a route renders something (an element, a Component, or a lazy definition). */
function rendersComponent(route: RouteObject): boolean {
  return Boolean(route.element || route.Component || route.lazy);
}

/**
 * Walks every nested route object and returns the routes that render UI. Action-only
 * routes (no element) and `resources/*` routes are skipped because they render nothing.
 */
function collectRenderableRoutes(tree: RouteObject[], parent = ''): RenderableRoute[] {
  const found: RenderableRoute[] = [];
  for (const route of tree) {
    const pattern = route.index ? parent || '/' : joinPath(parent, route.path ?? '');
    const isResource = pattern.split('/').includes('resources');
    if (!isResource && rendersComponent(route) && (route.index || route.path !== undefined)) {
      const url = pattern
        .split('/')
        .map((segment) =>
          segment === '*'
            ? 'smoke-unmatched-path'
            : segment.startsWith(':')
              ? (PARAM_FIXTURES[segment.slice(1)] ?? 'smoke-param')
              : segment,
        )
        .join('/');
      found.push({ pattern, url: url || '/', admin: pattern.startsWith('/admin') });
    }
    if (route.children) found.push(...collectRenderableRoutes(route.children, pattern));
  }
  return found;
}

/** Builds a JSON `Response` for the stubbed network layer. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The empty success envelope returned for every list/read endpoint. */
function emptyEnvelope(): Response {
  return json({
    success: true,
    data: [],
    meta: { pagination: { page: 1, perPage: 20, total: 0, totalPages: 0 } },
  });
}

/**
 * Stubs `fetch` with an empty-success-envelope factory. `/users/me` returns the admin when
 * signed in (401 otherwise), {@link OBJECT_FIXTURES} return their object payload, and other
 * detail reads of a fixture id or slug return 404 (a loader-driven not-found page is allowed).
 */
function stubFetch(signedIn: boolean): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      const path = url.pathname.replace(/^\/api\/v1/, '');
      if (path === '/users/me' || path === '/auth/refresh') {
        return signedIn
          ? json({ success: true, data: ADMIN })
          : json({ success: false, error: { code: 'UNAUTHORIZED', message: 'no session' } }, 401);
      }
      if (path in OBJECT_FIXTURES) return json({ success: true, data: OBJECT_FIXTURES[path] });
      const isFixtureDetail =
        path.split('/').some((segment) => Object.values(PARAM_FIXTURES).includes(segment)) &&
        !path.endsWith('/collections');
      if (isFixtureDetail) {
        return json({ success: false, error: { code: 'NOT_FOUND', message: 'missing' } }, 404);
      }
      return emptyEnvelope();
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  // jsdom does not implement matchMedia (ThemeProvider and useMediaQuery read it).
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Lets pending fetches, effects and redirects run. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
}

/**
 * Renders `url` through a memory router built from the real {@link routes} inside the real
 * {@link AppProviders} stack (no per-test wrappers) and waits for it to settle.
 */
async function renderUrl(url: string, signedIn: boolean) {
  stubFetch(signedIn);
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  await waitFor(() => {
    expect(router.state.initialized).toBe(true);
    expect(router.state.navigation.state).toBe('idle');
  });
  await flush();
  await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
  await flush();
  return router;
}

/** Renderable routes, one per URL (a layout route and its index child share a URL). */
const renderable = collectRenderableRoutes(routes).filter(
  (route, index, all) => all.findIndex((other) => other.url === route.url) === index,
);
const adminRoutes = renderable.filter((r) => r.admin);
const appRoutes = renderable.filter((r) => !r.admin);

describe('router smoke test: route walk', () => {
  it('derives every admin route from the route tree', () => {
    const patterns = adminRoutes.map((r) => r.pattern);
    for (const path of ADMIN_PATHS) expect(patterns).toContain(path);
  });

  it('skips action-only and resource routes', () => {
    const patterns = renderable.map((r) => r.pattern);
    expect(patterns).not.toContain('/recipes/:id/like');
    expect(patterns).not.toContain('/comments/:id');
    expect(patterns.some((p) => p.includes('/resources/'))).toBe(false);
    expect(patterns).toContain('/recipes/:slug');
    expect(patterns).toContain('/settings');
  });
});

describe('router smoke test: the five formerly crashing admin pages', () => {
  it.each([
    '/admin/recipes',
    '/admin/vendors',
    `/admin/users/${FIXTURE_UUID}`,
    '/admin/compatibility',
    '/admin/coffee-varieties',
  ])('renders %s inside AdminLayout without an error boundary', async (url) => {
    await renderUrl(url, true);
    expect(screen.queryByText(OOPS)).toBeNull();
    expect(screen.getByText(ADMIN_TITLE)).toBeInTheDocument();
  });
});

describe('router smoke test: every admin route renders as a signed-in admin', () => {
  it.each(adminRoutes.map((r) => [r.pattern, r.url]))('%s', async (_pattern, url) => {
    await renderUrl(url, true);
    expect(screen.queryByText(OOPS)).toBeNull();
    expect(screen.getByText(ADMIN_TITLE)).toBeInTheDocument();
  });
});

describe('router smoke test: every app route renders signed-out', () => {
  it.each(appRoutes.map((r) => [r.pattern, r.url]))('%s', async (_pattern, url) => {
    await renderUrl(url, false);
    expect(screen.queryByText(OOPS)).toBeNull();
  });
});

describe('router smoke test: every app route renders as a signed-in admin', () => {
  it.each(appRoutes.map((r) => [r.pattern, r.url]))('%s', async (_pattern, url) => {
    await renderUrl(url, true);
    expect(screen.queryByText(OOPS)).toBeNull();
  });
});
