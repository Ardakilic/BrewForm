import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    useSearchParams: vi.fn(),
  };
});

vi.mock('../../contexts/I18nContext.tsx', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTranslation: vi.fn(),
}));

vi.mock('../../contexts/AuthContext.tsx', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: vi.fn(),
}));

vi.mock('../../api/static-cache.ts', () => ({
  getEquipmentCached: vi.fn(),
  getTasteNotesCached: vi.fn(),
}));

vi.mock('../../utils/recipe-filters.ts', () => ({
  extractListParams: vi.fn().mockReturnValue({}),
}));

vi.mock('../../api/index.ts', () => ({
  recipeApi: { list: vi.fn() },
  coffeeVarietyApi: { search: vi.fn() },
  api: { get: vi.fn() },
}));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: () => null,
}));

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@brewform/shared/constants', () => ({
  BREW_METHODS_LIST: [{ value: 'ESPRESSO', label: 'Espresso' }],
  DRINK_TYPES_LIST: [{ value: 'ESPRESSO', label: 'Espresso' }],
  VISIBILITY_STATES_LIST: [{ value: 'public', label: 'Public' }],
  EQUIPMENT_TYPE_LABELS: {
    espresso_machine: 'Espresso Machine',
    grinder: 'Grinder',
    pour_over_brewer: 'Pour-Over & Filter Brewer',
    immersion_brewer: 'Immersion & Pressure Brewer',
    kettle: 'Kettle',
    milk_tool: 'Milk Tool',
    scale_accessory: 'Scale & Accessory',
    roaster: 'Roaster',
    portafilter: 'Portafilter',
    basket: 'Basket',
    puck_screen: 'Puck Screen',
    paper_filter: 'Paper Filter',
    tamper: 'Tamper',
    mesh_filter: 'Mesh Filter',
    cezve: 'Cezve',
    thermometer: 'Thermometer',
    other: 'Other',
  },
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { useSearchParams } from 'react-router';
import { I18nProvider, useTranslation } from '../../contexts/I18nContext.tsx';
import { AuthProvider, useAuth } from '../../contexts/AuthContext.tsx';
import { api, coffeeVarietyApi, recipeApi } from '../../api/index.ts';
import { getEquipmentCached, getTasteNotesCached } from '../../api/static-cache.ts';
import type {
  EquipmentOutput,
  PaginatedResponse,
  RecipeListItemOutput,
} from '@brewform/shared/schemas';
import fc from 'fast-check';
import { loader, RecipeListPage } from './RecipeListPage.tsx';
import {
  EQUIPMENT_FILTER_TYPES,
  EQUIPMENT_TYPE_LABELS,
} from '../../components/recipe-list/constants.ts';

/** Builds an empty `PaginatedResponse<RecipeListItemOutput>` for list mocks. */
function makeEmptyListResponse(): PaginatedResponse<RecipeListItemOutput> {
  return {
    success: true,
    data: [],
    meta: { requestId: 'test', pagination: { page: 1, perPage: 12, total: 0, totalPages: 0 } },
  };
}

