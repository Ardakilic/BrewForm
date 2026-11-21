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

vi.mock('../../api/index.ts', () => ({
  adminApi: { createUser: vi.fn() },
}));

import { ApiError } from '../../api/errors.ts';
import { adminApi } from '../../api/index.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action } from './AdminUserCreatePage.data.ts';
import { AdminUserCreatePage } from './AdminUserCreatePage.tsx';

const mockCreateUser = vi.mocked(adminApi.createUser);

/** The user list the create action redirects to. */
const UsersListStub = () => <p>users list</p>;

/** Renders `/admin/users/new` with its real create action. */
function renderCreate() {
  return renderWithAppProviders(
    [
      {
        path: '/admin/users/new',
        action,
        Component: AdminUserCreatePage,
        errorElement: <RouteErrorState />,
      },
      { path: '/admin/users', Component: UsersListStub },
    ],
    { initialEntries: ['/admin/users/new'], auth: 'admin', locale: 'tr' },
  );
}

/** Fills the required fields with valid values. */
function fillRequired() {
  fireEvent.change(screen.getByLabelText(new RegExp(t('auth.email', 'tr'))), {
    target: { value: 'new@example.com' },
  });
  fireEvent.change(screen.getByLabelText(new RegExp(t('auth.username', 'tr'))), {
    target: { value: 'newuser' },
  });
  fireEvent.change(screen.getByLabelText(new RegExp(t('auth.password', 'tr'))), {
    target: { value: 'Passw0rd!Passw0rd' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('AdminUserCreatePage', () => {
  it('renders the Turkish create-user heading', async () => {
    renderCreate();

    expect(
      await screen.findByRole('heading', { name: t('admin.users.createUser', 'tr') }),
    ).toBeInTheDocument();
  });

  it('creates the user through the action and redirects to the list', async () => {
    mockCreateUser.mockResolvedValue({} as never);
    const { router } = renderCreate();
    await screen.findByRole('heading', { name: t('admin.users.createUser', 'tr') });

    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: t('admin.users.createUser', 'tr') }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/users'));
    expect(mockCreateUser).toHaveBeenCalledWith(
      { email: 'new@example.com', username: 'newuser', password: 'Passw0rd!Passw0rd' },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('shows the server error inline and stays on the form when creation fails', async () => {
    mockCreateUser.mockRejectedValue(new ApiError('CONFLICT', 'Email taken', undefined, 409));
    const { router } = renderCreate();
    await screen.findByRole('heading', { name: t('admin.users.createUser', 'tr') });

    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: t('admin.users.createUser', 'tr') }));

    expect(await screen.findByText('Email taken')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/users/new');
  });
});
