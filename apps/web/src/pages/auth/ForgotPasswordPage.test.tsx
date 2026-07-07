import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ForgotPasswordPage } from './ForgotPasswordPage.tsx';
import { AuthProvider } from '../../contexts/AuthContext.tsx';
import { I18nProvider } from '../../contexts/I18nContext.tsx';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

vi.mock('../../api/index.ts', () => ({
  authApi: {
    forgotPassword: vi.fn(),
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

import { authApi } from '../../api/index.ts';

function renderPage() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <AuthProvider>
          <ForgotPasswordPage />
        </AuthProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

/**
 * ForgotPasswordPage renders an email-only reset-request form, calls
 * authApi.forgotPassword on submit, and swaps to a "check your email"
 * confirmation on success.
 */
describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger.debug.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  it('renders the form with email field and submit button', () => {
    renderPage();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('logs mount and unmount', async () => {
    const { unmount } = renderPage();
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'ForgotPasswordPage mounted')
    );
    unmount();
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'ForgotPasswordPage unmounted')
    );
  });

  it('calls authApi.forgotPassword with the email on submit', async () => {
    vi.mocked(authApi.forgotPassword).mockResolvedValue({ message: 'reset email sent' });
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'test@test.com');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => {
      expect(authApi.forgotPassword).toHaveBeenCalledWith({ email: 'test@test.com' });
    });
  });

  it('shows the check-email confirmation on success', async () => {
    vi.mocked(authApi.forgotPassword).mockResolvedValue({ message: 'reset email sent' });
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'test@test.com');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => {
      expect(screen.getByText('Check Your Email')).toBeInTheDocument();
    });
  });

  it('displays error message when forgotPassword rejects', async () => {
    vi.mocked(authApi.forgotPassword).mockRejectedValue(new Error('Failed to send reset email'));
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'bad@test.com');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => {
      expect(screen.getByText('Failed to send reset email')).toBeInTheDocument();
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'ForgotPasswordPage sendResetEmail failed',
    );
  });
});