/** Builds a minimal `EquipmentOutput` mock with all required fields. */
function makeEquipment(overrides: Partial<EquipmentOutput> = {}): EquipmentOutput {
  return {
    id: 'e1',
    name: 'Equipment',
    type: 'scale_accessory',
    brand: null,
    model: null,
    description: null,
    createdBy: null,
    isSystem: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

const mockUseSearchParams = vi.mocked(useSearchParams);
const mockUseTranslation = vi.mocked(useTranslation);
const mockUseAuth = vi.mocked(useAuth);
const mockCoffeeVarietyApi = vi.mocked(coffeeVarietyApi);
const mockApi = vi.mocked(api);
const mockRecipeApiList = vi.mocked(recipeApi.list);
const mockGetEquipmentCached = vi.mocked(getEquipmentCached);
const mockGetTasteNotesCached = vi.mocked(getTasteNotesCached);

// ── Render helper ──────────────────────────────────────────────────────────

const HydrateFallback = () => null;

function renderRecipeListPage(initialEntries = ['/recipes']) {
  const router = createMemoryRouter(
    [{ path: '/recipes', element: <RecipeListPage />, loader, HydrateFallback }],
    { initialEntries },
  );
  const renderResult = render(
    <I18nProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </I18nProvider>,
  );
  return { ...renderResult, router };
}

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
    'recipe.list.tasteNoteFilter': 'Taste Note',
    'recipe.list.tasteNoteFilterActive': 'Taste note filter active',
    'recipe.list.tasteNotesFilter': 'Taste Notes',
    'recipe.list.tasteNotesPlaceholder': 'Select taste notes...',
    'recipe.list.tasteNotesSelected': '{count} selected',
    'recipe.list.tasteNotesMax': 'Maximum 10 taste notes',
    'recipe.list.coffeeVarietyFilter': 'Coffee Variety',
    'recipe.list.coffeeVarietyPlaceholder': 'Search varieties...',
    'recipe.list.coffeeVarietyActive': 'Coffee variety filter active',
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
    'recipe.list.tasteNoteFilter': 'Tat Notu',
    'recipe.list.tasteNoteFilterActive': 'Tat notu filtresi aktif',
    'recipe.list.tasteNotesFilter': 'Tat Notaları',
    'recipe.list.tasteNotesPlaceholder': 'Tat notası seçin...',
    'recipe.list.tasteNotesSelected': '{count} seçili',
    'recipe.list.tasteNotesMax': 'En fazla 10 tat notası',
    'recipe.list.coffeeVarietyFilter': 'Kahve Çeşidi',
    'recipe.list.coffeeVarietyPlaceholder': 'Çeşit ara...',
    'recipe.list.coffeeVarietyActive': 'Kahve çeşidi filtresi aktif',
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
  sessionError: null as 'network' | 'server' | null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
  clearSessionError: vi.fn(),
};

// Minimal URLSearchParams stub
function makeSearchParams(init: Record<string, string> = {}) {
  const params = new URLSearchParams(init);
  return [params, vi.fn()] as ReturnType<typeof useSearchParams>;
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockRecipeApiList.mockResolvedValue(makeEmptyListResponse());
  mockGetEquipmentCached.mockResolvedValue([]);
  mockGetTasteNotesCached.mockResolvedValue([]);
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockUseAuth.mockReturnValue(defaultAuth as ReturnType<typeof useAuth>);
  mockUseSearchParams.mockReturnValue(makeSearchParams());
  mockCoffeeVarietyApi.search.mockResolvedValue([]);
  mockApi.get.mockResolvedValue({});
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('RecipeListPage — i18n', () => {
  it('renders page title and filter labels using t() — English', async () => {
    renderRecipeListPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Recipes' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Filters' })).toBeInTheDocument();
      expect(screen.getByText('Search')).toBeInTheDocument();
      expect(screen.getByText('Brew Method')).toBeInTheDocument();
      expect(screen.getByText('Drink Type')).toBeInTheDocument();
      expect(screen.getByText('Sort By')).toBeInTheDocument();
    });
  });

  it('renders page title and filter labels in Turkish when locale is tr', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    renderRecipeListPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Tarifler' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Filtreler' })).toBeInTheDocument();
      expect(screen.getByText('Ara')).toBeInTheDocument();
      expect(screen.getByText('Demleme Yöntemi')).toBeInTheDocument();
      expect(screen.getByText('İçecek Türü')).toBeInTheDocument();
      expect(screen.getByText('Sırala')).toBeInTheDocument();
    });
  });

  it('renders sort options using t()', async () => {
    renderRecipeListPage();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Newest' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Most Liked' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Top Rated' })).toBeInTheDocument();
    });
  });

  it('renders sort options in Turkish when locale is tr', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    renderRecipeListPage();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'En Yeni' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'En Beğenilen' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'En Yüksek Puanlı' })).toBeInTheDocument();
    });
  });

  it('shows "No recipes found." when loader returns empty array — English', async () => {
    renderRecipeListPage();

    await waitFor(() => {
      expect(screen.getByText('No recipes found.')).toBeInTheDocument();
    });
  });

  it('shows "Tarif bulunamadı." when loader returns empty array — Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    renderRecipeListPage();

    await waitFor(() => {
      expect(screen.getByText('Tarif bulunamadı.')).toBeInTheDocument();
    });
  });

  it('transitions from loading to loaded state when loader resolves', async () => {
    let resolveLoader: (value: PaginatedResponse<RecipeListItemOutput>) => void;
    const deferred = new Promise<PaginatedResponse<RecipeListItemOutput>>((resolve) => {
      resolveLoader = resolve;
    });
    mockRecipeApiList.mockReturnValueOnce(deferred);

    renderRecipeListPage();

    // Initially the HydrateFallback renders null; component is not yet present.
    expect(screen.queryByText('Recipes')).not.toBeInTheDocument();

    // Resolve the loader
    resolveLoader!(makeEmptyListResponse());

    // Component renders after loader resolves
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Recipes' })).toBeInTheDocument();
    });
  });

  it('shows Visibility filter only for admin users', async () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth,
      user: {
        id: 'a',
        email: 'a@a.com',
        emailVerifiedAt: null,
        username: 'admin',
        displayName: null,
        avatarUrl: null,
        isAdmin: true,
        onboardingCompleted: true,
      },
    } as ReturnType<typeof useAuth>);

    renderRecipeListPage();

    await waitFor(() => {
      expect(screen.getByText('Visibility (Admins only)')).toBeInTheDocument();
    });
  });

  it('does not show Visibility filter for non-admin users', async () => {
    renderRecipeListPage();

    expect(screen.queryByText('Visibility (Admins only)')).not.toBeInTheDocument();
  });

  it('shows search placeholder using t()', async () => {
    renderRecipeListPage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search recipes...')).toBeInTheDocument();
    });
  });

  it('shows Turkish search placeholder when locale is tr', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    renderRecipeListPage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Tarif ara...')).toBeInTheDocument();
    });
  });

  it('renders recipe cards with clickable author link when loader returns data', async () => {
    mockRecipeApiList.mockResolvedValue({
      success: true,
      data: [{
        id: 'recipe-1',
        slug: 'test-recipe',
        title: 'Test Recipe',
        authorId: 'u1',
        visibility: 'public',
        currentVersionId: null,
        likeCount: 5,
        commentCount: 2,
        forkCount: 1,
        forkedFromId: null,
        featured: false,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        deletedAt: null,
        author: { id: 'u1', username: 'testuser', displayName: 'Test User' },
      }],
      meta: { requestId: 'test', pagination: { page: 1, perPage: 12, total: 1, totalPages: 1 } },
    });

    renderRecipeListPage();

    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument();
    });

    const authorButton = screen.getByRole('button', { name: 'Test User' });
    expect(authorButton).toBeInTheDocument();
  });
});

