import type { AuthUser } from '@brewform/shared/types';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../contexts/I18nContext.tsx';
import { AuthProvider, useAuth } from './AuthContext.tsx';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

vi.mock('../utils/auth-broadcast.ts', () => ({ broadcastAuthChange: vi.fn() }));

vi.mock('../api/index', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn().mockResolvedValue({}),
    registrationStatus: vi.fn().mockResolvedValue({ enabled: true }),
  },
  userApi: {
    me: vi.fn().mockRejectedValue(new Error('Not authenticated')),
  },
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
}));

import { ApiError } from '../api/errors.ts';
import { authApi, userApi } from '../api/index.ts';
import { broadcastAuthChange } from '../utils/auth-broadcast.ts';

const VALID_USER: AuthUser = {
  id: 'u1',
  email: 'x@y.z',
  username: 'x',
  displayName: null,
  avatarUrl: null,
  isAdmin: false,
  onboardingCompleted: true,
  emailVerifiedAt: '2024-01-01T00:00:00.000Z',
};

/**
 * Exposes the auth context state into the DOM for assertion. A tiny
 * consumer-only component that reads `useAuth()` and renders the fields
 * under test into spans — `user-id`, `session-error`, `loading`.
 */
function TestConsumer() {
  const { user, sessionError, isLoading } = useAuth();
  return (
    <div>
      <span data-testid="user-id">{user?.id ?? 'none'}</span>
      <span data-testid="session-error">{sessionError ?? 'none'}</span>
      <span data-testid="loading">{String(isLoading)}</span>
    </div>
  );
}

async function renderProvider() {
  const result = render(
    <MemoryRouter>
      <I18nProvider>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
  // Wait for the mount refreshUser to settle (isLoading flips to false).
  await waitFor(() => {
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });
  return result;
}

describe('AuthContext refreshUser error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger.debug.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
    // Reset default — each test overrides as needed.
    vi.mocked(userApi.me).mockRejectedValue(new Error('Not authenticated'));
  });

  it('401 on refresh — sessionError stays null, warn logged', async () => {
    vi.mocked(userApi.me).mockRejectedValue(
      new ApiError('UNAUTHORIZED', 'Unauthorized', undefined, 401),
    );
    await renderProvider();
    expect(screen.getByTestId('user-id').textContent).toBe('none');
    expect(screen.getByTestId('session-error').textContent).toBe('none');
    expect(mockLogger.warn).toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('500 on refresh — sessionError is server, error logged', async () => {
    vi.mocked(userApi.me).mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Server error', undefined, 500),
    );
    await renderProvider();
    expect(screen.getByTestId('user-id').textContent).toBe('none');
    expect(screen.getByTestId('session-error').textContent).toBe('server');
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('network failure — sessionError is network, error logged', async () => {
    vi.mocked(userApi.me).mockRejectedValue(new TypeError('Failed to fetch'));
    await renderProvider();
    expect(screen.getByTestId('user-id').textContent).toBe('none');
    expect(screen.getByTestId('session-error').textContent).toBe('network');
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('banned user — sessionError null, warn with banned message', async () => {
    vi.mocked(userApi.me).mockRejectedValue(
      new ApiError('USER_BANNED', 'Account banned', undefined, 403),
    );
    await renderProvider();
    expect(screen.getByTestId('user-id').textContent).toBe('none');
    expect(screen.getByTestId('session-error').textContent).toBe('none');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'AuthContext user account is banned',
    );
  });

  it('successful refresh — user set, no error', async () => {
    vi.mocked(userApi.me).mockResolvedValue(VALID_USER);
    await renderProvider();
    expect(screen.getByTestId('user-id').textContent).toBe('u1');
    expect(screen.getByTestId('session-error').textContent).toBe('none');
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});

describe('AuthContext session bootstrap abort', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes an AbortSignal to userApi.me and aborts it on unmount without logging an error', async () => {
    let captured: AbortSignal | undefined;
    vi.mocked(userApi.me).mockImplementation(
      (opts?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          captured = opts?.signal;
          opts?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const { unmount } = render(
      <MemoryRouter>
        <I18nProvider>
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        </I18nProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(captured).toBeInstanceOf(AbortSignal));
    expect(captured?.aborted).toBe(false);

    unmount();

    expect(captured?.aborted).toBe(true);
    await Promise.resolve();
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith({}, 'AuthContext token refresh aborted');
  });
});

/** Exposes `logout(leave)` through a captured context value for the order tests. */
let capturedAuth: ReturnType<typeof useAuth> | null = null;

/** Captures the auth context and renders the user id. */
function LogoutConsumer() {
  capturedAuth = useAuth();
  return <span data-testid="user-id">{capturedAuth.user?.id ?? 'none'}</span>;
}

/** Renders the real provider signed in as {@link VALID_USER}. */
async function renderSignedIn() {
  vi.mocked(userApi.me).mockResolvedValue(VALID_USER);
  render(
    <MemoryRouter>
      <I18nProvider>
        <AuthProvider>
          <LogoutConsumer />
        </AuthProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByTestId('user-id').textContent).toBe('u1'));
}

describe('AuthContext logout(leave)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedAuth = null;
    vi.mocked(authApi.logout).mockResolvedValue({} as never);
  });

  it('logout runs leave between the server logout and clearing the user', async () => {
    await renderSignedIn();
    const order: string[] = [];
    vi.mocked(authApi.logout).mockImplementation(() => {
      order.push('server logout');
      return Promise.resolve({} as never);
    });
    let userInsideLeave = '';
    const leave = vi.fn(() => {
      order.push('leave');
      userInsideLeave = screen.getByTestId('user-id').textContent ?? '';
    });

    await act(() => capturedAuth?.logout(leave) ?? Promise.resolve());

    expect(order).toEqual(['server logout', 'leave']);
    expect(userInsideLeave).toBe('u1');
    expect(screen.getByTestId('user-id').textContent).toBe('none');
  });

  it('a throwing leave still clears the user', async () => {
    await renderSignedIn();
    const leave = vi.fn(() => {
      throw new Error('navigation failed');
    });

    await act(async () => {
      await capturedAuth?.logout(leave).catch(() => undefined);
    });

    expect(leave).toHaveBeenCalledOnce();
    expect(screen.getByTestId('user-id').textContent).toBe('none');
  });
});

