import { t } from '@brewform/shared/i18n';
import type { EquipmentOutput, PaginatedResponse } from '@brewform/shared/schemas';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

vi.mock('../../api/static-cache.ts', () => ({
  invalidateStaticCache: vi.fn(),
}));

vi.mock('../../api/index.ts', () => ({
  adminApi: {
    getEquipment: vi.fn(),
    createEquipment: vi.fn(),
    updateEquipment: vi.fn(),
    deleteEquipment: vi.fn(),
  },
}));

import { adminApi } from '../../api/index.ts';
import { invalidateStaticCache } from '../../api/static-cache.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action, loader } from './AdminEquipmentPage.data.ts';
import { AdminEquipmentPage } from './AdminEquipmentPage.tsx';

const mockApi = vi.mocked(adminApi);
const mockInvalidateStaticCache = vi.mocked(invalidateStaticCache);

const LUNAR = {
  id: 'eq-1',
  name: 'Acaia Lunar',
  type: 'scale_accessory',
  brand: 'Acaia',
  model: null,
} as EquipmentOutput;

/** Builds the paginated envelope `GET /admin/equipment` returns. */
function equipmentPage(items: EquipmentOutput[]): PaginatedResponse<EquipmentOutput> {
  return {
    success: true,
    data: items,
    meta: {
      requestId: 't',
      pagination: { page: 1, perPage: 100, total: items.length, totalPages: 1 },
    },
  };
}

/** Renders `/admin/equipment` through its real loader and action. */
function renderPage() {
  return renderWithAppProviders(
    [
      {
        path: '/admin/equipment',
        loader,
        action,
        Component: AdminEquipmentPage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: ['/admin/equipment'], auth: 'admin', locale: 'en' },
  );
}

/** Opens the add form and fills the required fields. */
async function fillCreateForm() {
  await userEvent.click(screen.getByRole('button', { name: t('admin.equipment.add') }));
  await userEvent.type(screen.getByLabelText(/Name \*/), 'Fellow Stagg');
  await userEvent.type(screen.getByLabelText(/Type \*/), 'kettle');
}

/** Clicks Delete and confirms in the shared dialog. */
async function confirmDelete() {
  await userEvent.click(screen.getByRole('button', { name: t('common.delete') }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: t('common.delete') }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockApi.getEquipment.mockResolvedValue(equipmentPage([LUNAR]));
});

describe('AdminEquipmentPage', () => {
  it('renders the equipment table from the loader', async () => {
    renderPage();

    expect(await screen.findByText('Acaia Lunar')).toBeInTheDocument();
    expect(mockApi.getEquipment).toHaveBeenCalledWith(
      { perPage: '100' },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('create flow: action creates, invalidates the static cache once, and the list revalidates', async () => {
    const created = {
      ...LUNAR,
      id: 'eq-2',
      name: 'Fellow Stagg',
      type: 'kettle',
    } as EquipmentOutput;
    mockApi.createEquipment.mockResolvedValue(created);
    renderPage();
    await screen.findByText('Acaia Lunar');

    await fillCreateForm();
    mockApi.getEquipment.mockResolvedValue(equipmentPage([LUNAR, created]));
    await userEvent.click(screen.getByRole('button', { name: t('common.save') }));

    expect(await screen.findByText('Fellow Stagg')).toBeInTheDocument();
    expect(mockApi.createEquipment).toHaveBeenCalledTimes(1);
    expect(mockInvalidateStaticCache).toHaveBeenCalledTimes(1);
  });

  it('edit flow: action updates and invalidates the static cache once', async () => {
    mockApi.updateEquipment.mockResolvedValue({ ...LUNAR, name: 'Acaia Lunar Pro' });
    renderPage();
    await screen.findByText('Acaia Lunar');

    await userEvent.click(screen.getByRole('button', { name: t('common.edit') }));
    const name = screen.getByLabelText(/Name \*/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Acaia Lunar Pro');
    await userEvent.click(screen.getByRole('button', { name: t('common.save') }));

    await waitFor(() => expect(mockApi.updateEquipment).toHaveBeenCalledTimes(1));
    expect(mockApi.updateEquipment).toHaveBeenCalledWith(
      'eq-1',
      { name: 'Acaia Lunar Pro', type: 'scale_accessory', brand: 'Acaia', model: undefined },
      { signal: expect.any(AbortSignal) },
    );
    expect(mockInvalidateStaticCache).toHaveBeenCalledTimes(1);
  });

  it('delete flow: confirm, action deletes and invalidates the static cache once', async () => {
    mockApi.deleteEquipment.mockResolvedValue({ message: 'ok' });
    renderPage();
    await screen.findByText('Acaia Lunar');

    await confirmDelete();

    await waitFor(() => expect(mockApi.deleteEquipment).toHaveBeenCalledTimes(1));
    expect(mockInvalidateStaticCache).toHaveBeenCalledTimes(1);
  });

  it('a failed create toasts and does NOT invalidate the static cache', async () => {
    mockApi.createEquipment.mockRejectedValue(new Error('Network error'));
    renderPage();
    await screen.findByText('Acaia Lunar');

    await fillCreateForm();
    await userEvent.click(screen.getByRole('button', { name: t('common.save') }));

    expect(await screen.findByText(t('admin.equipment.saveError'))).toBeInTheDocument();
    expect(mockInvalidateStaticCache).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('a failed delete toasts and does NOT invalidate the static cache', async () => {
    mockApi.deleteEquipment.mockRejectedValue(new Error('Network error'));
    renderPage();
    await screen.findByText('Acaia Lunar');

    await confirmDelete();

    expect(await screen.findByText(t('admin.equipment.deleteFailed'))).toBeInTheDocument();
    expect(mockInvalidateStaticCache).not.toHaveBeenCalled();
  });

  it('renders the route error state when the loader fails', async () => {
    mockApi.getEquipment.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByText(t('error.route.loadFailed'))).toBeInTheDocument();
  });
});