describe('RecipeListPage — equipment filter (grouped dropdowns)', () => {
  const VALID_UUID = '11111111-1111-1111-1111-111111111111';

  it('renders a dropdown for each equipment type that has items', async () => {
    mockGetEquipmentCached.mockResolvedValue([
      makeEquipment({ id: 'eq-1', name: 'Acaia Lunar', type: 'scale_accessory', brand: 'Acaia' }),
      makeEquipment({ id: 'eq-2', name: 'Fellow Stagg', type: 'kettle', brand: 'Fellow' }),
    ]);

    renderRecipeListPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Filter by Scale & Accessory')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by Kettle')).toBeInTheDocument();
      expect(screen.queryByLabelText('Filter by Portafilter')).not.toBeInTheDocument();
    });
  });

  it('shows equipment name in the dropdown when equipment is loaded', async () => {
    mockGetEquipmentCached.mockResolvedValue([
      makeEquipment({
        id: VALID_UUID,
        name: 'My Espresso Scale',
        type: 'scale_accessory',
        brand: 'Acaia',
      }),
    ]);

    renderRecipeListPage();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'My Espresso Scale' })).toBeInTheDocument();
    });
  });

  it('shows active equipment filter badge when equipmentId is in URL', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ equipmentId: VALID_UUID }));
    mockGetEquipmentCached.mockResolvedValue([
      makeEquipment({
        id: VALID_UUID,
        name: 'Acaia Lunar',
        type: 'scale_accessory',
        brand: 'Acaia',
      }),
    ]);

    renderRecipeListPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Remove Equipment filter')).toBeInTheDocument();
      expect(screen.getAllByText('Acaia Lunar').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows fallback text in badge when equipment name is not found', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ equipmentId: VALID_UUID }));

    renderRecipeListPage();

    await waitFor(() => {
      expect(screen.getByText('Equipment filter active')).toBeInTheDocument();
    });
  });
});

