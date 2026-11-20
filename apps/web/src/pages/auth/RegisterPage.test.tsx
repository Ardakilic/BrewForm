import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi, userApi } from '../../api/index.ts';
import { AuthProvider } from '../../contexts/AuthContext.tsx';
import { I18nProvider } from '../../contexts/I18nContext.tsx';
import { ROOT_ROUTE_ID, rootLoader } from '../../routes/root.ts';
import { RegisterPage } from './RegisterPage.tsx';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

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
    code: string;
    status: number;
    details?: Array<{ field: string; message: string }>;
    constructor(
      code: string,
      message: string,
      details?: Array<{ field: string; message: string }>,
      status: number = 500,
    ) {
      super(message);
      this.code = code;
      this.status = status;
      this.details = details;
    }
  },
  authApi: {
    register: vi.fn(),
    registrationStatus: vi.fn(),
    logout: vi.fn().mockResolvedValue({}),
  },
  userApi: {
    me: vi.fn().mockResolvedValue(null),
  },
}));

/** Renders `/register` under the real root route, whose loader reads the registration flag. */
function renderRegisterPage() {
  const router = createMemoryRouter(
    [
      {
        id: ROOT_ROUTE_ID,
        path: '/',
        loader: rootLoader,
        HydrateFallback: RootHydrateFallback,
        children: [{ path: 'register', element: <RegisterPage /> }],
      },
    ],
    { initialEntries: ['/register'] },
  );
  return render(
    <I18nProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </I18nProvider>,
  );
}

/** Rendered while the root loader is pending. */
function RootHydrateFallback() {
  return <p>root loading</p>;
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger.debug.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  it('logs mount and unmount', async () => {
    vi.mocked(authApi.registrationStatus).mockResolvedValue({ enabled: true });
    const { unmount } = renderRegisterPage();
    await waitFor(() => expect(mockLogger.debug).toHaveBeenCalledWith({}, 'RegisterPage mounted'));
    unmount();
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'RegisterPage unmounted'),
    );
  });

  it('waits for the root loader before rendering the form', () => {
    vi.mocked(authApi.registrationStatus).mockReturnValue(new Promise(() => {}));
    vi.mocked(userApi.me).mockReturnValue(new Promise(() => {}));
    renderRegisterPage();
    expect(screen.getByText('root loading')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('you@example.com')).not.toBeInTheDocument();
  });

  it('reads the flag from the root loader with one status request', async () => {
    vi.mocked(authApi.registrationStatus).mockResolvedValue({ enabled: true });
    renderRegisterPage();
    await screen.findByPlaceholderText('you@example.com');
    expect(authApi.registrationStatus).toHaveBeenCalledTimes(1);
    expect(authApi.registrationStatus).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  });

  it('should show registration form when enabled', async () => {
    vi.mocked(authApi.registrationStatus).mockResolvedValue({ enabled: true });
    renderRegisterPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    });
  });

  it('should show closed message when registration is disabled', async () => {
    vi.mocked(authApi.registrationStatus).mockResolvedValue({ enabled: false });
    renderRegisterPage();
    await waitFor(() => {
      expect(screen.getByText(/registration.*disabled/i)).toBeInTheDocument();
    });
  });

  it('should show login link when registration is disabled', async () => {
    vi.mocked(authApi.registrationStatus).mockResolvedValue({ enabled: false });
    renderRegisterPage();
    await waitFor(() => {
      const loginLink = screen.getByRole('link', { name: /log in/i });
      expect(loginLink).toBeInTheDocument();
      expect(loginLink.getAttribute('href')).toBe('/login');
    });
  });

  it('should fall back to showing form when status check fails', async () => {
    vi.mocked(authApi.registrationStatus).mockRejectedValue(new Error('Network error'));
    renderRegisterPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'rootLoader registrationStatus failed',
    );
  });

  it('should display structured error message from ApiError on registration failure', async () => {
    vi.mocked(authApi.registrationStatus).mockResolvedValue({ enabled: true });
    const { ApiError: MockApiError } = await import('../../api/index.ts');
    vi.mocked(authApi.register).mockRejectedValue(
      new MockApiError(
        'VALIDATION_ERROR',
        'Validation failed',
        [{ field: 'email', message: 'Already taken' }],
        400,
      ),
    );
    renderRegisterPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    });
    const userEvent = (await import('@testing-library/user-event')).default;
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'taken@test.com');
    await userEvent.type(screen.getByPlaceholderText('coffee_lover'), 'testuser');
    await userEvent.type(screen.getByPlaceholderText(/re-enter your password/i), 'Passw0rd!');
    const passwordInputs = screen.getAllByPlaceholderText(/at least 8 characters/i);
    await userEvent.type(passwordInputs[0], 'Passw0rd!');
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }));
    await waitFor(() => {
      expect(screen.getByText('Validation failed')).toBeInTheDocument();
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'RegisterPage registration failed',
    );
  });
});

describe('RegisterPage — return path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Renders `/register` (with `entry`'s search) in a memory router that also has `/` and `/collections`. */
  async function renderRegisterAt(entry: string) {
    const router = createMemoryRouter(
      [
        { path: '/register', element: <RegisterPage /> },
        { path: '/collections', element: <p>collections page</p> },
        { path: '/', element: <p>home page</p> },
      ],
      { initialEntries: ['/start', entry], initialIndex: 1 },
    );
    render(
      <I18nProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </I18nProvider>,
    );
    await waitFor(() => {
      expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    });
    const userEvent = (await import('@testing-library/user-event')).default;
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'new@test.com');
    await userEvent.type(screen.getByPlaceholderText('coffee_lover'), 'newuser');
    await userEvent.type(screen.getByPlaceholderText(/re-enter your password/i), 'Passw0rd!');
    await userEvent.type(screen.getAllByPlaceholderText(/at least 8 characters/i)[0], 'Passw0rd!');
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }));
    return router;
  }

  const REGISTERED = {
    user: {
      id: '2',
      email: 'new@test.com',
      username: 'newuser',
      displayName: null,
      avatarUrl: null,
      emailVerifiedAt: null,
      isAdmin: false,
      onboardingCompleted: false,
    },
  };

  it('replaces the history entry with a safe ?next= path after registering', async () => {
    vi.mocked(authApi.registrationStatus).mockResolvedValue({ enabled: true });
    vi.mocked(authApi.register).mockResolvedValue(REGISTERED);

    const router = await renderRegisterAt('/register?next=%2Fcollections%3Fpage%3D2');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/collections');
    });
    expect(router.state.location.search).toBe('?page=2');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('refuses an unsafe ?next= and lands on /', async () => {
    vi.mocked(authApi.registrationStatus).mockResolvedValue({ enabled: true });
    vi.mocked(authApi.register).mockResolvedValue(REGISTERED);

    const router = await renderRegisterAt('/register?next=https%3A%2F%2Fevil.example');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });
});
