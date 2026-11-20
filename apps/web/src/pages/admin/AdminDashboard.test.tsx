import { t } from '@brewform/shared/i18n';
import { screen } from '@testing-library/react';
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

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: () => null,
}));

vi.mock('../../api/index.ts', () => ({
  adminApi: { getStats: vi.fn() },
}));

import { adminApi } from '../../api/index.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { loader } from './AdminDashboard.data.ts';
import { AdminDashboard } from './AdminDashboard.tsx';

const mockGetStats = vi.mocked(adminApi.getStats);

const STATS = {
  totalUsers: 12345,
  totalRecipes: 1500,
  totalComments: 42,
  totalPhotos: 0,
  recentSignups: 7,
  recentRecipes: 3,
};

/** Renders `/admin` through its real loader inside the app providers. */
function renderDashboard() {
  return renderWithAppProviders(
    [{ path: '/admin', loader, Component: AdminDashboard, errorElement: <RouteErrorState /> }],
    { initialEntries: ['/admin'], auth: 'admin', locale: 'tr' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('AdminDashboard', () => {
  it('renders the Turkish heading and locale-grouped totals from the loader', async () => {
    mockGetStats.mockResolvedValue(STATS);
    renderDashboard();

    expect(await screen.findByText(t('admin.dashboard', 'tr'))).toBeInTheDocument();
    expect(screen.getByText('12.345')).toBeInTheDocument();
    expect(screen.getByText('1.500')).toBeInTheDocument();
    expect(screen.queryByText('12345')).not.toBeInTheDocument();
  });

  it('passes the request signal to the API', async () => {
    mockGetStats.mockResolvedValue(STATS);
    renderDashboard();

    await screen.findByText('12.345');
    expect(mockGetStats).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  });

  it('renders the route error state with a retry when the loader fails', async () => {
    mockGetStats.mockRejectedValue(new Error('boom'));
    renderDashboard();

    expect(await screen.findByText(t('error.route.loadFailed', 'tr'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('common.retry', 'tr') })).toBeInTheDocument();
  });
});
