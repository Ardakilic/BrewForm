import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CoffeeVarietyDetailPage } from '../CoffeeVarietyDetailPage.tsx';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

vi.mock('react-router', () => ({
  Link: (
    { to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown },
  ) => <a href={to} {...props}>{children}</a>,
  useParams: vi.fn(),
  useNavigate: vi.fn(() => vi.fn()),
}));

vi.mock('../../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../../api/client.ts', () => ({
  api: { get: vi.fn() },
}));

vi.mock('../../../components/seo/SEOHead.tsx', () => ({
  SEOHead: vi.fn(() => null),
}));

import { useParams } from 'react-router';
import { useTranslation } from '../../../contexts/I18nContext.tsx';
import { api } from '../../../api/client.ts';
import { SEOHead } from '../../../components/seo/SEOHead.tsx';

const mockUseParams = vi.mocked(useParams);
const mockUseTranslation = vi.mocked(useTranslation);
const mockApiGet = vi.mocked(api.get);
const mockSEOHead = vi.mocked(SEOHead);

const enT = (key: string) => {
  const map: Record<string, string> = {
    'coffeeVarieties.title': 'Coffee Varieties',
    'coffeeVarieties.error.notFound': 'Variety not found',
    'coffeeVarieties.backToList': 'Back to varieties',
    'coffeeVarieties.category.varietyDetail': 'Variety Details',
    'coffeeVarieties.category.processingDetail': 'Processing Method Details',
    'coffeeVarieties.category.marketNameDetail': 'Market Name Details',
    'coffeeVarieties.fields.origin': 'Origin',
    'coffeeVarieties.fields.species': 'Species',
    'coffeeVarieties.fields.altitude': 'Altitude',
    'coffeeVarieties.fields.cupProfile': 'Cup Profile',
    'coffeeVarieties.fields.body': 'Body',
    'coffeeVarieties.fields.acidity': 'Acidity',
    'coffeeVarieties.fields.caffeine': 'Caffeine',
    'coffeeVarieties.fields.diseaseResistance': 'Disease Resistance',
    'coffeeVarieties.fields.yield': 'Yield',
    'coffeeVarieties.fields.plantSize': 'Plant Size',
    'coffeeVarieties.fields.spread': 'Spread',
    'coffeeVarieties.fields.notes': 'Notes',
    'coffeeVarieties.fields.fermentation': 'Fermentation',
    'coffeeVarieties.fields.dryingTime': 'Drying Time',
    'coffeeVarieties.fields.processingCompatibility': 'Processing Compatibility',
    'coffeeVarieties.fields.subVarieties': 'Sub-Varieties',
    'coffeeVarieties.recipesUsing': 'Recipes using {name}',
    'coffeeVarieties.noRecipes': 'No recipes use this variety yet.',
    'recipe.focusMode.by': 'by',
    'recipe.card.by': 'by',
  };
  return map[key] ?? key;
};

