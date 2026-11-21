import type { AuthUser } from '@brewform/shared/types';
import { act, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider, useLoaderData } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../api/index.ts', () => ({
  authApi: { login: vi.fn(), register: vi.fn(), logout: vi.fn() },
  userApi: { me: vi.fn() },
}));

import { ApiError } from '../api/errors.ts';
import { userApi } from '../api/index.ts';
import { RequireAuth } from '../components/auth/RequireAuth.tsx';
import { AuthProvider, useAuth } from '../contexts/AuthContext.tsx';
import { AUTH_CHANGE_KEY } from '../utils/auth-broadcast.ts';
import { type AuthSyncRouter, useAuthTabSync } from './useAuthTabSync.ts';

const USER: AuthUser = {
  id: 'u1',
  email: 'u1@example.test',
  username: 'u1',
  displayName: null,
  avatarUrl: null,
  isAdmin: false,
  onboardingCompleted: true,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
};

const UNAUTHORIZED = new ApiError('UNAUTHORIZED', 'Unauthorized', undefined, 401);

let recipeLoads = 0;

/** The layout: a probe showing the signed-in user id, then the page. */
function Layout() {
  const { user } = useAuth();
  return (
    <div>
      <span data-testid="user">{user?.id ?? 'none'}</span>
      <Outlet />
    </div>
  );
}

/** An unguarded private page that renders its loader data. */
function CollectionPage() {
  const { name } = useLoaderData<{ name: string }>();
  return <h1>{name}</h1>;
}

/** Mounts the hook next to the router, the way `App.tsx` does. */
function Harness({ router }: { router: AuthSyncRouter & ReturnType<typeof createMemoryRouter> }) {
  useAuthTabSync(router);
  return <RouterProvider router={router} />;
}

/**
 * The home loader, slow like the real one: the navigation to `/` then commits as a transition
 * after the loader, which is the window in which an urgent "signed out" update would let
 * `RequireAuth` bounce the old page to `/login`.
 */
async function slowHomeLoader() {
  await new Promise((resolve) => setTimeout(resolve, 5));
  return null;
}

const HydrateFallback = () => null;

/** Renders the real `AuthProvider`, the hook and a memory router opened at `entry`. */
function renderAt(entry: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        Component: Layout,
        HydrateFallback,
        children: [
          { index: true, loader: slowHomeLoader, element: <p>home</p> },
          {
            path: 'settings',
            element: (
              <RequireAuth>
                <p>private settings</p>
              </RequireAuth>
            ),
          },
          {
            path: 'collections/c1',
            loader: () => ({ name: 'Secret beans' }),
            Component: CollectionPage,
          },
          {
            path: 'recipes/r1',
            loader: () => {
              recipeLoads++;
              return null;
            },
            element: <p>recipe</p>,
          },
        ],
      },
      { path: '/login', element: <p>login page</p> },
    ],
    { initialEntries: [entry] },
  );
  const seen: string[] = [];
  router.subscribe((state) => seen.push(state.location.pathname));
  render(
    <AuthProvider>
      <Harness router={router} />
    </AuthProvider>,
  );
  return { router, seen };
}

/** Dispatches a `storage` event like another tab writing `key`. */
function otherTabWrites(key: string | null, newValue: string | null) {
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  recipeLoads = 0;
});

describe('useAuthTabSync', () => {
  it('a sign-out in another tab leaves a private collection for / and signs this tab out', async () => {
    vi.mocked(userApi.me).mockResolvedValueOnce(USER).mockRejectedValue(UNAUTHORIZED);
    const { router } = renderAt('/collections/c1');
    expect(await screen.findByText('Secret beans')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('u1'));

    otherTabWrites(AUTH_CHANGE_KEY, 'logout:1');

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('none'));
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByText('Secret beans')).toBeNull();
  });

  it('a sign-out in another tab while on a guarded page ends on /, never on /login', async () => {
    vi.mocked(userApi.me).mockResolvedValueOnce(USER).mockRejectedValue(UNAUTHORIZED);
    const { router, seen } = renderAt('/settings');
    expect(await screen.findByText('private settings')).toBeInTheDocument();

    otherTabWrites(AUTH_CHANGE_KEY, 'logout:1');

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('none'));
    await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('');
    expect(seen).not.toContain('/login');
  });

  it('a sign-in in another tab re-reads the session and re-runs the loader once', async () => {
    vi.mocked(userApi.me).mockRejectedValueOnce(UNAUTHORIZED).mockResolvedValue(USER);
    const { router } = renderAt('/recipes/r1');
    expect(await screen.findByText('recipe')).toBeInTheDocument();
    await waitFor(() => expect(userApi.me).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
    const loadsBefore = recipeLoads;

    otherTabWrites(AUTH_CHANGE_KEY, 'login:2');

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('u1'));
    await waitFor(() => expect(recipeLoads).toBe(loadsBefore + 1));
    await waitFor(() => expect(router.state.revalidation).toBe('idle'));
    expect(recipeLoads).toBe(loadsBefore + 1);
    expect(router.state.location.pathname).toBe('/recipes/r1');
  });

  it('ignores other keys, removals and clear()', async () => {
    vi.mocked(userApi.me).mockResolvedValue(USER);
    const { router } = renderAt('/collections/c1');
    expect(await screen.findByText('Secret beans')).toBeInTheDocument();
    await waitFor(() => expect(userApi.me).toHaveBeenCalledTimes(1));
    const navigate = vi.spyOn(router, 'navigate');
    const revalidate = vi.spyOn(router, 'revalidate');

    otherTabWrites('brewform-static-cache-bust', 'logout:1');
    otherTabWrites(AUTH_CHANGE_KEY, null);
    otherTabWrites(null, null);
    await act(() => Promise.resolve());

    expect(navigate).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
    expect(userApi.me).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Secret beans')).toBeInTheDocument();
  });
});
