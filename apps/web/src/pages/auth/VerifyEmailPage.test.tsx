import { t } from '@brewform/shared/i18n';
import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogger, mockRefreshUser } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
  mockRefreshUser: vi.fn(),
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

vi.mock('../../contexts/AuthContext.tsx', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    sessionError: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: mockRefreshUser,
    clearSessionError: vi.fn(),
  }),
}));

vi.mock('../../api/index.ts', () => ({
  authApi: {
    verifyEmail: vi.fn(),
  },
}));

import { ApiError } from '../../api/errors.ts';
import { authApi } from '../../api/index.ts';
import { I18nProvider } from '../../contexts/I18nContext.tsx';
import { loader, shouldRevalidate } from './VerifyEmailPage.data.ts';
import { VerifyEmailPage, VerifyEmailPending } from './VerifyEmailPage.tsx';

const mockVerify = vi.mocked(authApi.verifyEmail);

/** Renders `/verify-email` at `entry` through its real loader (optionally under StrictMode). */
function renderAt(entry: string, strict = false) {
  const router = createMemoryRouter(
    [
      {
        path: '/verify-email',
        loader,
        shouldRevalidate,
        Component: VerifyEmailPage,
        HydrateFallback: VerifyEmailPending,
      },
    ],
    { initialEntries: [entry] },
  );
  const tree = (
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('brewform_locale', 'tr');
  mockRefreshUser.mockResolvedValue(undefined);
});

describe('VerifyEmailPage', () => {
  it('renders the Turkish error title and logs the failure in the loader', async () => {
    const err = new ApiError('INVALID_TOKEN', 'invalid token', undefined, 400);
    mockVerify.mockRejectedValue(err);

    renderAt('/verify-email?token=bad-token');

    expect(await screen.findByText(t('verifyEmail.errorTitle', 'tr'))).toBeInTheDocument();
    expect(screen.getByText(t('verifyEmail.failed', 'tr'))).toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalledWith({ err }, 'VerifyEmailPage verifyEmail failed');
    expect(mockRefreshUser).not.toHaveBeenCalled();
  });

  it('verifies the token once under StrictMode and refreshes the user once on success', async () => {
    mockVerify.mockResolvedValue({ message: 'ok' });

    renderAt('/verify-email?token=good-token', true);

    expect(await screen.findByText(t('verifyEmail.successTitle', 'tr'))).toBeInTheDocument();
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockVerify).toHaveBeenCalledWith('good-token', { signal: expect.any(AbortSignal) });
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalledTimes(1));
  });

  it('shows the no-token error without calling the API', async () => {
    renderAt('/verify-email');

    expect(await screen.findByText(t('verifyEmail.noToken', 'tr'))).toBeInTheDocument();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('shows the rate-limit message with the Retry-After seconds', async () => {
    mockVerify.mockRejectedValue(new ApiError('RATE_LIMITED', 'Too many', undefined, 429, 42));

    renderAt('/verify-email?token=t');

    expect(
      await screen.findByText(t('error.rateLimited', 'tr').replace('{seconds}', '42')),
    ).toBeInTheDocument();
  });

  it('logs mount and unmount', async () => {
    mockVerify.mockResolvedValue({ message: 'ok' });
    const { unmount } = renderAt('/verify-email?token=t');
    await screen.findByText(t('verifyEmail.successTitle', 'tr'));
    expect(mockLogger.debug).toHaveBeenCalledWith({}, 'VerifyEmailPage mounted');
    unmount();
    expect(mockLogger.debug).toHaveBeenCalledWith({}, 'VerifyEmailPage unmounted');
  });

  it('never revalidates', () => {
    expect(shouldRevalidate()).toBe(false);
  });
});
