import { t } from '@brewform/shared/i18n';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

import { renderWithAppProviders } from '../test-utils/render.tsx';
import { SessionRestoreBanner } from './SessionRestoreBanner.tsx';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('SessionRestoreBanner', () => {
  it('renders nothing without a session error', () => {
    renderWithAppProviders(<SessionRestoreBanner />, { locale: 'tr' });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the Turkish network message with Retry and Dismiss', async () => {
    renderWithAppProviders(<SessionRestoreBanner />, {
      locale: 'tr',
      auth: { sessionError: 'network', refreshUser: vi.fn(() => Promise.resolve()) },
    });

    expect(await screen.findByText(t('session.restore.networkError', 'tr'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('common.retry', 'tr') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('common.dismiss', 'tr') })).toBeInTheDocument();
  });

  it('shows the Turkish server message', async () => {
    renderWithAppProviders(<SessionRestoreBanner />, {
      locale: 'tr',
      auth: { sessionError: 'server', refreshUser: vi.fn(() => Promise.resolve()) },
    });

    expect(await screen.findByText(t('session.restore.serverError', 'tr'))).toBeInTheDocument();
  });

  it('Retry re-reads the session (showing the retrying label meanwhile) and Dismiss clears it', async () => {
    let finish: () => void = () => undefined;
    const refreshUser = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const clearSessionError = vi.fn();
    const user = userEvent.setup();
    renderWithAppProviders(<SessionRestoreBanner />, {
      locale: 'tr',
      auth: { sessionError: 'network', refreshUser, clearSessionError },
    });

    await user.click(await screen.findByRole('button', { name: t('common.retry', 'tr') }));
    expect(refreshUser).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: t('common.retrying', 'tr') })).toBeDisabled();
    finish();
    expect(await screen.findByRole('button', { name: t('common.retry', 'tr') })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: t('common.dismiss', 'tr') }));
    expect(clearSessionError).toHaveBeenCalledOnce();
  });
});
