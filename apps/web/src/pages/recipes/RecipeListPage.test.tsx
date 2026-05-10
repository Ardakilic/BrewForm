import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecipeListPage } from './RecipeListPage';

// ── External deps ──────────────────────────────────────────────────────────

vi.mock('react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useSearchParams: vi.fn(),
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../contexts/AuthContext.tsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../api/index.ts', () => ({
  recipeApi: { list: vi.fn() },
  equipmentApi: { list: vi.fn() },
}));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: () => null,
}));

vi.mock('@brewform/shared/constants', () => ({
  BREW_METHODS: [{ value: 'ESPRESSO', label: 'Espresso' }],
  DRINK_TYPES: [{ value: 'ESPRESSO', label: 'Espresso' }],
  VISIBILITY_STATES: [{ value: 'public', label: 'Public' }],
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { useSearchParams } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { recipeApi, equipmentApi } from '../../api/index.ts';

const mockUseSearchParams = vi.mocked(useSearchParams);
const mockUseTranslation = vi.mocked(useTranslation);
const mockUseAuth = vi.mocked(useAuth);
const mockRecipeApi = vi.mocked(recipeApi);
const mockEquipmentApi = vi.mocked(equipmentApi);

// ── Translation helpers ────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
    'recipe.list.title': 'Recipes',
    'recipe.list.filters': 'Filters',
    'recipe.list.search': 'Search',
    'recipe.list.searchPlaceholder': 'Search recipes...',
    'recipe.brewMethod': 'Brew Method',
    'recipe.drinkType': 'Drink Type',
    'recipe.list.sortBy': 'Sort By',
    'recipe.list.newest': 'Newest',
    'recipe.list.mostLiked': 'Most Liked',
    'recipe.list.topRated': 'Top Rated',
    'recipe.list.clearFilters': 'Clear Filters',
    'recipe.list.noResults': 'No recipes found.',
    'recipe.list.all': 'All',
    'recipe.list.visibilityAdmin': 'Visibility (Admins only)',
    'recipe.list.page': 'Page {page} of {total}',
    'recipe.list.equipmentFilter': 'Equipment',
    'recipe.list.equipmentFilterActive': 'Equipment filter active',
    'common.loading': 'Loading...',
    'common.previous': 'Previous',
    'common.next': 'Next',
  };
  return map[key] ?? key;
};

const trT = (key: string) => {
  const map: Record<string, string> = {
    'recipe.list.title': 'Tarifler',
    'recipe.list.filters': 'Filtreler',
    'recipe.list.search': 'Ara',
    'recipe.list.searchPlaceholder': 'Tarif ara...',
    'recipe.brewMethod': 'Demleme Yöntemi',
    'recipe.drinkType': 'İçecek Türü',
    'recipe.list.sortBy': 'Sırala',
    'recipe.list.newest': 'En Yeni',
    'recipe.list.mostLiked': 'En Beğenilen',
    'recipe.list.topRated': 'En Yüksek Puanlı',
    'recipe.list.clearFilters': 'Filtreleri Temizle',
    'recipe.list.noResults': 'Tarif bulunamadı.',
    'recipe.list.all': 'Tümü',
    'recipe.list.visibilityAdmin': 'Görünürlük (Yalnızca Yöneticiler)',
    'recipe.list.page': 'Sayfa {page} / {total}',
    'recipe.list.equipmentFilter': 'Ekipman',
    'recipe.list.equipmentFilterActive': 'Ekipman filtresi aktif',
    'common.loading': 'Yükleniyor...',
    'common.previous': 'Önceki',
    'common.next': 'İleri',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

const defaultAuth = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

// Minimal URLSearchParams stub
function makeSearchParams(init: Record<string, string> = {}) {
  const params = new URLSearchParams(init);
  return [params, vi.fn()] as ReturnType<typeof useSearchParams>;
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockUseAuth.mockReturnValue(defaultAuth as ReturnType<typeof useAuth>);
  mockUseSearchParams.mockReturnValue(makeSearchParams());
  mockRecipeApi.list.mockResolvedValue([]);
  mockEquipmentApi.list.mockResolvedValue([]);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('RecipeListPage — i18n', () => {
  it('renders page title and filter labels using t() — English', async () => {
    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(screen.getByRole('heading', { name: 'Recipes' })).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByText('Brew Method')).toBeInTheDocument();
    expect(screen.getByText('Drink Type')).toBeInTheDocument();
    expect(screen.getByText('Sort By')).toBeInTheDocument();
  });

  it('renders page title and filter labels in Turkish when locale is tr', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Yükleniyor...')).not.toBeInTheDocument());

    expect(screen.getByRole('heading', { name: 'Tarifler' })).toBeInTheDocument();
    expect(screen.getByText('Filtreler')).toBeInTheDocument();
    expect(screen.getByText('Ara')).toBeInTheDocument();
    expect(screen.getByText('Demleme Yöntemi')).toBeInTheDocument();
    expect(screen.getByText('İçecek Türü')).toBeInTheDocument();
    expect(screen.getByText('Sırala')).toBeInTheDocument();
  });

  it('renders sort options using t()', async () => {
    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(screen.getByRole('option', { name: 'Newest' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Most Liked' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Top Rated' })).toBeInTheDocument();
  });

  it('renders sort options in Turkish when locale is tr', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Yükleniyor...')).not.toBeInTheDocument());

    expect(screen.getByRole('option', { name: 'En Yeni' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'En Beğenilen' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'En Yüksek Puanlı' })).toBeInTheDocument();
  });

  it('shows "No recipes found." when API returns empty array — English', async () => {
    render(<RecipeListPage />);

    await waitFor(() => {
      expect(screen.getByText('No recipes found.')).toBeInTheDocument();
    });
  });

  it('shows "Tarif bulunamadı." when API returns empty array — Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<RecipeListPage />);

    await waitFor(() => {
      expect(screen.getByText('Tarif bulunamadı.')).toBeInTheDocument();
    });
  });

  it('shows "Loading..." while fetching — English', () => {
    // Never resolves so loading state persists
    mockRecipeApi.list.mockReturnValue(new Promise(() => {}));

    render(<RecipeListPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows "Yükleniyor..." while fetching — Turkish', () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockRecipeApi.list.mockReturnValue(new Promise(() => {}));

    render(<RecipeListPage />);

    expect(screen.getByText('Yükleniyor...')).toBeInTheDocument();
  });

  it('shows Visibility filter only for admin users', async () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth,
      user: { id: 'a', email: 'a@a.com', username: 'admin', displayName: null, avatarUrl: null, isAdmin: true, onboardingCompleted: true },
    } as ReturnType<typeof useAuth>);

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(screen.getByText('Visibility (Admins only)')).toBeInTheDocument();
  });

  it('does not show Visibility filter for non-admin users', async () => {
    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(screen.queryByText('Visibility (Admins only)')).not.toBeInTheDocument();
  });

  it('shows search placeholder using t()', async () => {
    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(screen.getByPlaceholderText('Search recipes...')).toBeInTheDocument();
  });

  it('shows Turkish search placeholder when locale is tr', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Yükleniyor...')).not.toBeInTheDocument());

    expect(screen.getByPlaceholderText('Tarif ara...')).toBeInTheDocument();
  });
});

