import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { AuthUser } from '@brewform/shared/types';
import { RequireAuth } from './RequireAuth.tsx';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../contexts/AuthContext.tsx', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: vi.fn(),
}));

vi.mock('../ui/Skeleton.tsx', () => ({
  PageSkeleton: () => <div data-testid='page-skeleton'>Loading...</div>,
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { useAuth } from '../../contexts/AuthContext.tsx';

const mockUseAuth = vi.mocked(useAuth);

const VALID_USER: AuthUser = {
  id: 'u1',
  email: 'admin@example.com',
  username: 'admin',
  displayName: 'Admin',
  avatarUrl: null,
  isAdmin: true,
  onboardingCompleted: true,
  emailVerifiedAt: null,
};

function renderWithRouter(
  authValue: ReturnType<typeof useAuth>,
  requireAdmin = false,
) {
  mockUseAuth.mockReturnValue(authValue);
  const router = createMemoryRouter(
    [
      {
        path: '/protected',
        element: (
          <RequireAuth requireAdmin={requireAdmin}>
            <div data-testid='protected-content'>Protected</div>
          </RequireAuth>
        ),
      },
      {
        path: '/login',
        element: <div data-testid='login-page'>Login</div>,
      },
      {
        path: '/',
        element: <div data-testid='home-page'>Home</div>,
      },
    ],
    { initialEntries: ['/protected'] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RequireAuth', () => {
  it('should render the page skeleton when isLoading is true', () => {
    renderWithRouter({
      user: null,
      isLoading: true,
      isAuthenticated: false,
      sessionError: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      clearSessionError: vi.fn(),
    } as ReturnType<typeof useAuth>);
    expect(screen.getByTestId('page-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('should redirect to /login when unauthenticated', async () => {
    renderWithRouter({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      sessionError: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      clearSessionError: vi.fn(),
    } as ReturnType<typeof useAuth>);
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
  });

  it('should redirect to / when authenticated non-admin and requireAdmin is true', async () => {
    renderWithRouter(
      {
        user: { ...VALID_USER, isAdmin: false },
        isLoading: false,
        isAuthenticated: true,
        sessionError: null,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
        clearSessionError: vi.fn(),
      } as ReturnType<typeof useAuth>,
      true,
    );
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    });
  });

  it('should render children when authenticated admin and requireAdmin is true', () => {
    renderWithRouter(
      {
        user: VALID_USER,
        isLoading: false,
        isAuthenticated: true,
        sessionError: null,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
        clearSessionError: vi.fn(),
      } as ReturnType<typeof useAuth>,
      true,
    );
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('should render children when authenticated and requireAdmin is false', () => {
    renderWithRouter(
      {
        user: { ...VALID_USER, isAdmin: false },
        isLoading: false,
        isAuthenticated: true,
        sessionError: null,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
        clearSessionError: vi.fn(),
      } as ReturnType<typeof useAuth>,
      false,
    );
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });
});
