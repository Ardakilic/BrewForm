import type { AuthUser } from '@brewform/shared/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

import { authApi, userApi } from '../api/index.ts';
import { RequireAuth } from '../components/auth/RequireAuth.tsx';
import { AuthProvider, useAuth } from '../contexts/AuthContext.tsx';
import { useSignOut } from './useSignOut.ts';

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

/** The layout: a sign-out button, the signed-in user id and the page. */
function Layout() {
  const signOut = useSignOut();
  const { user } = useAuth();
  return (
    <div>
      <button type="button" onClick={() => void signOut()}>
        sign out
      </button>
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

/** Renders the real `AuthProvider` above a memory router opened at `entry`. */
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
            loader: () => ({ ok: true }),
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
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return { router, seen };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(userApi.me).mockResolvedValue(USER);
  vi.mocked(authApi.logout).mockResolvedValue({} as never);
});

describe('useSignOut', () => {
  it('signing out from a private collection ends on / without its data', async () => {
    const { router } = renderAt('/collections/c1');
    expect(await screen.findByText('Secret beans')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('u1'));

    fireEvent.click(screen.getByText('sign out'));

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('none'));
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByText('home')).toBeInTheDocument();
    expect(screen.queryByText('Secret beans')).toBeNull();
    expect(authApi.logout).toHaveBeenCalledOnce();
  });

  it('signing out from a guarded page ends on /, never on /login', async () => {
    const { router, seen } = renderAt('/settings');
    expect(await screen.findByText('private settings')).toBeInTheDocument();

    fireEvent.click(screen.getByText('sign out'));

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('none'));
    await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('');
    expect(seen).not.toContain('/login');
  });

  it('a failed server logout still navigates and clears the user', async () => {
    vi.mocked(authApi.logout).mockRejectedValue(new TypeError('Failed to fetch'));
    const { router } = renderAt('/collections/c1');
    expect(await screen.findByText('Secret beans')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('u1'));

    fireEvent.click(screen.getByText('sign out'));

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('none'));
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByText('Secret beans')).toBeNull();
  });
});
