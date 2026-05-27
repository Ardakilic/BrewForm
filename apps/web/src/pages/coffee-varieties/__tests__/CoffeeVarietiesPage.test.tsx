import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CoffeeVarietiesPage } from '../CoffeeVarietiesPage.tsx';

vi.mock('react-router', () => ({
  Link: (
    { to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown },
  ) => <a href={to} {...props}>{children}</a>,
  useSearchParams: vi.fn(),
}));

vi.mock('../../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../../api/client.ts', () => ({
  api: { getWithMeta: vi.fn() },
}));

vi.mock('../../../hooks/useDebounce.ts', () => ({
  useDebounce: (value: string) => value,
}));

vi.mock('../../../components/seo/SEOHead.tsx', () => ({
  SEOHead: () => null,
}));

import { useSearchParams } from 'react-router';
import { useTranslation } from '../../../contexts/I18nContext.tsx';
import { api } from '../../../api/client.ts';

const mockUseSearchParams = vi.mocked(useSearchParams);
const mockUseTranslation = vi.mocked(useTranslation);
const mockApiGetWithMeta = vi.mocked(api.getWithMeta);

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
    'coffeeVarieties.title': 'Coffee Varieties',
    'coffeeVarieties.subtitle': 'Explore different varieties, processing methods, and market names',
    'coffeeVarieties.searchPlaceholder': 'Search varieties...',
    'coffeeVarieties.error.load': 'Failed to load varieties',
    'coffeeVarieties.empty': 'No varieties found',
    'coffeeVarieties.category.variety': 'Varieties',
    'coffeeVarieties.category.processing': 'Processing Methods',
    'coffeeVarieties.category.market_name': 'Market Names',
    'coffeeVarieties.category.varietyShort': 'Var.',
    'coffeeVarieties.category.processingShort': 'Proc.',
    'coffeeVarieties.category.marketNameShort': 'Mkt.',
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
    'coffeeVarieties.title': 'Kahve Çeşitleri',
    'coffeeVarieties.subtitle': 'Farklı çeşitleri, işleme yöntemlerini ve pazar adlarını keşfedin',
    'coffeeVarieties.searchPlaceholder': 'Çeşit ara...',
    'coffeeVarieties.error.load': 'Çeşitler yüklenemedi',
    'coffeeVarieties.empty': 'Çeşit bulunamadı',
    'coffeeVarieties.category.variety': 'Çeşitler',
    'coffeeVarieties.category.processing': 'İşleme Yöntemleri',
    'coffeeVarieties.category.market_name': 'Pazar Adları',
    'coffeeVarieties.category.varietyShort': 'Çeş.',
    'coffeeVarieties.category.processingShort': 'İşl.',
    'coffeeVarieties.category.marketNameShort': 'Paz.',
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
    success: true,
    data: items,
    meta: {
      requestId: 'test-req',
      pagination: {
        page: 1,
        perPage: 12,
        total,
        totalPages: Math.ceil(total / 12),
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockUseSearchParams.mockReturnValue(makeSearchParams());
  mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
});

