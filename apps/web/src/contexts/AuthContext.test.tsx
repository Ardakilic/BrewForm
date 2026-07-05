import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from './AuthContext.tsx';
import { I18nProvider } from '../contexts/I18nContext.tsx';
import type { AuthUser } from '@brewform/shared/types';
import { useAuth } from './AuthContext.tsx';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

vi.mock('../api/index', () => ({
  authApi: {
    login: vi.fn(),
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
}));

import { ApiError, userApi } from '../api/index.ts';

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
      <span data-testid='user-id'>{user?.id ?? 'none'}</span>
      <span data-testid='session-error'>{sessionError ?? 'none'}</span>
      <span data-testid='loading'>{String(isLoading)}</span>
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
