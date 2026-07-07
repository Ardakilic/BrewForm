import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ResetPasswordPage } from './ResetPasswordPage.tsx';
import { AuthProvider } from '../../contexts/AuthContext.tsx';
import { I18nProvider } from '../../contexts/I18nContext.tsx';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

vi.mock('../../api/index.ts', () => ({
  authApi: {
    resetPassword: vi.fn(),
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

function renderPage(token?: string) {
  const initialEntry = token ? `/reset-password?token=${token}` : '/reset-password';
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <I18nProvider>
        <AuthProvider>
          <ResetPasswordPage />
        </AuthProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

/**
 * ResetPasswordPage reads the reset token from URL search params, validates
 * password confirmation client-side, calls authApi.resetPassword on submit,
 * and shows a success view with a login link on completion.
 */
describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger.debug.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  it('renders the form with password fields and submit button when token is present', () => {
    renderPage('valid-token');
    expect(screen.getByPlaceholderText('At least 8 characters')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Re-enter your new password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
  });

  it('shows invalid link message when no token is in the URL', () => {
    renderPage();
    expect(screen.getByText('Invalid Link')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request new link/i })).toBeInTheDocument();
  });

  it('calls authApi.resetPassword with token and new password on submit', async () => {
    vi.mocked(authApi.resetPassword).mockResolvedValue({ message: 'password reset' });
    renderPage('valid-token');
    await userEvent.type(screen.getByPlaceholderText('At least 8 characters'), 'newpassword123');
    await userEvent.type(
      screen.getByPlaceholderText('Re-enter your new password'),
      'newpassword123',
    );
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));
    await waitFor(() => {
      expect(authApi.resetPassword).toHaveBeenCalledWith({
        token: 'valid-token',
        newPassword: 'newpassword123',
      });
    });
  });

  it('shows the success view with a login link on successful reset', async () => {
    vi.mocked(authApi.resetPassword).mockResolvedValue({ message: 'password reset' });
    renderPage('valid-token');
    await userEvent.type(screen.getByPlaceholderText('At least 8 characters'), 'newpassword123');
    await userEvent.type(
      screen.getByPlaceholderText('Re-enter your new password'),
      'newpassword123',
    );
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));
    await waitFor(() => {
      expect(screen.getByText('Password Reset')).toBeInTheDocument();
    });
  });

  it('shows a mismatch error when passwords do not match', async () => {
    renderPage('valid-token');
    await userEvent.type(screen.getByPlaceholderText('At least 8 characters'), 'newpassword123');
    await userEvent.type(
      screen.getByPlaceholderText('Re-enter your new password'),
      'differentpass',
    );
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));
    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
  });

  it('displays error message when resetPassword rejects', async () => {
    vi.mocked(authApi.resetPassword).mockRejectedValue(new Error('Failed to reset password'));
    renderPage('valid-token');
    await userEvent.type(screen.getByPlaceholderText('At least 8 characters'), 'newpassword123');
    await userEvent.type(
      screen.getByPlaceholderText('Re-enter your new password'),
      'newpassword123',
    );
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));
    await waitFor(() => {
      expect(screen.getByText('Failed to reset password')).toBeInTheDocument();
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'ResetPasswordPage resetPassword failed',
    );
  });
});
