import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SEND_VERIFICATION_PATH, sendVerificationAction } from '../routes/resources/auth.ts';
import { EmailVerificationBanner } from './EmailVerificationBanner.tsx';

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

/** Renders the banner under a data router that has the send-verification resource route. */
function renderBanner() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <EmailVerificationBanner /> },
      { path: SEND_VERIFICATION_PATH, action: sendVerificationAction },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

vi.mock('../api/index.ts', () => ({
  authApi: { sendVerification: vi.fn() },
}));

vi.mock('../contexts/AuthContext.tsx', () => ({
  useAuth: () => ({ user: { id: 'u1', emailVerifiedAt: null } }),
}));

vi.mock('../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'emailVerification.banner': 'Please verify your email',
        'emailVerification.resend': 'Resend',
        'emailVerification.sending': 'Sending...',
        'emailVerification.sent': 'Sent',
        'error.rateLimited': 'Too many attempts. Please try again in {seconds} seconds.',
        'error.unauthorized': 'You need to be logged in to do that',
      })[key] ?? key,
  }),
}));

import { ApiError } from '../api/errors.ts';
import { authApi } from '../api/index.ts';

describe('EmailVerificationBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is site chrome marked print-hidden (print hides only marked elements, V2)', () => {
    renderBanner();
    expect(screen.getByText('Please verify your email').parentElement).toHaveClass('print-hidden');
  });

  it('shows the localised rate-limit message when the resend is throttled', async () => {
    vi.mocked(authApi.sendVerification).mockRejectedValueOnce(
      new ApiError('RATE_LIMITED', 'Too many verification emails', undefined, 429, 42),
    );
    renderBanner();

    fireEvent.click(screen.getByRole('button', { name: 'Resend' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Please try again in 42 seconds.',
    );
  });

  it('shows the error.unauthorized text when the session has expired (401)', async () => {
    vi.mocked(authApi.sendVerification).mockRejectedValueOnce(
      new ApiError('UNAUTHORIZED', 'no session', undefined, 401),
    );
    renderBanner();

    fireEvent.click(screen.getByRole('button', { name: 'Resend' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You need to be logged in to do that',
    );
  });

  it('stays silent on other failures', async () => {
    vi.mocked(authApi.sendVerification).mockRejectedValueOnce(new Error('Network error'));
    renderBanner();

    fireEvent.click(screen.getByRole('button', { name: 'Resend' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Resend' })).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the sent state after a successful resend', async () => {
    vi.mocked(authApi.sendVerification).mockResolvedValueOnce(undefined as never);
    renderBanner();

    fireEvent.click(screen.getByRole('button', { name: 'Resend' }));

    expect(await screen.findByRole('button', { name: 'Sent' })).toBeDisabled();
    expect(authApi.sendVerification).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  });
});