describe('AuthContext broadcasts sign-in and sign-out to other tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedAuth = null;
    vi.mocked(authApi.logout).mockResolvedValue({} as never);
  });

  it('a successful login broadcasts login once', async () => {
    vi.mocked(userApi.me).mockRejectedValue(new ApiError('UNAUTHORIZED', 'no', undefined, 401));
    vi.mocked(authApi.login).mockResolvedValue({ user: VALID_USER } as never);
    render(
      <MemoryRouter>
        <I18nProvider>
          <AuthProvider>
            <LogoutConsumer />
          </AuthProvider>
        </I18nProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(userApi.me).toHaveBeenCalled());

    await act(() => capturedAuth?.login('x@y.z', 'pw') ?? Promise.resolve());

    expect(broadcastAuthChange).toHaveBeenCalledTimes(1);
    expect(broadcastAuthChange).toHaveBeenCalledWith('login');
  });

  it('a successful registration broadcasts login once', async () => {
    vi.mocked(userApi.me).mockRejectedValue(new ApiError('UNAUTHORIZED', 'no', undefined, 401));
    vi.mocked(authApi.register).mockResolvedValue({ user: VALID_USER } as never);
    render(
      <MemoryRouter>
        <I18nProvider>
          <AuthProvider>
            <LogoutConsumer />
          </AuthProvider>
        </I18nProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(userApi.me).toHaveBeenCalled());

    await act(
      () =>
        capturedAuth?.register({ email: 'x@y.z', username: 'x', password: 'pw' }) ??
        Promise.resolve(),
    );

    expect(broadcastAuthChange).toHaveBeenCalledTimes(1);
    expect(broadcastAuthChange).toHaveBeenCalledWith('login');
  });

  it('a failed login does not broadcast', async () => {
    vi.mocked(userApi.me).mockRejectedValue(new ApiError('UNAUTHORIZED', 'no', undefined, 401));
    vi.mocked(authApi.login).mockRejectedValue(
      new ApiError('INVALID_CREDENTIALS', 'bad', undefined, 401),
    );
    render(
      <MemoryRouter>
        <I18nProvider>
          <AuthProvider>
            <LogoutConsumer />
          </AuthProvider>
        </I18nProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(userApi.me).toHaveBeenCalled());

    await act(async () => {
      await capturedAuth?.login('x@y.z', 'wrong').catch(() => undefined);
    });

    expect(broadcastAuthChange).not.toHaveBeenCalled();
  });

  it('logout broadcasts logout before leave runs, even when the server logout fails', async () => {
    await renderSignedIn();
    vi.mocked(authApi.logout).mockRejectedValue(new TypeError('Failed to fetch'));
    const order: string[] = [];
    vi.mocked(broadcastAuthChange).mockImplementation((change) => {
      order.push(`broadcast ${change}`);
    });
    const leave = vi.fn(() => {
      order.push('leave');
    });

    await act(() => capturedAuth?.logout(leave) ?? Promise.resolve());

    expect(order).toEqual(['broadcast logout', 'leave']);
    expect(broadcastAuthChange).toHaveBeenCalledTimes(1);
  });

  it('the session bootstrap does not broadcast', async () => {
    await renderSignedIn();

    expect(broadcastAuthChange).not.toHaveBeenCalled();
  });
});
