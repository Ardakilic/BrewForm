import { t } from '@brewform/shared/i18n';
import type { PaginatedResponse, VendorOutput } from '@brewform/shared/schemas';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

vi.mock('../../api/index.ts', () => ({
  adminApi: {
    getVendors: vi.fn(),
    createVendor: vi.fn(),
    updateVendor: vi.fn(),
    deleteVendor: vi.fn(),
  },
}));

import { adminApi } from '../../api/index.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action, loader } from './AdminVendorsPage.data.ts';
import { AdminVendorsPage } from './AdminVendorsPage.tsx';

const mockApi = vi.mocked(adminApi);

const ONYX = { id: 'v1', name: 'Onyx', website: null, description: null } as VendorOutput;

/** Builds the paginated envelope `GET /admin/vendors` returns. */
function vendorsPage(vendors: VendorOutput[]): PaginatedResponse<VendorOutput> {
  return {
    success: true,
    data: vendors,
    meta: {
      requestId: 't',
      pagination: { page: 1, perPage: 100, total: vendors.length, totalPages: 1 },
    },
  };
}

/** Renders `/admin/vendors` through its real loader and action. */
function renderPage(locale: 'en' | 'tr' = 'en') {
  return renderWithAppProviders(
    [
      {
        path: '/admin/vendors',
        loader,
        action,
        Component: AdminVendorsPage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: ['/admin/vendors'], auth: 'admin', locale },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockApi.getVendors.mockResolvedValue(vendorsPage([ONYX]));
});

describe('AdminVendorsPage', () => {
  it('renders the Turkish heading and the vendors from the loader', async () => {
    renderPage('tr');

    expect(await screen.findByText('Onyx')).toBeInTheDocument();
    expect(screen.getByText(t('admin.vendors.management', 'tr'))).toBeInTheDocument();
  });

  it('creates a vendor through the action and closes the form', async () => {
    mockApi.createVendor.mockResolvedValue({ ...ONYX, id: 'v2', name: 'Square Mile' });
    renderPage();
    await screen.findByText('Onyx');

    await userEvent.click(screen.getByRole('button', { name: t('admin.vendors.add') }));
    await userEvent.type(screen.getByLabelText(t('common.name')), 'Square Mile');
    mockApi.getVendors.mockResolvedValue(
      vendorsPage([ONYX, { ...ONYX, id: 'v2', name: 'Square Mile' }]),
    );
    await userEvent.click(screen.getByRole('button', { name: t('common.save') }));

    expect(await screen.findByText('Square Mile')).toBeInTheDocument();
    expect(mockApi.createVendor).toHaveBeenCalledWith(
      { name: 'Square Mile', website: undefined, description: undefined },
      { signal: expect.any(AbortSignal) },
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: t('common.save') })).not.toBeInTheDocument(),
    );
  });

  it('updates a vendor through the action', async () => {
    mockApi.updateVendor.mockResolvedValue({ ...ONYX, name: 'Onyx Coffee Lab' });
    renderPage();
    await screen.findByText('Onyx');

    await userEvent.click(screen.getByRole('button', { name: t('common.edit') }));
    const name = screen.getByLabelText(t('common.name'));
    await userEvent.clear(name);
    await userEvent.type(name, 'Onyx Coffee Lab');
    await userEvent.click(screen.getByRole('button', { name: t('common.save') }));

    await waitFor(() =>
      expect(mockApi.updateVendor).toHaveBeenCalledWith(
        'v1',
        { name: 'Onyx Coffee Lab', website: undefined, description: undefined },
        { signal: expect.any(AbortSignal) },
      ),
    );
  });

  it('shows an error toast and keeps the form when saving fails', async () => {
    mockApi.createVendor.mockRejectedValue(new Error('down'));
    renderPage();
    await screen.findByText('Onyx');

    await userEvent.click(screen.getByRole('button', { name: t('admin.vendors.add') }));
    await userEvent.type(screen.getByLabelText(t('common.name')), 'Square Mile');
    await userEvent.click(screen.getByRole('button', { name: t('common.save') }));

    expect(await screen.findByText(t('admin.vendors.saveError'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('common.save') })).toBeInTheDocument();
  });

  it('shows an error toast when delete fails', async () => {
    mockApi.deleteVendor.mockRejectedValue(new Error('Network error'));
    renderPage('tr');
    await screen.findByText('Onyx');

    fireEvent.click(screen.getByRole('button', { name: t('common.delete', 'tr') }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t('common.delete', 'tr') }));

    expect(await screen.findByText(t('admin.vendors.deleteFailed', 'tr'))).toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('renders the route error state when the loader fails', async () => {
    mockApi.getVendors.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByText(t('error.route.loadFailed'))).toBeInTheDocument();
  });
});
