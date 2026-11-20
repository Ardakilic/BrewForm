import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailVerificationBanner } from './EmailVerificationBanner.tsx';

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
      })[key] ?? key,
  }),
}));

import { ApiError } from '../api/errors.ts';
import { authApi } from '../api/index.ts';

describe('EmailVerificationBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the localised rate-limit message when the resend is throttled', async () => {
    vi.mocked(authApi.sendVerification).mockRejectedValueOnce(
      new ApiError('RATE_LIMITED', 'Too many verification emails', undefined, 429, 42),
    );
    render(<EmailVerificationBanner />);

    fireEvent.click(screen.getByRole('button', { name: 'Resend' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Please try again in 42 seconds.',
    );
  });

  it('stays silent on other failures', async () => {
    vi.mocked(authApi.sendVerification).mockRejectedValueOnce(new Error('Network error'));
    render(<EmailVerificationBanner />);

    fireEvent.click(screen.getByRole('button', { name: 'Resend' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Resend' })).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the sent state after a successful resend', async () => {
    vi.mocked(authApi.sendVerification).mockResolvedValueOnce(undefined as never);
    render(<EmailVerificationBanner />);

    fireEvent.click(screen.getByRole('button', { name: 'Resend' }));

    expect(await screen.findByRole('button', { name: 'Sent' })).toBeDisabled();
  });
});
