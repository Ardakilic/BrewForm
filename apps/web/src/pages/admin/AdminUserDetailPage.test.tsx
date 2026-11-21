import { t } from '@brewform/shared/i18n';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

vi.mock('../../components/seo/SEOHead.tsx', () => ({ SEOHead: () => null }));

vi.mock('../../api/index.ts', () => ({
  adminApi: {
    getUserDetail: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    deleteUser: vi.fn(),
  },
}));

import { ApiError } from '../../api/errors.ts';
import { adminApi } from '../../api/index.ts';
import type { AdminUserDetail } from '../../api/types.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action, loader } from './AdminUserDetailPage.data.ts';
import { AdminUserDetailPage } from './AdminUserDetailPage.tsx';

const mockAdminApi = vi.mocked(adminApi);

const BOB: AdminUserDetail = {
  id: 'u2',
  email: 'bob@test.com',
  username: 'bob',
  displayName: 'Bob',
  avatarUrl: null,
  isAdmin: false,
  isBanned: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  bio: null,
  recipeCount: 3,
};

/** List page stub reached after a successful delete. */
const UsersListStub = () => <p>users list</p>;

/** Renders `/admin/users/:id` (at `entry`) through its real loader and action. */
function renderDetail(entry = '/admin/users/u2') {
  return renderWithAppProviders(
    [
      {
        path: '/admin/users/:id',
        loader,
        action,
        Component: AdminUserDetailPage,
        errorElement: <RouteErrorState />,
      },
      { path: '/admin/users', Component: UsersListStub },
    ],
    { initialEntries: [entry], auth: 'admin', locale: 'tr' },
  );
}

/** Opens the delete confirm dialog and confirms it. */
async function confirmDelete() {
  fireEvent.click(screen.getByRole('button', { name: t('admin.users.deleteUser', 'tr') }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: t('common.delete', 'tr') }));
}

/** Opens the ban dialog, types a reason and confirms. */
async function submitBan(reason: string) {
  fireEvent.click(screen.getByRole('button', { name: t('admin.banUser', 'tr') }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: reason } });
  fireEvent.click(within(dialog).getByRole('button', { name: t('admin.users.confirmBan', 'tr') }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockAdminApi.getUserDetail.mockResolvedValue(BOB);
});

describe('AdminUserDetailPage', () => {
  it('renders the user from the loader', async () => {
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Bob' })).toBeInTheDocument();
    expect(screen.getByText('bob@test.com')).toBeInTheDocument();
  });

  it('renders the not-found page when the user does not exist', async () => {
    mockAdminApi.getUserDetail.mockRejectedValue(
      new ApiError('NOT_FOUND', 'missing', undefined, 404),
    );
    renderDetail('/admin/users/missing');

    expect(await screen.findByText(t('error.404', 'tr'))).toBeInTheDocument();
  });

  it('renders the route error state for other load failures', async () => {
    mockAdminApi.getUserDetail.mockRejectedValue(new ApiError('INTERNAL', 'boom', undefined, 500));
    renderDetail();

    expect(await screen.findByText(t('error.route.loadFailed', 'tr'))).toBeInTheDocument();
  });

  it('delete confirms, submits the delete intent and returns to the list', async () => {
    mockAdminApi.deleteUser.mockResolvedValue({ message: 'ok' });
    const { router } = renderDetail();
    await screen.findByRole('heading', { name: 'Bob' });

    await confirmDelete();

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/users'));
    expect(mockAdminApi.deleteUser).toHaveBeenCalledWith('u2', {
      signal: expect.any(AbortSignal),
    });
  });

  it('shows an error toast and stays on the page when delete fails', async () => {
    mockAdminApi.deleteUser.mockRejectedValue(new ApiError('INTERNAL', 'boom', undefined, 500));
    const { router } = renderDetail();
    await screen.findByRole('heading', { name: 'Bob' });

    await confirmDelete();

    expect(await screen.findByText(t('admin.users.deleteFailed', 'tr'))).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/users/u2');
  });

  it('bans through the dialog and patches the status without re-fetching', async () => {
    mockAdminApi.banUser.mockResolvedValue({} as never);
    renderDetail();
    await screen.findByRole('heading', { name: 'Bob' });
    const loadsBefore = mockAdminApi.getUserDetail.mock.calls.length;

    await submitBan('Spam');

    await waitFor(() =>
      expect(mockAdminApi.banUser).toHaveBeenCalledWith('u2', 'Spam', {
        signal: expect.any(AbortSignal),
      }),
    );
    expect(await screen.findByText(t('admin.users.banned', 'tr'))).toBeInTheDocument();
    expect(mockAdminApi.getUserDetail.mock.calls.length).toBe(loadsBefore);
  });

  it('shows the translated ban error (never raw server text) when the ban fails', async () => {
    mockAdminApi.banUser.mockRejectedValue(
      new ApiError('INTERNAL', 'raw server text', undefined, 500),
    );
    renderDetail();
    await screen.findByRole('heading', { name: 'Bob' });

    await submitBan('Spam');

    expect(await screen.findByText(t('admin.users.banError', 'tr'))).toBeInTheDocument();
    expect(screen.queryByText('raw server text')).not.toBeInTheDocument();
  });
});