describe('RecipeListPage — taste note filter', () => {
  const VALID_UUID = '22222222-2222-2222-2222-222222222222';

  const sampleTasteNotes = [
    { id: 'root-1', name: 'Fruity', depth: 0, parentId: null, category: 'taste' },
    { id: 'mid-1', name: 'Berry', depth: 1, parentId: 'root-1', category: 'taste' },
    { id: VALID_UUID, name: 'Raspberry', depth: 2, parentId: 'mid-1', category: 'taste' },
    { id: 'root-2', name: 'Floral', depth: 0, parentId: null, category: 'taste' },
    { id: 'mid-2', name: 'Floral', depth: 1, parentId: 'root-2', category: 'taste' },
    { id: 'leaf-2', name: 'Rose', depth: 2, parentId: 'mid-2', category: 'taste' },
  ] as any[];

  it('renders taste note dropdown when taste notes are loaded', async () => {
    mockGetTasteNotesCached.mockResolvedValue(sampleTasteNotes);

    renderRecipeListPage();

    await waitFor(() => expect(screen.getByText('Taste Notes')).toBeInTheDocument());
  });

  it('does NOT render taste note dropdown when no taste notes are loaded', async () => {
    renderRecipeListPage();

    expect(screen.queryByText('Taste Notes')).not.toBeInTheDocument();
  });

  it('shows leaf taste notes as options in the dropdown', async () => {
    mockGetTasteNotesCached.mockResolvedValue(sampleTasteNotes);

    renderRecipeListPage();

    await waitFor(() => {
      const trigger = screen.getAllByRole('combobox').find((el) =>
        el.textContent?.includes('Select taste notes...')
      );
      expect(trigger).toBeDefined();
    });

    const trigger = screen.getAllByRole('combobox').find((el) =>
      el.textContent?.includes('Select taste notes...')
    );
    await userEvent.click(trigger!);

    expect(await screen.findByRole('option', { name: 'Raspberry' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Rose' })).toBeInTheDocument();
  });

  it('shows active taste note filter badge when tasteNoteIds is in URL', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ tasteNoteIds: VALID_UUID }));
    mockGetTasteNotesCached.mockResolvedValue(sampleTasteNotes);

    renderRecipeListPage();

    await waitFor(() =>
      expect(screen.getByLabelText('Remove Taste Notes filter')).toBeInTheDocument()
    );
    expect(screen.getAllByText('Raspberry').length).toBeGreaterThanOrEqual(1);
  });

  it('shows fallback text in badge when taste note name is not found', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ tasteNoteIds: VALID_UUID }));

    renderRecipeListPage();

    await waitFor(() => expect(screen.getByText('Taste note filter active')).toBeInTheDocument());
  });

  it('shows taste note filter label in Turkish when locale is tr', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockUseSearchParams.mockReturnValue(makeSearchParams({ tasteNoteIds: VALID_UUID }));
    mockGetTasteNotesCached.mockResolvedValue(sampleTasteNotes);

    renderRecipeListPage();

    await waitFor(() => expect(screen.getAllByText('Tat Notaları').length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getAllByText('Raspberry').length).toBeGreaterThanOrEqual(1));
  });

  it('renders active filter badges after Filters heading and before Search filter', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({
      tasteNoteIds: VALID_UUID,
      equipmentId: '11111111-1111-1111-1111-111111111111',
    }));
    mockGetTasteNotesCached.mockResolvedValue(sampleTasteNotes);
    mockGetEquipmentCached.mockResolvedValue([
      makeEquipment({
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Acaia Lunar',
        type: 'scale_accessory',
        brand: 'Acaia',
      }),
    ]);

    renderRecipeListPage();

    await waitFor(() => {
      const filtersHeading = screen.getByRole('heading', { name: 'Filters' });
      const searchLabel = screen.getByText('Search');
      const badge1 = screen.getByLabelText('Remove Equipment filter');
      const badge2 = screen.getByLabelText('Remove Taste Notes filter');

      expect(filtersHeading.compareDocumentPosition(badge1) & Node.DOCUMENT_POSITION_FOLLOWING)
        .toBeTruthy();
      expect(filtersHeading.compareDocumentPosition(badge2) & Node.DOCUMENT_POSITION_FOLLOWING)
        .toBeTruthy();

      expect(badge1.compareDocumentPosition(searchLabel) & Node.DOCUMENT_POSITION_FOLLOWING)
        .toBeTruthy();
      expect(badge2.compareDocumentPosition(searchLabel) & Node.DOCUMENT_POSITION_FOLLOWING)
        .toBeTruthy();
    });
  });
});

