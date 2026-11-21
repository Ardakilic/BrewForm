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

vi.mock('../../api/index.ts', () => ({
  badgeApi: { list: vi.fn() },
}));

import { badgeApi } from '../../api/index.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { loader } from './AdminBadgesPage.data.ts';
import { AdminBadgesPage } from './AdminBadgesPage.tsx';

const mockList = vi.mocked(badgeApi.list);

/** Renders `/admin/badges` through its real loader inside the app providers. */
function renderBadges() {
  return renderWithAppProviders(
    [
      {
        path: '/admin/badges',
        loader,
        Component: AdminBadgesPage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: ['/admin/badges'], auth: 'admin', locale: 'tr' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('AdminBadgesPage', () => {
  it('renders the badges from the loader', async () => {
    mockList.mockResolvedValue([
      {
        id: 'b1',
        name: 'First Brew',
        description: 'Logged a first brew',
        icon: '☕',
        rule: 'first_brew',
      } as never,
    ]);
    renderBadges();

    expect(await screen.findByText('First Brew')).toBeInTheDocument();
    expect(screen.getByText(t('admin.badgesShort', 'tr'))).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  });

  it('renders the empty state', async () => {
    mockList.mockResolvedValue([]);
    renderBadges();

    expect(await screen.findByText(t('admin.badges.noResults', 'tr'))).toBeInTheDocument();
  });

  it('renders the route error state (not an empty list) when the loader fails', async () => {
    mockList.mockRejectedValue(new Error('boom'));
    renderBadges();

    expect(await screen.findByText(t('error.route.loadFailed', 'tr'))).toBeInTheDocument();
    expect(screen.queryByText(t('admin.badges.noResults', 'tr'))).not.toBeInTheDocument();
  });
});