describe('RecipeListPage — equipment filter', () => {
  const VALID_UUID = '11111111-1111-1111-1111-111111111111';

  it('passes equipmentId to API when URL has a valid UUID', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ equipmentId: VALID_UUID }));
    mockEquipmentApi.list.mockResolvedValue([]);

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(mockRecipeApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ equipmentId: VALID_UUID }),
    );
  });

  it('does NOT pass equipmentId to API when value is not a valid UUID', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ equipmentId: 'not-a-uuid' }));
    mockEquipmentApi.list.mockResolvedValue([]);

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    const callArgs = mockRecipeApi.list.mock.calls[0][0] as Record<string, string>;
    expect(callArgs).not.toHaveProperty('equipmentId');
  });

  it('shows equipment filter label with fallback text when equipment name is not found', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ equipmentId: VALID_UUID }));
    mockEquipmentApi.list.mockResolvedValue([]);

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.getByText('Equipment')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Equipment filter active')).toBeInTheDocument());
  });

  it('shows equipment name when equipment is found in list', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ equipmentId: VALID_UUID }));
    mockEquipmentApi.list.mockResolvedValue([{ id: VALID_UUID, name: 'My Espresso Machine' }]);

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.getByText('My Espresso Machine')).toBeInTheDocument());
  });

  it('shows remove button for equipment filter with correct aria-label', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ equipmentId: VALID_UUID }));
    mockEquipmentApi.list.mockResolvedValue([]);

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.getByLabelText('Remove equipment filter')).toBeInTheDocument());
  });

  it('does not show equipment filter section when equipmentId is absent', async () => {
    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(screen.queryByText('Equipment')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Remove equipment filter')).not.toBeInTheDocument();
  });

  it('shows equipment filter label in Turkish when locale is tr', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockUseSearchParams.mockReturnValue(makeSearchParams({ equipmentId: VALID_UUID }));
    mockEquipmentApi.list.mockResolvedValue([]);

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.getByText('Ekipman')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Ekipman filtresi aktif')).toBeInTheDocument());
  });
});