describe('RecipeListPage — property-based tests', () => {
  function resetToDefaults() {
    cleanup();
    vi.clearAllMocks();
    mockRecipeApiList.mockResolvedValue(makeEmptyListResponse());
    mockGetEquipmentCached.mockResolvedValue([]);
    mockGetTasteNotesCached.mockResolvedValue([]);
    mockUseTranslation.mockReturnValue(defaultTranslation);
    mockUseAuth.mockReturnValue(defaultAuth as ReturnType<typeof useAuth>);
    mockUseSearchParams.mockReturnValue(makeSearchParams());
    mockCoffeeVarietyApi.search.mockResolvedValue([]);
    mockApi.get.mockResolvedValue({});
  }

  it('Property 5: equipment grouping correctness — exactly one dropdown per distinct type present', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1 }),
            type: fc.constantFrom(...EQUIPMENT_FILTER_TYPES),
          }),
          { maxLength: 20 },
        ),
        async (equipmentList) => {
          resetToDefaults();
          mockGetEquipmentCached.mockResolvedValue(
            equipmentList.map((e) =>
              makeEquipment({
                ...e,
                brand: null,
                model: null,
                description: null,
                createdBy: null,
                isSystem: false,
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
                deletedAt: null,
              })
            ),
          );

          renderRecipeListPage();

          await waitFor(() => {
            const distinctTypes = new Set(equipmentList.map((e) => e.type));
            for (const type of EQUIPMENT_FILTER_TYPES) {
              const label = `Filter by ${EQUIPMENT_TYPE_LABELS[type]}`;
              if (distinctTypes.has(type)) {
                expect(screen.getByLabelText(label)).toBeInTheDocument();
              } else {
                expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
              }
            }
          });
        },
      ),
      { numRuns: 30 },
    );
  });

  it('Property 7: Clear Filters button visibility reflects hasActiveFilters state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          brewMethod: fc.boolean(),
          drinkType: fc.boolean(),
          equipmentId: fc.boolean(),
          tasteNoteIds: fc.boolean(),
          search: fc.boolean(),
        }),
        async (active) => {
          resetToDefaults();

          const params: Record<string, string> = {};
          if (active.brewMethod) params.brewMethod = 'ESPRESSO';
          if (active.drinkType) params.drinkType = 'ESPRESSO';
          if (active.equipmentId) params.equipmentId = '11111111-1111-1111-1111-111111111111';
          if (active.tasteNoteIds) params.tasteNoteIds = '22222222-2222-2222-2222-222222222222';
          if (active.search) params.search = 'test-search';

          mockUseSearchParams.mockReturnValue(makeSearchParams(params));

          renderRecipeListPage();

          await waitFor(() => {
            const expectedHasActive = active.brewMethod ||
              active.drinkType ||
              active.equipmentId ||
              active.tasteNoteIds ||
              active.search;

            const clearButton = screen.queryByRole('button', { name: 'Clear Filters' });
            if (expectedHasActive) {
              expect(clearButton).toBeInTheDocument();
            } else {
              expect(clearButton).not.toBeInTheDocument();
            }
          });
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe('RecipeListPage — coffee variety filter', () => {
  const VARIETY_UUID = '33333333-3333-3333-3333-333333333333';

  it('renders coffee variety search input in the sidebar', async () => {
    renderRecipeListPage();

    await waitFor(() => {
      expect(screen.getByText('Coffee Variety')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search varieties...')).toBeInTheDocument();
    });
  });

  it('passes coffeeVarietyId via URL params — handled by loader', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ coffeeVarietyId: VARIETY_UUID }));
    mockApi.get.mockResolvedValue({ id: VARIETY_UUID, name: 'Bourbon', category: 'variety' });

    renderRecipeListPage();

    await waitFor(() => expect(screen.getAllByText('Bourbon').length).toBeGreaterThanOrEqual(1));
  });

  it('shows active coffee variety filter badge when coffeeVarietyId is in URL', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ coffeeVarietyId: VARIETY_UUID }));
    mockApi.get.mockResolvedValue({ id: VARIETY_UUID, name: 'Bourbon', category: 'variety' });

    renderRecipeListPage();

    await waitFor(() =>
      expect(screen.getByLabelText('Remove Coffee Variety filter')).toBeInTheDocument()
    );
    await waitFor(() => expect(screen.getAllByText('Bourbon').length).toBeGreaterThanOrEqual(1));
  });

  it('shows fallback text in badge when variety name is not resolved', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ coffeeVarietyId: VARIETY_UUID }));
    mockApi.get.mockRejectedValue(new Error('not found'));

    renderRecipeListPage();

    await waitFor(() =>
      expect(screen.getByText('Coffee variety filter active')).toBeInTheDocument()
    );
  });

  it('clears coffee variety filter when clear button is clicked', async () => {
    const setSearchParamsMock = vi.fn();
    mockUseSearchParams.mockReturnValue([
      new URLSearchParams({ coffeeVarietyId: VARIETY_UUID }),
      setSearchParamsMock,
    ] as ReturnType<typeof useSearchParams>);
    mockApi.get.mockResolvedValue({ id: VARIETY_UUID, name: 'Bourbon', category: 'variety' });

    renderRecipeListPage();

    await waitFor(() =>
      expect(screen.getByLabelText('Remove Coffee Variety filter')).toBeInTheDocument()
    );

    const removeButton = screen.getByLabelText('Remove Coffee Variety filter');
    await userEvent.click(removeButton);

    expect(setSearchParamsMock).toHaveBeenCalled();
    const calledParams = setSearchParamsMock.mock.calls[0][0] as URLSearchParams;
    expect(calledParams.get('coffeeVarietyId')).toBeNull();
  });
});
