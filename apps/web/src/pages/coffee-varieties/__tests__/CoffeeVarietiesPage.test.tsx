import { t } from '@brewform/shared/i18n';
import type { CoffeeVarietyOutput, PaginatedResponse } from '@brewform/shared/schemas';
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

vi.mock('../../../api/index.ts', () => ({
  coffeeVarietyApi: { list: vi.fn() },
}));

import { coffeeVarietyApi } from '../../../api/index.ts';
import { RouteErrorState } from '../../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../../test-utils/render.tsx';
import { loader } from '../CoffeeVarietiesPage.data.ts';
import { CoffeeVarietiesPage } from '../CoffeeVarietiesPage.tsx';

const mockList = vi.mocked(coffeeVarietyApi.list);

/** Builds a coffee-variety fixture. */
function makeVariety(overrides: Partial<CoffeeVarietyOutput> = {}): CoffeeVarietyOutput {
  return {
    id: 'var-1',
    name: 'Bourbon',
    species: 'Arabica',
    category: 'variety',
    origin: 'Réunion',
    cupProfile: 'Sweet, balanced',
    ...overrides,
  } as CoffeeVarietyOutput;
}

/** Builds the paginated envelope `GET /coffee-varieties` returns. */
function page(
  items: CoffeeVarietyOutput[],
  total = items.length,
): PaginatedResponse<CoffeeVarietyOutput> {
  return {
    success: true,
    data: items,
    meta: {
      requestId: 't',
      pagination: { page: 1, perPage: 12, total, totalPages: Math.ceil(total / 12) },
    },
  };
}

/** Renders `/coffee-varieties` (with `search`) through its real loader. */
function renderPage(search = '', locale: 'en' | 'tr' = 'en') {
  return renderWithAppProviders(
    [
      {
        path: '/coffee-varieties',
        loader,
        Component: CoffeeVarietiesPage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: [`/coffee-varieties${search}`], locale },
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
  mockList.mockResolvedValue(page([]));
});

describe('/coffee-varieties loader', () => {
  it('maps the URL state to catalogue params and forwards request.signal', async () => {
    mockList.mockResolvedValue(page([makeVariety()], 25));
    const { request, result } = runLoader('/coffee-varieties?page=3&category=processing&q=wash');

    await expect(result).resolves.toEqual({ varieties: [makeVariety()], totalPages: 3 });
    expect(mockList).toHaveBeenCalledWith(
      { page: '3', perPage: '12', category: 'processing', search: 'wash' },
      { signal: request.signal },
    );
  });

  it('reads a legacy search link and drops an unknown category', async () => {
    await runLoader('/coffee-varieties?search=Gesha&category=bogus').result;
    expect(mockList).toHaveBeenCalledWith(
      { page: '1', perPage: '12', search: 'Gesha' },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('logs and rethrows a failure', async () => {
    const err = new Error('down');
    mockList.mockRejectedValue(err);
    await expect(runLoader('/coffee-varieties').result).rejects.toBe(err);
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err, page: 1, category: '' },
      'CoffeeVarietiesPage loadData failed',
    );
  });
});

describe('CoffeeVarietiesPage', () => {
  it('logs mount and unmount', async () => {
    const { unmount } = renderPage();
    await screen.findByRole('heading', { name: t('coffeeVarieties.title') });
    // The mount effect runs after the commit that renders the loader data.
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'CoffeeVarietiesPage mounted'),
    );
    unmount();
    expect(mockLogger.debug).toHaveBeenCalledWith({}, 'CoffeeVarietiesPage unmounted');
  });

  it('renders the title, subtitle, tabs and SEO title in English', async () => {
    renderPage();
    expect(
      await screen.findByRole('heading', { name: t('coffeeVarieties.title') }),
    ).toBeInTheDocument();
    expect(screen.getByText(t('coffeeVarieties.subtitle'))).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('coffeeVarieties.category.processing') }),
    ).toBeInTheDocument();
    expect(document.title).toBe(`${t('coffeeVarieties.title')} | BrewForm`);
  });

  it('renders the title, tabs and placeholder in Turkish', async () => {
    renderPage('', 'tr');
    expect(
      await screen.findByRole('heading', { name: t('coffeeVarieties.title', 'tr') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('coffeeVarieties.category.market_name', 'tr') }),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(t('coffeeVarieties.searchPlaceholder', 'tr')),
    ).toBeInTheDocument();
  });

  it('renders variety cards with category badges, linked to the detail page', async () => {
    mockList.mockResolvedValue(
      page([
        makeVariety(),
        makeVariety({ id: 'var-2', name: 'Washed', category: 'processing', species: null }),
        makeVariety({ id: 'var-3', name: 'Yirgacheffe', category: 'market_name' }),
      ]),
    );
    renderPage();
    expect(await screen.findByText('Bourbon')).toBeInTheDocument();
    expect(screen.getByText(t('coffeeVarieties.category.varietyShort'))).toBeInTheDocument();
    expect(screen.getByText(t('coffeeVarieties.category.processingShort'))).toBeInTheDocument();
    expect(screen.getByText(t('coffeeVarieties.category.marketNameShort'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bourbon/ })).toHaveAttribute(
      'href',
      '/coffee-varieties/var-1',
    );
  });

  it('shows the empty state, with a clear-search action when filters are active', async () => {
    renderPage('?q=zzz');
    expect(await screen.findByText(t('coffeeVarieties.empty'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('common.clearSearch') })).toBeInTheDocument();
  });

  it('renders the route error state (not the empty state) when the load fails', async () => {
    mockList.mockRejectedValue(new Error('Network error'));
    renderPage();
    expect(await screen.findByText(t('error.route.loadFailed'))).toBeInTheDocument();
    expect(screen.queryByText(t('coffeeVarieties.empty'))).not.toBeInTheDocument();
  });

  it('retrying a failed load re-runs the loader', async () => {
    mockList.mockRejectedValueOnce(new Error('Network error'));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: t('common.retry') }));
    expect(
      await screen.findByRole('heading', { name: t('coffeeVarieties.title') }),
    ).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('a category tab pushes the category param and drops the page', async () => {
    const { router } = renderPage('?page=2');
    await screen.findByRole('heading', { name: t('coffeeVarieties.title') });

    await userEvent.click(
      screen.getByRole('button', { name: t('coffeeVarieties.category.variety') }),
    );

    await waitFor(() => expect(router.state.location.search).toBe('?category=variety'));
  });

  it('paginates: Previous from page 3 goes to page 2, keeping filters', async () => {
    mockList.mockResolvedValue(page([makeVariety()], 36));
    const { router } = renderPage('?category=variety&page=3');
    await screen.findByText('Bourbon');

    await userEvent.click(screen.getByRole('button', { name: t('common.previous') }));

    await waitFor(() => expect(router.state.location.search).toBe('?category=variety&page=2'));
  });

  it('commits typed search text once, replacing history and dropping legacy search and page', async () => {
    const { router } = renderPage('?search=old&page=3');
    const input = await screen.findByPlaceholderText(t('coffeeVarieties.searchPlaceholder'));
    expect((input as HTMLInputElement).value).toBe('old');

    fireEvent.change(input, { target: { value: 'g' } });
    fireEvent.change(input, { target: { value: 'Gesha' } });

    await waitFor(() => expect(router.state.location.search).toBe('?q=Gesha'), {
      timeout: 2000,
    });
    expect(router.state.historyAction).toBe('REPLACE');
  });
});
