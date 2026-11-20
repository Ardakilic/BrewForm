import { t } from '@brewform/shared/i18n';
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

vi.mock('../../components/seo/SEOHead.tsx', () => ({ SEOHead: () => null }));

vi.mock('../../api/index.ts', () => ({
  adminApi: {
    getUserDetail: vi.fn(),
    updateUser: vi.fn(),
  },
}));

import { ApiError } from '../../api/errors.ts';
import { adminApi } from '../../api/index.ts';
import type { AdminUserDetail } from '../../api/types.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders, TEST_ADMIN } from '../../test-utils/render.tsx';
import { action, loader } from './AdminUserEditPage.data.ts';
import { AdminUserEditPage } from './AdminUserEditPage.tsx';

const mockAdminApi = vi.mocked(adminApi);

const EDITED: AdminUserDetail = {
  id: 'user-to-edit',
  email: 'edit@example.com',
  username: 'edituser',
  displayName: 'Edit User',
  avatarUrl: null,
  isAdmin: false,
  isBanned: false,
  createdAt: '2024-01-01T00:00:00Z',
  bio: '',
  updatedAt: '2024-01-01T00:00:00Z',
};

/** Stub for the routes the edit page navigates to. */
const DestinationStub = () => <p>destination</p>;

/** Renders `/admin/users/:id/edit` for `id` through its real loader and action. */
function renderEdit(id = 'user-to-edit') {
  return renderWithAppProviders(
    [
      {
        path: '/admin/users/:id/edit',
        loader,
        action,
        Component: AdminUserEditPage,
        errorElement: <RouteErrorState />,
      },
      { path: '/admin/users/:id', Component: DestinationStub },
      { path: '/admin/users', Component: DestinationStub },
    ],
    { initialEntries: [`/admin/users/${id}/edit`], auth: 'admin', locale: 'tr' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockAdminApi.getUserDetail.mockResolvedValue(EDITED);
});

describe('AdminUserEditPage', () => {
  it('renders the Turkish edit-user title with the loaded user', async () => {
    renderEdit();

    expect(
      await screen.findByText(`${t('admin.users.editUserTitle', 'tr')} Edit User`),
    ).toBeInTheDocument();
    expect((screen.getByLabelText(t('auth.email', 'tr')) as HTMLInputElement).value).toBe(
      'edit@example.com',
    );
  });

  it('renders the not-found page when the user does not exist', async () => {
    mockAdminApi.getUserDetail.mockRejectedValue(
      new ApiError('NOT_FOUND', 'missing', undefined, 404),
    );
    renderEdit('missing');

    expect(await screen.findByText(t('error.404', 'tr'))).toBeInTheDocument();
  });

  it('submits only the changed fields through the update action', async () => {
    mockAdminApi.updateUser.mockResolvedValue({ ...EDITED, username: 'renamed' });
    renderEdit();
    const username = (await screen.findByLabelText(t('auth.username', 'tr'))) as HTMLInputElement;

    fireEvent.change(username, { target: { value: 'renamed' } });
    fireEvent.click(screen.getByRole('button', { name: t('common.saveChanges', 'tr') }));

    await waitFor(() =>
      expect(mockAdminApi.updateUser).toHaveBeenCalledWith(
        'user-to-edit',
        { username: 'renamed' },
        { signal: expect.any(AbortSignal) },
      ),
    );
    expect(await screen.findByText(t('admin.users.updateSuccess', 'tr'))).toBeInTheDocument();
  });

  it('shows the server error inline when the update fails with a conflict', async () => {
    mockAdminApi.updateUser.mockRejectedValue(
      new ApiError('CONFLICT', 'Username taken', undefined, 409),
    );
    renderEdit();
    const username = (await screen.findByLabelText(t('auth.username', 'tr'))) as HTMLInputElement;

    fireEvent.change(username, { target: { value: 'taken' } });
    fireEvent.click(screen.getByRole('button', { name: t('common.saveChanges', 'tr') }));

    expect(await screen.findByText('Username taken')).toBeInTheDocument();
    expect(screen.queryByText(t('admin.users.updateSuccess', 'tr'))).not.toBeInTheDocument();
  });

  it('reports no changes without submitting', async () => {
    renderEdit();
    await screen.findByLabelText(t('auth.username', 'tr'));

    fireEvent.click(screen.getByRole('button', { name: t('common.saveChanges', 'tr') }));

    expect(await screen.findByText(t('admin.users.noChanges', 'tr'))).toBeInTheDocument();
    expect(mockAdminApi.updateUser).not.toHaveBeenCalled();
  });

  it('redirects an admin away from editing their own account', async () => {
    mockAdminApi.getUserDetail.mockResolvedValue({ ...EDITED, id: TEST_ADMIN.id });
    const { router } = renderEdit(TEST_ADMIN.id);

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/users'));
  });
});