describe('CoffeeVarietiesPage', () => {
  it('renders page title and subtitle — English', async () => {
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByRole('heading', { name: 'Coffee Varieties' })).toBeInTheDocument();
    expect(screen.getByText('Explore different varieties, processing methods, and market names'))
      .toBeInTheDocument();
  });

  it('renders page title and subtitle — Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByRole('heading', { name: 'Kahve Çeşitleri' })).toBeInTheDocument();
    expect(screen.getByText('Farklı çeşitleri, işleme yöntemlerini ve pazar adlarını keşfedin'))
      .toBeInTheDocument();
  });

  it('renders coffee variety cards when API returns data', async () => {
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([
      {
        id: 'v1',
        name: 'Bourbon',
        species: 'Arabica',
        category: 'variety',
        origin: 'Ethiopia',
        cupProfile: 'Sweet and fruity',
        slug: 'bourbon',
      },
      {
        id: 'v2',
        name: 'Washed',
        species: 'Arabica',
        category: 'processing',
        origin: null,
        cupProfile: null,
        slug: 'washed',
      },
    ], 2));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText('Bourbon')).toBeInTheDocument();
    expect(screen.getByText('Washed')).toBeInTheDocument();
    expect(screen.getAllByText('Arabica').length).toBe(2);
    expect(screen.getByText('Ethiopia')).toBeInTheDocument();
  });

  it('shows loading skeleton while fetching', () => {
    mockApiGetWithMeta.mockReturnValue(new Promise(() => {}));
    render(<CoffeeVarietiesPage />);

    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows empty state when API returns empty array', async () => {
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText('No varieties found')).toBeInTheDocument();
  });

  it('shows empty state in Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText('Çeşit bulunamadı')).toBeInTheDocument();
  });

  it('shows error state with retry button', async () => {
    mockApiGetWithMeta.mockRejectedValue(new Error('Network error'));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText('Failed to load varieties')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows error state with retry button in Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockApiGetWithMeta.mockRejectedValue(new Error('Network error'));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText('Çeşitler yüklenemedi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument();
  });

  it('renders category filter buttons — English', async () => {
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Varieties' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Processing Methods' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Market Names' })).toBeInTheDocument();
  });

  it('renders category filter buttons — Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByRole('button', { name: 'Tümü' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Çeşitler' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'İşleme Yöntemleri' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pazar Adları' })).toBeInTheDocument();
  });

  it('renders search input with placeholder — English', async () => {
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByPlaceholderText('Search varieties...')).toBeInTheDocument();
  });

  it('renders search input with placeholder — Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByPlaceholderText('Çeşit ara...')).toBeInTheDocument();
  });

  it('calls API with category filter in query string', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ category: 'processing' }));
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(mockApiGetWithMeta).toHaveBeenCalledWith(
      expect.stringContaining('category=processing'),
    );
  });

  it('calls API with search filter in query string', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ search: 'Bourbon' }));
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(mockApiGetWithMeta).toHaveBeenCalledWith(
      expect.stringContaining('search=Bourbon'),
    );
  });

  it('shows active filters and clear all when filter is applied', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ category: 'variety' }));
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText('Active filters:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument();
  });

  it('shows pagination when multiple pages exist', async () => {
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([
      {
        id: 'v1',
        name: 'Bourbon',
        species: 'Arabica',
        category: 'variety',
        origin: null,
        cupProfile: null,
        slug: 'bourbon',
      },
    ], 25));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('shows pagination in Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([
      {
        id: 'v1',
        name: 'Bourbon',
        species: 'Arabica',
        category: 'variety',
        origin: null,
        cupProfile: null,
        slug: 'bourbon',
      },
    ], 25));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText(/Sayfa 1 \/ 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'İleri' })).toBeInTheDocument();
  });

  it('paginated response with meta.pagination.total calculates correct totalPages', async () => {
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([
      {
        id: 'v1',
        name: 'Test',
        species: null,
        category: null,
        origin: null,
        cupProfile: null,
        slug: 'test',
      },
    ], 30));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
  });

  it('renders category badges on cards — variety type', async () => {
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([
      {
        id: 'v1',
        name: 'Geisha',
        species: 'Arabica',
        category: 'variety',
        origin: 'Panama',
        cupProfile: null,
        slug: 'geisha',
      },
    ], 1));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText('Var.')).toBeInTheDocument();
  });

  it('renders category badges on cards — processing type', async () => {
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([
      {
        id: 'v1',
        name: 'Natural',
        species: 'Arabica',
        category: 'processing',
        origin: null,
        cupProfile: null,
        slug: 'natural',
      },
    ], 1));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText('Proc.')).toBeInTheDocument();
  });

  it('renders category badges on cards — market_name type', async () => {
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([
      {
        id: 'v1',
        name: 'Yirgacheffe',
        species: 'Arabica',
        category: 'market_name',
        origin: null,
        cupProfile: null,
        slug: 'yirgacheffe',
      },
    ], 1));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText('Mkt.')).toBeInTheDocument();
  });

  it('calls API with page param', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ page: '3' }));
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(mockApiGetWithMeta).toHaveBeenCalledWith(
      expect.stringContaining('page=3'),
    );
  });

  it('navigates to next page when Next is clicked', async () => {
    const setSearchParams = vi.fn();
    mockUseSearchParams.mockReturnValue([
      new URLSearchParams({ page: '1' }),
      setSearchParams,
    ]);
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([
      {
        id: 'v1',
        name: 'Bourbon',
        species: 'Arabica',
        category: 'variety',
        origin: null,
        cupProfile: null,
        slug: 'bourbon',
      },
    ], 25));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    // Use fireEvent since userEvent has type issues in this project setup
    const { fireEvent } = await import('@testing-library/react');
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
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([
      {
        id: 'v1',
        name: 'Bourbon',
        species: 'Arabica',
        category: 'variety',
        origin: null,
        cupProfile: null,
        slug: 'bourbon',
      },
    ], 25));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));

    expect(setSearchParams).toHaveBeenCalledTimes(1);
    const [params] = setSearchParams.mock.calls[0];
    expect(params.get('page')).toBe('2');
  });

  it('links coffee variety cards to detail page', async () => {
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([
      {
        id: 'v1',
        name: 'Bourbon',
        species: null,
        category: null,
        origin: null,
        cupProfile: null,
        slug: 'bourbon',
      },
    ], 1));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    const link = screen.getByRole('link', { name: /Bourbon/ });
    expect(link).toHaveAttribute('href', '/coffee-varieties/v1');
  });

  it('shows clear search button in empty state when filters active', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ category: 'variety' }));
    mockApiGetWithMeta.mockResolvedValue(makePaginatedResponse([], 0));
    render(<CoffeeVarietiesPage />);

    await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeFalsy());

    expect(screen.getByText('No varieties found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
  });
});
