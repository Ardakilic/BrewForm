import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EquipmentCatalogPage } from './EquipmentCatalogPage.tsx';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

// ── External deps ──────────────────────────────────────────────────────────

vi.mock('react-router', () => ({
  Link: (
    { to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown },
  ) => <a href={to} {...props}>{children}</a>,
  useSearchParams: vi.fn(),
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../api/client.ts', () => ({
  api: { getWithMeta: vi.fn() },
}));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: vi.fn(() => null),
}));

vi.mock('../../hooks/useDebounce.ts', () => ({
  useDebounce: (value: string) => value,
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { useSearchParams } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { api } from '../../api/client.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';

const mockUseSearchParams = vi.mocked(useSearchParams);
const mockUseTranslation = vi.mocked(useTranslation);
const mockApiGetWithMeta = vi.mocked(api.getWithMeta);
const mockSEOHead = vi.mocked(SEOHead);

// ── Translation helpers ────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
    'common.all': 'All',
    'common.clearAll': 'Clear all',
    'common.retry': 'Retry',
    'common.clearSearch': 'Clear search',
    'common.activeFilters': 'Active filters:',
    'common.pagination': 'Page {page} of {total}',
    'common.previous': 'Previous',
    'common.next': 'Next',
    'equipment.catalog.title': 'Coffee Equipment',
    'equipment.catalog.subtitle': 'Browse machines, grinders, and tools',
    'equipment.catalog.searchPlaceholder': 'Search by brand, model, or name...',
    'equipment.catalog.error.load': 'Failed to load equipment',
    'equipment.catalog.empty': 'No equipment found',
    'equipment.category.espresso_machine': 'Espresso Machines',
    'equipment.category.grinder': 'Grinders',
    'equipment.category.pour_over_brewer': 'Pour-Over Brewers',
    'equipment.category.immersion_brewer': 'Immersion Brewers',
    'equipment.category.kettle': 'Kettles',
    'equipment.category.milk_tool': 'Milk Tools',
    'equipment.category.scale_accessory': 'Scales & Accessories',
    'equipment.category.roaster': 'Roasters',
  };
  return map[key] ?? key;
};

const trT = (key: string) => {
  const map: Record<string, string> = {
    'common.all': 'Tümü',
    'common.clearAll': 'Tümünü temizle',
    'common.retry': 'Tekrar dene',
    'common.clearSearch': 'Aramayı temizle',
    'common.activeFilters': 'Aktif filtreler:',
    'common.pagination': 'Sayfa {page} / {total}',
    'common.previous': 'Önceki',
    'common.next': 'İleri',
    'equipment.catalog.title': 'Kahve Ekipmanları',
    'equipment.catalog.subtitle': 'Makineleri, öğütücüleri ve araçları keşfedin',
    'equipment.catalog.searchPlaceholder': 'Marka, model veya isme göre ara...',
    'equipment.catalog.error.load': 'Ekipmanlar yüklenemedi',
    'equipment.catalog.empty': 'Ekipman bulunamadı',
    'equipment.category.espresso_machine': 'Espresso Makineleri',
    'equipment.category.grinder': 'Öğütücüler',
    'equipment.category.pour_over_brewer': 'Pour-Over Demleyiciler',
    'equipment.category.immersion_brewer': 'Daldırma Demleyiciler',
    'equipment.category.kettle': 'Su Isıtıcıları',
    'equipment.category.milk_tool': 'Süt Araçları',
    'equipment.category.scale_accessory': 'Teraziler ve Aksesuarlar',
    'equipment.category.roaster': 'Kavurucular',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

function makeSearchParams(init: Record<string, string> = {}) {
  const params = new URLSearchParams(init);
  return [params, vi.fn()] as ReturnType<typeof useSearchParams>;
}

function makePaginatedResponse(items: unknown[], total: number) {
  return {
    data: items,
    meta: {
      pagination: {
        page: 1,
        perPage: 12,
        total,
        totalPages: Math.ceil(total / 12),
      },
    },
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockLogger.debug.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockUseSearchParams.mockReturnValue(makeSearchParams());
  mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
});

// ── Tests ──────────────────────────────────────────────────────────────────

/** Tests for EquipmentCatalogPage — rendering, category filters, search, pagination, SEO, and i18n. */
describe('EquipmentCatalogPage', () => {
  it('logs mount and unmount', async () => {
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    const { unmount } = render(<EquipmentCatalogPage />);
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'EquipmentCatalogPage mounted')
    );
    unmount();
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'EquipmentCatalogPage unmounted')
    );
  });

  it('renders page title and subtitle — English', async () => {
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByRole('heading', { name: 'Coffee Equipment' })).toBeInTheDocument();
    expect(screen.getByText('Browse machines, grinders, and tools')).toBeInTheDocument();
  });

  it('renders page title and subtitle — Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByRole('heading', { name: 'Kahve Ekipmanları' })).toBeInTheDocument();
    expect(screen.getByText('Makineleri, öğütücüleri ve araçları keşfedin')).toBeInTheDocument();
  });

  it('renders equipment items from API', async () => {
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([
      {
        id: 'eq-1',
        name: 'Fellow Stagg',
        brand: 'Fellow',
        model: 'Stagg EKG',
        type: 'kettle',
        description: 'Electric pour-over kettle',
      },
      {
        id: 'eq-2',
        name: 'Acaia Lunar',
        brand: 'Acaia',
        model: 'Lunar',
        type: 'scale_accessory',
        description: 'Precision scale',
      },
    ], 2));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText('Fellow')).toBeInTheDocument();
    expect(screen.getByText('Stagg EKG')).toBeInTheDocument();
    expect(screen.getByText('Lunar')).toBeInTheDocument();
  });

  it('shows loading skeleton while fetching', () => {
    mockApiGetWithMeta.mockReturnValue(new Promise(() => {}));
    render(<EquipmentCatalogPage />);

    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows empty state when no results', async () => {
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText('No equipment found')).toBeInTheDocument();
  });

  it('shows empty state in Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText('Ekipman bulunamadı')).toBeInTheDocument();
  });

  it('shows error state with retry button', async () => {
    mockApiGetWithMeta.mockRejectedValue(new Error('Network error'));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText('Failed to load equipment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'EquipmentCatalogPage loadData failed',
    );
  });

  it('shows error state with retry in Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockApiGetWithMeta.mockRejectedValue(new Error('Network error'));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText('Ekipmanlar yüklenemedi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'EquipmentCatalogPage loadData failed',
    );
  });

  it('renders category filter buttons', async () => {
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Espresso Machines' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grinders' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kettles' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Roasters' })).toBeInTheDocument();
  });

  it('renders category filter buttons in Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByRole('button', { name: 'Tümü' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Espresso Makineleri' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Öğütücüler' })).toBeInTheDocument();
  });

  it('renders search input with placeholder', async () => {
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByPlaceholderText('Search by brand, model, or name...')).toBeInTheDocument();
  });

  it('renders search input with Turkish placeholder', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByPlaceholderText('Marka, model veya isme göre ara...')).toBeInTheDocument();
  });

  it('shows active filters and clear all when filter is applied', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ type: 'kettle' }));
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText('Active filters:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument();
  });

  it('shows active filters in Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockUseSearchParams.mockReturnValue(makeSearchParams({ type: 'kettle' }));
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText('Aktif filtreler:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tümünü temizle' })).toBeInTheDocument();
  });

  it('calls API with type filter', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ type: 'espresso_machine' }));
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(mockApiGetWithMeta).toHaveBeenCalledWith(
      expect.stringContaining('type=espresso_machine'),
    );
  });

  it('calls API with search filter', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ search: 'Stagg' }));
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(mockApiGetWithMeta).toHaveBeenCalledWith(
      expect.stringContaining('search=Stagg'),
    );
  });

  it('calls API with both type and search filters', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ type: 'kettle', search: 'Fellow' }));
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(mockApiGetWithMeta).toHaveBeenCalledWith(
      expect.stringContaining('type=kettle'),
    );
    expect(mockApiGetWithMeta).toHaveBeenCalledWith(
      expect.stringContaining('search=Fellow'),
    );
  });

  it('shows pagination when multiple pages exist', async () => {
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([{
      id: 'eq-1',
      name: 'Test',
      brand: null,
      model: null,
      type: 'kettle',
      description: null,
    }], 25));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('shows pagination in Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([{
      id: 'eq-1',
      name: 'Test',
      brand: null,
      model: null,
      type: 'kettle',
      description: null,
    }], 25));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText(/Sayfa 1 \/ 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'İleri' })).toBeInTheDocument();
  });

  it('navigates to next page when Next is clicked', async () => {
    const setSearchParams = vi.fn();
    mockUseSearchParams.mockReturnValue(makeSearchParams({ page: '1' }));
    // Override the second element of the tuple to capture calls
    mockUseSearchParams.mockReturnValue([
      new URLSearchParams({ page: '1' }),
      setSearchParams,
    ]);
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([{
      id: 'eq-1',
      name: 'Test',
      brand: null,
      model: null,
      type: 'kettle',
      description: null,
    }], 25));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(setSearchParams).toHaveBeenCalledTimes(1);
    const [params, options] = setSearchParams.mock.calls[0];
    expect(params.get('page')).toBe('2');
    expect(options).toEqual({ preventScrollReset: true });
  });

  it('navigates to previous page when Previous is clicked', async () => {
    const setSearchParams = vi.fn();
    mockUseSearchParams.mockReturnValue([
      new URLSearchParams({ page: '3' }),
      setSearchParams,
    ]);
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([{
      id: 'eq-1',
      name: 'Test',
      brand: null,
      model: null,
      type: 'kettle',
      description: null,
    }], 25));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));

    expect(setSearchParams).toHaveBeenCalledTimes(1);
    const [params] = setSearchParams.mock.calls[0];
    expect(params.get('page')).toBe('2');
  });

  it('clamps negative page to 1', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ page: '-5' }));
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(mockApiGetWithMeta).toHaveBeenCalledWith(
      expect.stringContaining('page=1'),
    );
  });

  it('floors non-integer page to integer', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ page: '2.7' }));
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(mockApiGetWithMeta).toHaveBeenCalledWith(
      expect.stringContaining('page=2'),
    );
  });

  it('retries fetch when retry button is clicked', async () => {
    mockApiGetWithMeta.mockRejectedValue(new Error('Network error'));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText('Failed to load equipment')).toBeInTheDocument();
    expect(mockApiGetWithMeta).toHaveBeenCalledTimes(1);

    // Reset mock to resolve on next call
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(mockApiGetWithMeta).toHaveBeenCalledTimes(2));
  });

  it('passes translated title to SEOHead', async () => {
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    const calls = mockSEOHead.mock.calls;
    const lastProps = calls[calls.length - 1][0] as { title?: string };
    expect(lastProps.title).toBe('Coffee Equipment');
  });

  it('passes translated title to SEOHead — Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<EquipmentCatalogPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    const calls = mockSEOHead.mock.calls;
    const lastProps = calls[calls.length - 1][0] as { title?: string };
    expect(lastProps.title).toBe('Kahve Ekipmanları');
  });
});
