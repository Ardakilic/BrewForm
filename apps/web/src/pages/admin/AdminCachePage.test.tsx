import { t } from '@brewform/shared/i18n';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

vi.mock('../../api/index.ts', () => ({
  adminApi: { flushCache: vi.fn() },
}));

import { adminApi } from '../../api/index.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action } from './AdminCachePage.data.ts';
import { AdminCachePage } from './AdminCachePage.tsx';

const mockFlush = vi.mocked(adminApi.flushCache);

/** Renders `/admin/cache` with its real action. */
function renderPage(locale: 'en' | 'tr' = 'en') {
  return renderWithAppProviders(
    [
      {
        path: '/admin/cache',
        action,
        Component: AdminCachePage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: ['/admin/cache'], auth: 'admin', locale },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('AdminCachePage', () => {
  it('renders the Turkish cache management heading', async () => {
    renderPage('tr');

    expect(await screen.findByText(t('admin.cache.management', 'tr'))).toBeInTheDocument();
  });

  it('flushes through the action and toasts success', async () => {
    mockFlush.mockResolvedValue({ message: 'ok' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: t('admin.flushCache') }));

    expect(await screen.findByText(t('admin.cache.flushSuccess'))).toBeInTheDocument();
    expect(mockFlush).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  });

  it('toasts an error when the flush fails', async () => {
    mockFlush.mockRejectedValue(new Error('down'));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: t('admin.flushCache') }));

    expect(await screen.findByText(t('admin.cache.flushError'))).toBeInTheDocument();
    await waitFor(() => expect(mockLogger.error).toHaveBeenCalled());
  });
});
