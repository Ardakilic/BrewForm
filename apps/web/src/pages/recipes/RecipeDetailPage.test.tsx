import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RecipeDetailPage } from './RecipeDetailPage';

// ── External deps ──────────────────────────────────────────────────────────

vi.mock('react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useParams: vi.fn(),
  useSearchParams: vi.fn(),
  useNavigate: vi.fn(),
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../contexts/AuthContext.tsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../api/index.ts', () => ({
  recipeApi: { get: vi.fn(), rate: vi.fn() },
}));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: vi.fn(() => null),
}));
vi.mock('../../components/seo/JsonLd.tsx', () => ({ RecipeJsonLd: () => null }));
vi.mock('../../components/recipe/LikeButton.tsx', () => ({ LikeButton: () => null }));
vi.mock('../../components/recipe/FavouriteButton.tsx', () => ({ FavouriteButton: () => null }));
vi.mock('../../components/recipe/CommentSection.tsx', () => ({ CommentSection: () => null }));
vi.mock('../../components/qrcode/RecipeQRCode.tsx', () => ({ RecipeQRCode: () => null }));
vi.mock('../../components/recipe/PrintButton.tsx', () => ({
  PrintButton: () => null,
  FocusModeButton: () => null,
}));
vi.mock('../../components/recipe/StarRating.tsx', () => ({ StarRating: () => null }));
vi.mock('@brewform/shared/constants', () => ({ EMOJI_TAGS: [] }));

// ── Imports after mocks ────────────────────────────────────────────────────

import { useParams, useSearchParams, useNavigate } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { recipeApi } from '../../api/index.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';

const mockUseParams = vi.mocked(useParams);
const mockUseSearchParams = vi.mocked(useSearchParams);
const mockUseNavigate = vi.mocked(useNavigate);
const mockUseTranslation = vi.mocked(useTranslation);
const mockUseAuth = vi.mocked(useAuth);
const mockRecipeApi = vi.mocked(recipeApi);
const mockSEOHead = vi.mocked(SEOHead);

// ── Translation helpers ────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
    'common.loading': 'Loading...',
    'common.edit': 'Edit',
    'recipe.notFound': 'Recipe not found',
    'recipe.brewParams': 'Brew Parameters',
    'recipe.brewMethod': 'Brew Method',
    'recipe.drinkType': 'Drink Type',
    'recipe.productName': 'Product Name',
    'recipe.coffeeBrand': 'Coffee Brand',
    'recipe.coffeeProcessing': 'Coffee Processing',
    'recipe.roastDate': 'Roast Date',
    'recipe.packageOpenDate': 'Package Open Date',
    'recipe.grindDate': 'Grind Date',
    'recipe.grinder': 'Grinder',
    'recipe.grindSize': 'Grind Size',
    'recipe.dose': 'Dose',
    'recipe.extractionTime': 'Extraction Time',
    'recipe.yield': 'Yield',
    'recipe.temperature': 'Temperature',
    'recipe.ratio': 'Ratio',
    'recipe.flowRate': 'Flow Rate',
    'recipe.personalNotes': 'Personal Notes',
    'recipe.tasteNotes': 'Taste Notes',
    'equipment.title': 'Equipment',
    'recipe.rating': 'Rating',
    'recipe.authorRating': "Author's rating",
    'recipe.communityAvg': 'Community average',
    'recipe.rateThis': 'Rate this recipe',
    'recipe.yourRating': 'Your rating',
    'recipe.fork': 'Fork Recipe',
    'recipe.forkedFromOriginal': 'Forked from original',
  };
  return map[key] ?? key;
};

const trT = (key: string) => {
  const map: Record<string, string> = {
    'common.loading': 'Yükleniyor...',
    'common.edit': 'Düzenle',
    'recipe.notFound': 'Tarif bulunamadı',
    'recipe.brewParams': 'Demleme Parametreleri',
    'recipe.brewMethod': 'Demleme Yöntemi',
    'recipe.drinkType': 'İçecek Türü',
    'recipe.productName': 'Ürün Adı',
    'recipe.coffeeBrand': 'Kahve Markası',
    'recipe.coffeeProcessing': 'Kahve İşleme Yöntemi',
    'recipe.roastDate': 'Kavurma Tarihi',
    'recipe.packageOpenDate': 'Paket Açma Tarihi',
    'recipe.grindDate': 'Öğütme Tarihi',
    'recipe.grinder': 'Öğütücü',
    'recipe.grindSize': 'Öğütme Boyutu',
    'recipe.dose': 'Doz',
    'recipe.extractionTime': 'Ekstraksiyon Süresi',
    'recipe.yield': 'Verim',
    'recipe.temperature': 'Sıcaklık',
    'recipe.ratio': 'Oran',
    'recipe.flowRate': 'Akış Hızı',
    'recipe.personalNotes': 'Kişisel Notlar',
    'recipe.tasteNotes': 'Tat Notları',
    'equipment.title': 'Ekipman',
    'recipe.rating': 'Puan',
    'recipe.authorRating': 'Yazarın puanı',
    'recipe.communityAvg': 'Topluluk ortalaması',
    'recipe.rateThis': 'Bu tarifi puanla',
    'recipe.yourRating': 'Puanınız',
    'recipe.fork': 'Tarifi Çatalla',
    'recipe.forkedFromOriginal': 'Orijinalden çatallandı',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

const guestAuth = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

const sampleRecipe = {
  id: 'recipe-1',
  slug: 'my-espresso',
  title: 'My Espresso',
  visibility: 'public',
  authorId: 'author-1',
  author: { id: 'author-1', username: 'alice', displayName: 'Alice' },
  likeCount: 5,
  commentCount: 2,
  forkCount: 1,
  userLiked: false,
  userFavourited: false,
  favouriteCount: 0,
  avgRating: null,
  ratingCount: 0,
  userRating: null,
  forkedFromSlug: null,
  tasteNotes: [],
  equipment: [],
  photos: [],
  createdAt: '2026-05-01T00:00:00Z',
  currentVersion: {
    brewMethod: 'ESPRESSO',
    drinkType: 'ESPRESSO',
    groundWeightGrams: 18,
    extractionTimeSeconds: 28,
    extractionVolumeMl: 36,
    temperatureCelsius: 93,
    brewRatio: 2,
    personalNotes: 'Great shot',
    rating: 4,
  },
};

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockUseAuth.mockReturnValue(guestAuth as ReturnType<typeof useAuth>);
  mockUseParams.mockReturnValue({ slug: 'my-espresso' });
  mockUseSearchParams.mockReturnValue([new URLSearchParams(), vi.fn()] as ReturnType<typeof useSearchParams>);
  mockUseNavigate.mockReturnValue(vi.fn());
  mockRecipeApi.get.mockResolvedValue(sampleRecipe as unknown as Record<string, unknown>);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('RecipeDetailPage — loading and not-found states', () => {
  it('shows "Loading..." while fetching — English', () => {
    mockRecipeApi.get.mockReturnValue(new Promise(() => {}));

    render(<RecipeDetailPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows "Yükleniyor..." while fetching — Turkish', () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockRecipeApi.get.mockReturnValue(new Promise(() => {}));

    render(<RecipeDetailPage />);

    expect(screen.getByText('Yükleniyor...')).toBeInTheDocument();
  });

  it('shows "Recipe not found" when API returns null — English', async () => {
    mockRecipeApi.get.mockResolvedValue(null as unknown as Record<string, unknown>);

    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Recipe not found')).toBeInTheDocument();
    });
  });

  it('shows "Tarif bulunamadı" when API returns null — Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockRecipeApi.get.mockResolvedValue(null as unknown as Record<string, unknown>);

    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Tarif bulunamadı')).toBeInTheDocument();
    });
  });
});

