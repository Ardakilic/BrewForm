import { t } from '@brewform/shared/i18n';
import type { EquipmentOutput } from '@brewform/shared/schemas';
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
  getEquipmentCached: vi.fn(),
  getTasteNotesCached: vi.fn(),
  invalidateStaticCache: vi.fn(),
}));

vi.mock('../../api/index.ts', () => ({
  equipmentApi: { create: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: () => null,
}));

import { ApiError } from '../../api/errors.ts';
import { equipmentApi } from '../../api/index.ts';
import { getEquipmentCached, invalidateStaticCache } from '../../api/static-cache.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action, loader } from './EquipmentListPage.data.ts';
import { EquipmentListPage } from './EquipmentListPage.tsx';

const mockApi = vi.mocked(equipmentApi);
const mockGetEquipmentCached = vi.mocked(getEquipmentCached);
const mockInvalidateStaticCache = vi.mocked(invalidateStaticCache);

const LUNAR = {
  id: 'eq-1',
  name: 'Acaia Lunar',
  type: 'scale_accessory',
  brand: 'Acaia',
  model: null,
  createdAt: '2025-01-01',
} as unknown as EquipmentOutput;

const STAGG = {
  id: 'eq-2',
  name: 'Fellow Stagg',
  type: 'kettle',
  brand: 'Fellow',
  model: null,
  createdAt: '2025-01-02',
} as unknown as EquipmentOutput;

/** Renders `/equipment` through its real loader and action. */
function renderPage() {
  return renderWithAppProviders(
    [
      {
        path: '/equipment',
        loader,
        action,
        Component: EquipmentListPage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: ['/equipment'], auth: 'user', locale: 'en' },
  );
}

/** Opens the create form, fills name and type, and submits it. */
async function submitCreateForm() {
  await userEvent.click(screen.getByRole('button', { name: t('equipment.addEquipment') }));
  await userEvent.type(screen.getByLabelText(`${t('equipment.name')} *`), 'Fellow Stagg');
  await userEvent.type(screen.getByLabelText(`${t('equipment.type')} *`), 'kettle');
  await userEvent.click(screen.getByRole('button', { name: t('equipment.addEquipmentTitle') }));
}

/** Clicks the first card's Delete button and confirms in the dialog. */
async function deleteFirstItem() {
  await userEvent.click(screen.getByRole('button', { name: t('common.delete') }));
  // The shared ConfirmProvider (from AppProviders) asks first; confirm inside the dialog.
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: t('common.delete') }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockGetEquipmentCached.mockResolvedValue([LUNAR]);
});

describe('/equipment loader and action', () => {
  it('reads the equipment through the static cache with request.signal', async () => {
    const request = new Request('http://localhost/equipment');
    await expect(loader({ request, params: {}, context: undefined } as never)).resolves.toEqual({
      equipment: [LUNAR],
    });
    expect(mockGetEquipmentCached).toHaveBeenCalledWith({ signal: request.signal });
  });

  it('redirects a final 401 to the login page with a return path', async () => {
    mockGetEquipmentCached.mockRejectedValue(new ApiError('UNAUTHORIZED', 'no', undefined, 401));
    const request = new Request('http://localhost/equipment');
    const thrown = await loader({ request, params: {}, context: undefined } as never).catch(
      (e: unknown) => e,
    );
    expect((thrown as Response).headers.get('Location')).toBe('/login?next=%2Fequipment');
  });

  it('delete forwards request.signal and invalidates the cache only on success', async () => {
    mockApi.delete.mockResolvedValue({ message: 'ok' });
    const form = new FormData();
    form.set('intent', 'delete');
    form.set('id', 'eq-1');
    const request = new Request('http://localhost/equipment', { method: 'POST', body: form });

    await expect(action({ request, params: {}, context: undefined } as never)).resolves.toEqual({
      ok: true,
      intent: 'delete',
    });
    expect(mockApi.delete).toHaveBeenCalledWith('eq-1', { signal: request.signal });
    expect(mockInvalidateStaticCache).toHaveBeenCalledTimes(1);
  });
});

describe('EquipmentListPage', () => {
  it('renders the equipment list from the loader', async () => {
    renderPage();
    expect(await screen.findByText('Acaia Lunar')).toBeInTheDocument();
  });

  it('renders the empty state when there is no equipment', async () => {
    mockGetEquipmentCached.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(t('equipment.noEquipment'))).toBeInTheDocument();
  });

  it('renders the route error state when the load fails', async () => {
    mockGetEquipmentCached.mockRejectedValue(new Error('down'));
    renderPage();
    expect(await screen.findByText(t('error.route.loadFailed'))).toBeInTheDocument();
  });

  it('creates through the action, invalidates the cache and shows the revalidated list', async () => {
    mockApi.create.mockResolvedValue(STAGG);
    renderPage();
    await screen.findByText('Acaia Lunar');

    mockGetEquipmentCached.mockResolvedValue([LUNAR, STAGG]);
    await submitCreateForm();

    expect(await screen.findByText('Fellow Stagg')).toBeInTheDocument();
    expect(mockApi.create).toHaveBeenCalledWith(
      { name: 'Fellow Stagg', type: 'kettle', brand: undefined, model: undefined },
      { signal: expect.any(AbortSignal) },
    );
    expect(mockInvalidateStaticCache).toHaveBeenCalledTimes(1);
  });

  it('shows an error toast, keeps the form and does NOT invalidate the cache when create fails', async () => {
    mockApi.create.mockRejectedValue(new Error('Network error'));
    renderPage();
    await screen.findByText('Acaia Lunar');

    await submitCreateForm();

    expect(await screen.findByText(t('equipment.error.createFailed'))).toBeInTheDocument();
    expect(screen.getByLabelText(`${t('equipment.name')} *`)).toHaveValue('Fellow Stagg');
    expect(mockInvalidateStaticCache).not.toHaveBeenCalled();
  });

  it('deletes through the action and invalidates the cache', async () => {
    mockApi.delete.mockResolvedValue({ message: 'ok' });
    renderPage();
    await screen.findByText('Acaia Lunar');

    mockGetEquipmentCached.mockResolvedValue([]);
    await deleteFirstItem();

    expect(await screen.findByText(t('equipment.noEquipment'))).toBeInTheDocument();
    expect(mockApi.delete).toHaveBeenCalledTimes(1);
    expect(mockInvalidateStaticCache).toHaveBeenCalledTimes(1);
  });

  it('shows an error toast and does NOT invalidate the cache when delete fails', async () => {
    mockApi.delete.mockRejectedValue(new Error('Network error'));
    renderPage();
    await screen.findByText('Acaia Lunar');

    await deleteFirstItem();

    expect(await screen.findByText(t('equipment.error.deleteFailed'))).toBeInTheDocument();
    await waitFor(() => expect(mockApi.delete).toHaveBeenCalledTimes(1));
    expect(mockInvalidateStaticCache).not.toHaveBeenCalled();
    expect(screen.getByText('Acaia Lunar')).toBeInTheDocument();
  });

  it('logs mount and unmount', async () => {
    const { unmount } = renderPage();
    await screen.findByText('Acaia Lunar');
    // The mount effect runs after the commit that renders the loader data.
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'EquipmentListPage mounted'),
    );
    unmount();
    expect(mockLogger.debug).toHaveBeenCalledWith({}, 'EquipmentListPage unmounted');
  });
});