const trT = (key: string) => {
  const map: Record<string, string> = {
    'coffeeVarieties.title': 'Kahve Çeşitleri',
    'coffeeVarieties.error.notFound': 'Çeşit bulunamadı',
    'coffeeVarieties.backToList': 'Çeşitlere dön',
    'coffeeVarieties.category.varietyDetail': 'Çeşit Detayları',
    'coffeeVarieties.category.processingDetail': 'İşleme Yöntemi Detayları',
    'coffeeVarieties.category.marketNameDetail': 'Pazar Adı Detayları',
    'coffeeVarieties.fields.origin': 'Menşei',
    'coffeeVarieties.fields.species': 'Tür',
    'coffeeVarieties.fields.altitude': 'Rakım',
    'coffeeVarieties.fields.cupProfile': 'Fincan Profili',
    'coffeeVarieties.fields.body': 'Gövde',
    'coffeeVarieties.fields.acidity': 'Asidite',
    'coffeeVarieties.fields.caffeine': 'Kafein',
    'coffeeVarieties.fields.diseaseResistance': 'Hastalık Direnci',
    'coffeeVarieties.fields.yield': 'Verim',
    'coffeeVarieties.fields.plantSize': 'Bitki Boyutu',
    'coffeeVarieties.fields.spread': 'Yayılım',
    'coffeeVarieties.fields.notes': 'Notlar',
    'coffeeVarieties.fields.fermentation': 'Fermantasyon',
    'coffeeVarieties.fields.dryingTime': 'Kurutma Süresi',
    'coffeeVarieties.fields.processingCompatibility': 'İşleme Uyumluluğu',
    'coffeeVarieties.fields.subVarieties': 'Alt Çeşitler',
    'coffeeVarieties.recipesUsing': '{name} kullanan tarifler',
    'coffeeVarieties.noRecipes': 'Bu çeşidi kullanan tarif henüz yok.',
    'recipe.focusMode.by': 'tarafından',
    'recipe.card.by': 'tarafından',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

const mockVariety = {
  id: 'var-1',
  name: 'Bourbon',
  species: 'Arabica',
  category: 'variety',
  origin: 'Ethiopia',
  altitudeRangeM: '1500-2000m',
  cupProfile: 'Sweet, fruity with chocolate notes',
  body: 'Full',
  acidity: 'Bright',
  caffeinePct: 'Moderate',
  spread: null,
  diseaseResistance: null,
  yield: null,
  plantSize: null,
  notes: null,
  fermentation: null,
  dryingTimeDays: null,
  processingCompatibility: null,
  subVarieties: null,
  isSystem: false,
  createdBy: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  deletedAt: null,
};

const mockRecipes = {
  data: [
    {
      id: 'r1',
      slug: 'my-espresso',
      title: 'My Espresso',
      authorId: 'u1',
      visibility: 'public',
      currentVersionId: 'v1',
      author: { username: 'coffeelover', displayName: 'Coffee Lover', avatarUrl: null },
      versions: [
        { brewMethod: 'espresso', drinkType: 'espresso', rating: 4 },
      ],
      likeCount: 5,
      commentCount: 2,
      forkCount: 0,
      forkedFromId: null,
      featured: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deletedAt: null,
    },
    {
      id: 'r2',
      slug: 'pour-over',
      title: 'Morning Pour Over',
      authorId: 'u2',
      visibility: 'public',
      currentVersionId: 'v2',
      author: { username: 'barista', displayName: null, avatarUrl: null },
      versions: [
        { brewMethod: 'v60', drinkType: 'filter', rating: null },
      ],
      likeCount: 3,
      commentCount: 1,
      forkCount: 0,
      forkedFromId: null,
      featured: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deletedAt: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLogger.debug.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
  mockUseParams.mockReturnValue({ id: 'var-1' });
  mockUseTranslation.mockReturnValue(defaultTranslation);
  (mockApiGet as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce(mockVariety)
    .mockResolvedValueOnce(mockRecipes);
});

/** Tests for CoffeeVarietyDetailPage — loading, error, detail fields, recipes, breadcrumb, SEO props, and i18n. */
describe('CoffeeVarietyDetailPage', () => {
  it('logs mount and unmount', async () => {
    const { unmount } = render(<CoffeeVarietyDetailPage />);
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'CoffeeVarietyDetailPage mounted')
    );
    unmount();
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'CoffeeVarietyDetailPage unmounted')
    );
  });

  it('shows loading skeleton while fetching', () => {
    (mockApiGet as ReturnType<typeof vi.fn>).mockReset();
    (mockApiGet as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(<CoffeeVarietyDetailPage />);

    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders variety details when data loads — English', async () => {
    render(<CoffeeVarietyDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Bourbon' })).toBeInTheDocument()
    );

    expect(screen.getByText('Arabica')).toBeInTheDocument();
    expect(screen.getByText('Origin')).toBeInTheDocument();
    expect(screen.getByText('Ethiopia')).toBeInTheDocument();
    expect(screen.getByText('Cup Profile')).toBeInTheDocument();
    expect(screen.getByText('Sweet, fruity with chocolate notes')).toBeInTheDocument();
    expect(screen.getByText('Variety Details')).toBeInTheDocument();
  });

  it('renders processing category badge', async () => {
    (mockApiGet as ReturnType<typeof vi.fn>).mockReset();
    (mockApiGet as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ...mockVariety, category: 'processing' })
      .mockResolvedValueOnce(mockRecipes);
    render(<CoffeeVarietyDetailPage />);

    await waitFor(() => expect(screen.getByText('Processing Method Details')).toBeInTheDocument());
  });

  it('renders market_name category badge', async () => {
    (mockApiGet as ReturnType<typeof vi.fn>).mockReset();
    (mockApiGet as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ...mockVariety, category: 'market_name' })
      .mockResolvedValueOnce(mockRecipes);
    render(<CoffeeVarietyDetailPage />);

    await waitFor(() => expect(screen.getByText('Market Name Details')).toBeInTheDocument());
  });

  it('shows error state when API fails', async () => {
    (mockApiGet as ReturnType<typeof vi.fn>).mockReset();
    (mockApiGet as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    render(<CoffeeVarietyDetailPage />);

    await waitFor(() => expect(screen.getByText('Variety not found')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Back to varieties' })).toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'CoffeeVarietyDetailPage loadData failed',
    );
  });

  it('shows error state in Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    (mockApiGet as ReturnType<typeof vi.fn>).mockReset();
    (mockApiGet as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    render(<CoffeeVarietyDetailPage />);

    await waitFor(() => expect(screen.getByText('Çeşit bulunamadı')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Çeşitlere dön' })).toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'CoffeeVarietyDetailPage loadData failed',
    );
  });

  it('renders recipes section', async () => {
    render(<CoffeeVarietyDetailPage />);

    await waitFor(() => expect(screen.getByText('Recipes using Bourbon')).toBeInTheDocument());
    expect(screen.getByText('My Espresso')).toBeInTheDocument();
    expect(screen.getByText('Morning Pour Over')).toBeInTheDocument();
  });

  it('renders each recipe via the shared RecipeCard with a clickable author button', async () => {
    render(<CoffeeVarietyDetailPage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    // r1 author renders its displayName; r2 has a null displayName → username fallback
    expect(screen.getByRole('button', { name: 'Coffee Lover' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'barista' })).toBeInTheDocument();
  });

  it('renders the brew-method/drink-type/rating strip from r.versions[0]', async () => {
    render(<CoffeeVarietyDetailPage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    // r1 version: espresso / espresso / ★ 4
    expect(screen.getAllByText('espresso').length).toBeGreaterThan(0);
    expect(screen.getByText(/★ 4/)).toBeInTheDocument();
    // r2 version: v60 / filter / no rating
    expect(screen.getByText('v60')).toBeInTheDocument();
    expect(screen.getByText('filter')).toBeInTheDocument();
  });

  it('shows empty recipes message when no recipes', async () => {
    (mockApiGet as ReturnType<typeof vi.fn>).mockReset();
    (mockApiGet as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockVariety)
      .mockResolvedValueOnce({ data: [] });
    render(<CoffeeVarietyDetailPage />);

    await waitFor(() =>
      expect(screen.getByText('No recipes use this variety yet.')).toBeInTheDocument()
    );
  });

  it('passes title with description to SEOHead', async () => {
    render(<CoffeeVarietyDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Bourbon' })).toBeInTheDocument()
    );

    const calls = mockSEOHead.mock.calls;
    const lastProps = calls[calls.length - 1][0] as {
      title?: string;
      description?: string;
      canonical?: string;
    };
    expect(lastProps.title).toBe('Bourbon');
    expect(lastProps.description).toBe('Sweet, fruity with chocolate notes');
  });

  it('passes canonical URL to SEOHead', async () => {
    render(<CoffeeVarietyDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Bourbon' })).toBeInTheDocument()
    );

    const calls = mockSEOHead.mock.calls;
    const lastProps = calls[calls.length - 1][0] as { canonical?: string };
    expect(lastProps.canonical).toContain('/coffee-varieties/var-1');
  });

  it('falls back to species+origin description when no cupProfile', async () => {
    (mockApiGet as ReturnType<typeof vi.fn>).mockReset();
    (mockApiGet as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ...mockVariety, cupProfile: null })
      .mockResolvedValueOnce(mockRecipes);
    render(<CoffeeVarietyDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Bourbon' })).toBeInTheDocument()
    );

    const calls = mockSEOHead.mock.calls;
    const lastProps = calls[calls.length - 1][0] as { description?: string };
    expect(lastProps.description).toBe('Arabica from Ethiopia');
  });

  it('renders breadcrumb with link to list', async () => {
    render(<CoffeeVarietyDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Bourbon' })).toBeInTheDocument()
    );

    expect(screen.getByRole('link', { name: 'Coffee Varieties' })).toHaveAttribute(
      'href',
      '/coffee-varieties',
    );
  });
});