describe('RecipeDetailPage — i18n section headings', () => {
  it('renders section headings using t() — English', async () => {
    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Brew Parameters')).toBeInTheDocument();
    });

    expect(screen.getByText('Personal Notes')).toBeInTheDocument();
    expect(screen.getByText('Rating')).toBeInTheDocument();
  });

  it('renders section headings in Turkish when locale is tr', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Demleme Parametreleri')).toBeInTheDocument();
    });

    expect(screen.getByText('Kişisel Notlar')).toBeInTheDocument();
    expect(screen.getByText('Puan')).toBeInTheDocument();
  });

  it('renders param row labels using t() — English', async () => {
    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Brew Method')).toBeInTheDocument();
    });

    expect(screen.getByText('Drink Type')).toBeInTheDocument();
    expect(screen.getByText('Dose')).toBeInTheDocument();
    expect(screen.getByText('Extraction Time')).toBeInTheDocument();
    expect(screen.getByText('Yield')).toBeInTheDocument();
    expect(screen.getByText('Temperature')).toBeInTheDocument();
    expect(screen.getByText('Ratio')).toBeInTheDocument();
  });

  it('renders param row labels in Turkish when locale is tr', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Demleme Yöntemi')).toBeInTheDocument();
    });

    expect(screen.getByText('İçecek Türü')).toBeInTheDocument();
    expect(screen.getByText('Doz')).toBeInTheDocument();
    expect(screen.getByText('Ekstraksiyon Süresi')).toBeInTheDocument();
    expect(screen.getByText('Verim')).toBeInTheDocument();
    expect(screen.getByText('Sıcaklık')).toBeInTheDocument();
    expect(screen.getByText('Oran')).toBeInTheDocument();
  });

  it('renders rating sub-labels using t() — English', async () => {
    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Author's rating")).toBeInTheDocument();
    });

    expect(screen.getByText('Community average')).toBeInTheDocument();
  });

  it('renders rating sub-labels in Turkish when locale is tr', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Yazarın puanı')).toBeInTheDocument();
    });

    expect(screen.getByText('Topluluk ortalaması')).toBeInTheDocument();
  });
});

describe('RecipeDetailPage — owner actions', () => {
  const ownerAuth = {
    user: { id: 'author-1', email: 'alice@example.com', username: 'alice', displayName: 'Alice', avatarUrl: null, isAdmin: false, onboardingCompleted: true },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  };

  it('shows Edit button for the recipe owner — English', async () => {
    mockUseAuth.mockReturnValue(ownerAuth as ReturnType<typeof useAuth>);

    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument();
    });
  });

  it('shows Edit button in Turkish for the recipe owner', async () => {
    mockUseAuth.mockReturnValue(ownerAuth as ReturnType<typeof useAuth>);
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Düzenle' })).toBeInTheDocument();
    });
  });

  it('does not show Edit button for non-owners', async () => {
    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('My Espresso')).toBeInTheDocument();
    });

    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });
});

describe('RecipeDetailPage — canonical SEO', () => {
  it('passes canonical pointing to /recipes/:slug', async () => {
    render(<RecipeDetailPage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    const calls = mockSEOHead.mock.calls;
    const lastProps = calls[calls.length - 1][0] as { canonical?: string; noIndex?: boolean };
    expect(lastProps.canonical).toMatch(/\/recipes\/my-espresso$/);
  });

  it('does NOT pass noIndex — recipe detail page should be indexed', async () => {
    render(<RecipeDetailPage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    const calls = mockSEOHead.mock.calls;
    const lastProps = calls[calls.length - 1][0] as { canonical?: string; noIndex?: boolean };
    expect(lastProps.noIndex).toBeFalsy();
  });
});
