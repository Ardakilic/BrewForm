import { t } from '@brewform/shared/i18n';
import type { CoffeeVarietyOutput, PaginatedResponse } from '@brewform/shared/schemas';
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
    getCoffeeVarieties: vi.fn(),
    createCoffeeVariety: vi.fn(),
    updateCoffeeVariety: vi.fn(),
    deleteCoffeeVariety: vi.fn(),
  },
}));

import { adminApi } from '../../api/index.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action, loader } from './AdminCoffeeVarietiesPage.data.ts';
import { AdminCoffeeVarietiesPage } from './AdminCoffeeVarietiesPage.tsx';

const mockApi = vi.mocked(adminApi);

const GESHA = {
  id: 'cv1',
  name: 'Gesha',
  category: 'variety',
  species: 'Arabica',
  origin: 'Ethiopia',
  isSystem: false,
} as CoffeeVarietyOutput;

/** Builds the paginated envelope `GET /admin/coffee-varieties` returns. */
function varietiesPage(
  items: CoffeeVarietyOutput[],
  page = 1,
  totalPages = 1,
): PaginatedResponse<CoffeeVarietyOutput> {
  return {
    success: true,
    data: items,
    meta: { requestId: 't', pagination: { page, perPage: 20, total: items.length, totalPages } },
  };
}

/** Renders `/admin/coffee-varieties` (at `entry`) through its real loader and action. */
function renderPage(entry = '/admin/coffee-varieties', locale: 'en' | 'tr' = 'en') {
  return renderWithAppProviders(
    [
      {
        path: '/admin/coffee-varieties',
        loader,
        action,
        Component: AdminCoffeeVarietiesPage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: ['/start', entry], auth: 'admin', locale },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockApi.getCoffeeVarieties.mockResolvedValue(varietiesPage([GESHA]));
});

describe('AdminCoffeeVarietiesPage — loader and URL state', () => {
  it('renders the Turkish heading and the rows from the loader', async () => {
    renderPage('/admin/coffee-varieties', 'tr');

    expect(await screen.findByText('Gesha')).toBeInTheDocument();
    expect(screen.getByText(t('coffeeVarieties.title', 'tr'))).toBeInTheDocument();
  });

  it('reads category, q and page from the URL (q is sent as search)', async () => {
    mockApi.getCoffeeVarieties.mockResolvedValue(varietiesPage([GESHA], 2, 3));
    renderPage('/admin/coffee-varieties?category=processing&q=washed&page=2');

    await screen.findByText('Gesha');
    expect(mockApi.getCoffeeVarieties).toHaveBeenCalledWith(
      { page: '2', perPage: '20', category: 'processing', search: 'washed' },
      { signal: expect.any(AbortSignal) },
    );
    expect(
      (
        screen.getByPlaceholderText(
          t('admin.coffeeVarieties.searchPlaceholder'),
        ) as HTMLInputElement
      ).value,
    ).toBe('washed');
  });

  it('a category change resets the page and pushes the URL', async () => {
    const { router } = renderPage('/admin/coffee-varieties?page=4');
    await screen.findByText('Gesha');

    fireEvent.change(screen.getByDisplayValue(t('admin.coffeeVarieties.allCategories')), {
      target: { value: 'processing' },
    });

    await waitFor(() => expect(router.state.location.search).toBe('?category=processing'));
  });

  it('typing commits ?q= once after the pause, replacing history', async () => {
    const { router } = renderPage();
    await screen.findByText('Gesha');
    const callsBefore = mockApi.getCoffeeVarieties.mock.calls.length;

    await userEvent.type(
      screen.getByPlaceholderText(t('admin.coffeeVarieties.searchPlaceholder')),
      'gesha',
    );

    await waitFor(() => expect(router.state.location.search).toBe('?q=gesha'), { timeout: 2000 });
    expect(router.state.historyAction).toBe('REPLACE');
    await waitFor(() => expect(mockApi.getCoffeeVarieties.mock.calls.length - callsBefore).toBe(1));
  });

  it('pages with the real total and keeps the filters', async () => {
    mockApi.getCoffeeVarieties.mockImplementation(async (params) =>
      varietiesPage([GESHA], Number(params?.page ?? 1), 3),
    );
    const { router } = renderPage('/admin/coffee-varieties?category=variety');
    await screen.findByText('Gesha');

    fireEvent.click(screen.getByRole('button', { name: t('common.next') }));

    await waitFor(() => expect(router.state.location.search).toBe('?category=variety&page=2'));
  });

  it('renders the route error state when the loader fails', async () => {
    mockApi.getCoffeeVarieties.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByText(t('error.route.loadFailed'))).toBeInTheDocument();
  });
});

describe('AdminCoffeeVarietiesPage — mutations', () => {
  it('creates a variety through the JSON action', async () => {
    mockApi.createCoffeeVariety.mockResolvedValue({ ...GESHA, id: 'cv2', name: 'Pacamara' });
    renderPage();
    await screen.findByText('Gesha');

    await userEvent.click(screen.getByRole('button', { name: t('admin.coffeeVarieties.add') }));
    await userEvent.type(screen.getByLabelText(/Name \*/), 'Pacamara');
    await userEvent.click(screen.getByRole('button', { name: t('common.save') }));

    await waitFor(() => expect(mockApi.createCoffeeVariety).toHaveBeenCalledTimes(1));
    expect(mockApi.createCoffeeVariety).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Pacamara', category: 'variety' }),
      { signal: expect.any(AbortSignal) },
    );
  });

  it('shows an error toast when saving fails', async () => {
    mockApi.createCoffeeVariety.mockRejectedValue(new Error('down'));
    renderPage();
    await screen.findByText('Gesha');

    await userEvent.click(screen.getByRole('button', { name: t('admin.coffeeVarieties.add') }));
    await userEvent.type(screen.getByLabelText(/Name \*/), 'Pacamara');
    await userEvent.click(screen.getByRole('button', { name: t('common.save') }));

    expect(await screen.findByText(t('admin.coffeeVarieties.saveError'))).toBeInTheDocument();
  });

  it('shows an error toast when delete fails', async () => {
    mockApi.deleteCoffeeVariety.mockRejectedValue(new Error('down'));
    renderPage('/admin/coffee-varieties', 'tr');
    await screen.findByText('Gesha');

    fireEvent.click(screen.getByRole('button', { name: t('common.delete', 'tr') }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t('common.delete', 'tr') }));

    expect(
      await screen.findByText(t('admin.coffeeVarieties.deleteFailed', 'tr')),
    ).toBeInTheDocument();
    expect(mockApi.deleteCoffeeVariety).toHaveBeenCalledWith('cv1', {
      signal: expect.any(AbortSignal),
    });
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
