import { t } from '@brewform/shared/i18n';
import type { PaginatedResponse } from '@brewform/shared/schemas';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
  adminApi: {
    getUsers: vi.fn(),
    toggleAdmin: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
  },
}));

import { ApiError } from '../../api/errors.ts';
import { adminApi } from '../../api/index.ts';
import type { AdminUser } from '../../api/types.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action as userAction } from './AdminUserDetailPage.data.ts';
import { action, loader } from './AdminUsersPage.data.ts';
import { AdminUsersPage } from './AdminUsersPage.tsx';

const mockAdminApi = vi.mocked(adminApi);

const ALICE: AdminUser = {
  id: 'u1',
  username: 'alice',
  email: 'alice@test.com',
  displayName: null,
  avatarUrl: null,
  isAdmin: false,
  isBanned: false,
  createdAt: '2024-01-01T00:00:00Z',
};

/** Builds the paginated envelope `GET /admin/users` returns. */
function usersPage(
  users: AdminUser[],
  { page = 1, totalPages = 1 }: { page?: number; totalPages?: number } = {},
): PaginatedResponse<AdminUser> {
  return {
    success: true,
    data: users,
    meta: { requestId: 'test', pagination: { page, perPage: 20, total: users.length, totalPages } },
  };
}

/** Renders `/admin/users` (at `entry`) with its real loader/action and the user action. */
function renderPage(entry = '/admin/users') {
  return renderWithAppProviders(
    [
      {
        path: '/admin/users',
        loader,
        action,
        Component: AdminUsersPage,
        errorElement: <RouteErrorState />,
      },
      { path: '/admin/users/:id', action: userAction },
    ],
    { initialEntries: [entry], auth: 'admin', locale: 'tr' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockAdminApi.getUsers.mockResolvedValue(usersPage([]));
});

describe('AdminUsersPage — loader and URL state', () => {
  it('renders the Turkish heading and the users from the loader', async () => {
    mockAdminApi.getUsers.mockResolvedValue(usersPage([ALICE]));
    renderPage();

    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(screen.getByText(t('admin.users.management', 'tr'))).toBeInTheDocument();
  });

  it('reads q and page from the URL for the API call and fills the search box', async () => {
    mockAdminApi.getUsers.mockResolvedValue(usersPage([ALICE], { page: 2, totalPages: 3 }));
    renderPage('/admin/users?q=ali&page=2');

    await screen.findByText('alice');
    expect(mockAdminApi.getUsers).toHaveBeenCalledWith(
      { page: '2', perPage: '20', q: 'ali' },
      { signal: expect.any(AbortSignal) },
    );
    expect(
      (screen.getByPlaceholderText(t('admin.users.searchPlaceholder', 'tr')) as HTMLInputElement)
        .value,
    ).toBe('ali');
  });

  it('typing a search commits ?q= after the pause (replace) and resets the page', async () => {
    mockAdminApi.getUsers.mockResolvedValue(usersPage([ALICE], { page: 2, totalPages: 3 }));
    const { router } = renderPage('/admin/users?page=2');
    await screen.findByText('alice');

    fireEvent.change(screen.getByPlaceholderText(t('admin.users.searchPlaceholder', 'tr')), {
      target: { value: 'ali' },
    });

    await waitFor(() => expect(router.state.location.search).toBe('?q=ali'));
    expect(router.state.historyAction).toBe('REPLACE');
    await waitFor(() =>
      expect(mockAdminApi.getUsers).toHaveBeenLastCalledWith(
        { page: '1', perPage: '20', q: 'ali' },
        { signal: expect.any(AbortSignal) },
      ),
    );
  });

  it('paging keeps the search', async () => {
    mockAdminApi.getUsers.mockImplementation(async (params) =>
      usersPage([ALICE], { page: Number(params?.page ?? 1), totalPages: 3 }),
    );
    const { router } = renderPage('/admin/users?q=ali');
    await screen.findByText('alice');

    fireEvent.click(screen.getByRole('button', { name: t('common.next', 'tr') }));

    await waitFor(() => expect(router.state.location.search).toBe('?q=ali&page=2'));
  });

  it('shows the no-search-results empty state for a search with no matches', async () => {
    renderPage('/admin/users?q=zzz');

    expect(await screen.findByText(t('admin.users.noSearchResults', 'tr'))).toBeInTheDocument();
  });

  it('renders the route error state when the loader fails', async () => {
    mockAdminApi.getUsers.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByText(t('error.route.loadFailed', 'tr'))).toBeInTheDocument();
  });
});

describe('AdminUsersPage — mutations', () => {
  it('toggleAdmin submits the intent to the action and revalidates the list', async () => {
    mockAdminApi.getUsers.mockResolvedValue(usersPage([ALICE]));
    mockAdminApi.toggleAdmin.mockResolvedValue({ ...ALICE, isAdmin: true } as never);
    renderPage();
    await screen.findByText('alice');

    mockAdminApi.getUsers.mockResolvedValue(usersPage([{ ...ALICE, isAdmin: true }]));
    fireEvent.click(screen.getByRole('button', { name: t('admin.users.makeAdmin', 'tr') }));

    await waitFor(() =>
      expect(mockAdminApi.toggleAdmin).toHaveBeenCalledWith('u1', true, {
        signal: expect.any(AbortSignal),
      }),
    );
    expect(
      await screen.findByRole('button', { name: t('admin.users.removeAdmin', 'tr') }),
    ).toBeInTheDocument();
  });

  it('shows an error toast when toggleAdmin fails', async () => {
    mockAdminApi.getUsers.mockResolvedValue(usersPage([ALICE]));
    mockAdminApi.toggleAdmin.mockRejectedValue(new ApiError('INTERNAL', 'boom', undefined, 500));
    renderPage();
    await screen.findByText('alice');

    fireEvent.click(screen.getByRole('button', { name: t('admin.users.makeAdmin', 'tr') }));

    expect(await screen.findByText(t('admin.users.makeAdminError', 'tr'))).toBeInTheDocument();
  });

  it('opens the ban dialog when the ban button is clicked', async () => {
    mockAdminApi.getUsers.mockResolvedValue(usersPage([ALICE]));
    renderPage();
    await screen.findByText('alice');

    fireEvent.click(screen.getByRole('button', { name: t('admin.users.ban', 'tr') }));

    expect(
      await screen.findByText(`${t('admin.users.banDialogTitle', 'tr')}: alice`),
    ).toBeInTheDocument();
  });

  it('unban submits to the /admin/users/:id action and patches the row without re-fetching', async () => {
    mockAdminApi.getUsers.mockResolvedValue(usersPage([{ ...ALICE, isBanned: true }]));
    mockAdminApi.unbanUser.mockResolvedValue({} as never);
    renderPage();
    await screen.findByText('alice');
    const loadsBefore = mockAdminApi.getUsers.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: t('admin.users.unban', 'tr') }));

    await waitFor(() =>
      expect(mockAdminApi.unbanUser).toHaveBeenCalledWith('u1', {
        signal: expect.any(AbortSignal),
      }),
    );
    expect(await screen.findByText(t('admin.users.active', 'tr'))).toBeInTheDocument();
    expect(mockAdminApi.getUsers.mock.calls.length).toBe(loadsBefore);
  });
});
