import { t } from '@brewform/shared/i18n';
import type { EquipmentOutput, PaginatedResponse } from '@brewform/shared/schemas';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
  equipmentApi: { catalog: vi.fn() },
}));

import { equipmentApi } from '../../api/index.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { loader } from './EquipmentCatalogPage.data.ts';
import { EquipmentCatalogPage } from './EquipmentCatalogPage.tsx';

const mockCatalog = vi.mocked(equipmentApi.catalog);

/** Builds an equipment fixture. */
function makeEquipment(overrides: Partial<EquipmentOutput> = {}): EquipmentOutput {
  return {
    id: 'eq-1',
    name: 'Fellow Stagg',
    brand: 'Fellow',
    model: 'Stagg EKG',
    type: 'kettle',
    description: 'Electric pour-over kettle',
    ...overrides,
  } as EquipmentOutput;
}

/** Builds the paginated envelope `GET /equipment` returns. */
function page(items: EquipmentOutput[], total = items.length): PaginatedResponse<EquipmentOutput> {
  return {
    success: true,
    data: items,
    meta: {
      requestId: 't',
      pagination: { page: 1, perPage: 12, total, totalPages: Math.ceil(total / 12) },
    },
  };
}

/** Renders `/equipments` (with `search`) through its real loader. */
function renderPage(search = '', locale: 'en' | 'tr' = 'en') {
  return renderWithAppProviders(
    [
      {
        path: '/equipments',
        loader,
        Component: EquipmentCatalogPage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: [`/equipments${search}`], locale },
  );
}

/** Runs the loader for `url` with a fresh request. */
function runLoader(url: string) {
  const request = new Request(`http://localhost${url}`);
  return { request, result: loader({ request, params: {}, context: undefined } as never) };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockCatalog.mockResolvedValue(page([]));
});

describe('/equipments loader', () => {
  it('maps the URL state to catalogue params and forwards request.signal', async () => {
    mockCatalog.mockResolvedValue(page([makeEquipment()], 25));
    const { request, result } = runLoader('/equipments?page=2&type=kettle&q=Stagg');

    await expect(result).resolves.toEqual({ equipment: [makeEquipment()], totalPages: 3 });
    expect(mockCatalog).toHaveBeenCalledWith(
      { page: '2', perPage: '12', type: 'kettle', search: 'Stagg' },
      { signal: request.signal },
    );
  });

  it('reads a legacy search link, clamps bad pages and omits empty filters', async () => {
    runLoader('/equipments?page=-5&search=Fellow');
    await waitFor(() => expect(mockCatalog).toHaveBeenCalled());
    expect(mockCatalog).toHaveBeenCalledWith(
      { page: '1', perPage: '12', search: 'Fellow' },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('reports at least one page for an empty catalogue', async () => {
    await expect(runLoader('/equipments').result).resolves.toEqual({
      equipment: [],
      totalPages: 1,
    });
  });

  it('logs and rethrows a failure', async () => {
    const err = new Error('down');
    mockCatalog.mockRejectedValue(err);
    await expect(runLoader('/equipments').result).rejects.toBe(err);
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err, page: 1, type: '' },
      'EquipmentCatalogPage loadData failed',
    );
  });
});

describe('EquipmentCatalogPage', () => {
  it('logs mount and unmount', async () => {
    const { unmount } = renderPage();
    await screen.findByRole('heading', { name: t('equipment.catalog.title') });
    // The mount effect runs after the commit that renders the loader data.
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'EquipmentCatalogPage mounted'),
    );
    unmount();
    expect(mockLogger.debug).toHaveBeenCalledWith({}, 'EquipmentCatalogPage unmounted');
  });

  it('renders the title, subtitle and SEO title in English', async () => {
    renderPage();
    expect(
      await screen.findByRole('heading', { name: t('equipment.catalog.title') }),
    ).toBeInTheDocument();
    expect(screen.getByText(t('equipment.catalog.subtitle'))).toBeInTheDocument();
    expect(document.title).toBe(`${t('equipment.catalog.title')} | BrewForm`);
  });

  it('renders the title, tabs and placeholder in Turkish', async () => {
    renderPage('', 'tr');
    expect(
      await screen.findByRole('heading', { name: t('equipment.catalog.title', 'tr') }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('common.all', 'tr') })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('equipment.category.grinder', 'tr') }),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(t('equipment.catalog.searchPlaceholder', 'tr')),
    ).toBeInTheDocument();
  });

  it('renders the equipment cards from the loader', async () => {
    mockCatalog.mockResolvedValue(
      page([
        makeEquipment(),
        makeEquipment({ id: 'eq-2', name: 'Acaia', brand: 'Acaia', model: 'Lunar' }),
      ]),
    );
    renderPage();
    expect(await screen.findByText('Stagg EKG')).toBeInTheDocument();
    expect(screen.getByText('Lunar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Stagg EKG/ })).toHaveAttribute(
      'href',
      '/equipment/eq-1',
    );
  });

  it('shows the empty state when the catalogue page is empty', async () => {
    renderPage();
    expect(await screen.findByText(t('equipment.catalog.empty'))).toBeInTheDocument();
  });

  it('renders the route error state (not the empty state) when the load fails', async () => {
    mockCatalog.mockRejectedValue(new Error('Network error'));
    renderPage();
    expect(await screen.findByText(t('error.route.loadFailed'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('common.retry') })).toBeInTheDocument();
    expect(screen.queryByText(t('equipment.catalog.empty'))).not.toBeInTheDocument();
  });

  it('shows active filters and clears them', async () => {
    const { router } = renderPage('?type=kettle');
    expect(await screen.findByText(t('common.activeFilters'))).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: t('common.clearAll') })[0]);
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('a category tab pushes the type param and reloads through the loader', async () => {
    const { router } = renderPage('?page=2');
    await screen.findByRole('heading', { name: t('equipment.catalog.title') });

    await userEvent.click(screen.getByRole('button', { name: t('equipment.category.grinder') }));

    await waitFor(() => expect(router.state.location.search).toBe('?type=grinder'));
    await waitFor(() =>
      expect(mockCatalog).toHaveBeenLastCalledWith(
        { page: '1', perPage: '12', type: 'grinder' },
        { signal: expect.any(AbortSignal) },
      ),
    );
  });

  it('shows pagination and Next keeps the filters', async () => {
    mockCatalog.mockResolvedValue(page([makeEquipment()], 25));
    const { router } = renderPage('?type=kettle');
    expect(await screen.findByText(/Page 1 of 3/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: t('common.next') }));

    await waitFor(() => expect(router.state.location.search).toBe('?type=kettle&page=2'));
  });

  it('reads q into the search box and commits typing once, replacing history', async () => {
    const { router } = renderPage('?search=old&page=3');
    const input = await screen.findByPlaceholderText(t('equipment.catalog.searchPlaceholder'));
    expect((input as HTMLInputElement).value).toBe('old');

    fireEvent.change(input, { target: { value: 'o' } });
    fireEvent.change(input, { target: { value: 'Stagg' } });

    await waitFor(() => expect(router.state.location.search).toBe('?q=Stagg'), {
      timeout: 2000,
    });
    expect(router.state.historyAction).toBe('REPLACE');
  });
});
