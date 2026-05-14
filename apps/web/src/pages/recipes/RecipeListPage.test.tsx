import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecipeListPage } from './RecipeListPage';

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

vi.mock('../../contexts/AuthContext.tsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../api/index.ts', () => ({
  recipeApi: { list: vi.fn() },
  equipmentApi: { list: vi.fn() },
  tasteApi: { flat: vi.fn() },
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
import { equipmentApi, recipeApi, tasteApi } from '../../api/index.ts';
import fc from 'fast-check';
import { _resetStaticCache, EQUIPMENT_FILTER_TYPES, EQUIPMENT_TYPE_LABELS } from './RecipeListPage';

const mockUseSearchParams = vi.mocked(useSearchParams);
const mockUseTranslation = vi.mocked(useTranslation);
const mockUseAuth = vi.mocked(useAuth);
const mockRecipeApi = vi.mocked(recipeApi);
const mockEquipmentApi = vi.mocked(equipmentApi);
const mockTasteApi = vi.mocked(tasteApi);

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
  _resetStaticCache();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockUseAuth.mockReturnValue(defaultAuth as ReturnType<typeof useAuth>);
  mockUseSearchParams.mockReturnValue(makeSearchParams());
  mockRecipeApi.list.mockResolvedValue([]);
  mockEquipmentApi.list.mockResolvedValue([]);
  mockTasteApi.flat.mockResolvedValue([]);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('RecipeListPage — i18n', () => {
  it('renders page title and filter labels using t() — English', async () => {
    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(screen.getByRole('heading', { name: 'Recipes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Filters' })).toBeInTheDocument();
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
    expect(screen.getByRole('heading', { name: 'Filtreler' })).toBeInTheDocument();
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
      user: {
        id: 'a',
        email: 'a@a.com',
        username: 'admin',
        displayName: null,
        avatarUrl: null,
        isAdmin: true,
        onboardingCompleted: true,
      },
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

  it('renders recipe cards with clickable author link when API returns data', async () => {
    const mockRecipes = [
      {
        id: 'recipe-1',
        slug: 'test-recipe',
        title: 'Test Recipe',
        visibility: 'public',
        likeCount: 5,
        commentCount: 2,
        forkCount: 1,
        author: { username: 'testuser', displayName: 'Test User' },
        currentVersion: { brewMethod: 'espresso_machine', drinkType: 'espresso', rating: null },
        createdAt: '2025-01-01T00:00:00Z',
      },
    ];
    mockRecipeApi.list.mockResolvedValue(mockRecipes);

    render(<RecipeListPage />);

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    // Recipe title should render
    expect(screen.getByText('Test Recipe')).toBeInTheDocument();

    // Author's display name should be visible and linked to profile
    const authorLink = screen.getByRole('link', { name: 'Test User' });
    expect(authorLink).toHaveAttribute('href', '/u/testuser');
  });
});

describe('RecipeListPage — equipment filter (grouped dropdowns)', () => {
  const VALID_UUID = '11111111-1111-1111-1111-111111111111';

  it('passes equipmentId to API when URL has a valid UUID', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ equipmentId: VALID_UUID }));
    mockEquipmentApi.list.mockResolvedValue([
      { id: VALID_UUID, name: 'Acaia Lunar', type: 'scale' },
    ]);

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(mockRecipeApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ equipmentId: VALID_UUID }),
    );
  });

  it('does NOT pass equipmentId to API when value is not a valid UUID', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ equipmentId: 'not-a-uuid' }));

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    const callArgs = mockRecipeApi.list.mock.calls[0][0] as Record<string, string>;
    expect(callArgs).not.toHaveProperty('equipmentId');
  });

  it('renders a dropdown for each equipment type that has items', async () => {
    mockEquipmentApi.list.mockResolvedValue([
      { id: 'eq-1', name: 'Acaia Lunar', type: 'scale' },
      { id: 'eq-2', name: 'Fellow Stagg', type: 'gooseneck_kettle' },
    ]);

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    // Scale dropdown should appear
    expect(screen.getByLabelText('Filter by Scale')).toBeInTheDocument();
    // Kettle dropdown should appear
    expect(screen.getByLabelText('Filter by Kettle')).toBeInTheDocument();
    // Portafilter dropdown should NOT appear (no items)
    expect(screen.queryByLabelText('Filter by Portafilter')).not.toBeInTheDocument();
  });

  it('shows equipment name in the dropdown when equipment is loaded', async () => {
    mockEquipmentApi.list.mockResolvedValue([
      { id: VALID_UUID, name: 'My Espresso Scale', type: 'scale' },
    ]);

    render(<RecipeListPage />);

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'My Espresso Scale' })).toBeInTheDocument()
    );
  });

  it('shows active equipment filter badge when equipmentId is in URL', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ equipmentId: VALID_UUID }));
    mockEquipmentApi.list.mockResolvedValue([
      { id: VALID_UUID, name: 'Acaia Lunar', type: 'scale' },
    ]);

    render(<RecipeListPage />);

    // The badge shows the equipment name and a remove button
    await waitFor(() =>
      expect(screen.getByLabelText('Remove Equipment filter')).toBeInTheDocument()
    );
    // The name appears at least once (may also appear in the dropdown option)
    expect(screen.getAllByText('Acaia Lunar').length).toBeGreaterThanOrEqual(1);
  });

  it('shows fallback text in badge when equipment name is not found', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ equipmentId: VALID_UUID }));
    mockEquipmentApi.list.mockResolvedValue([]);

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.getByText('Equipment filter active')).toBeInTheDocument());
  });
});

describe('RecipeListPage — taste note filter', () => {
  const VALID_UUID = '22222222-2222-2222-2222-222222222222';

  const sampleTasteNotes = [
    { id: 'root-1', name: 'Fruity', depth: 0, parentId: null },
    { id: 'mid-1', name: 'Berry', depth: 1, parentId: 'root-1' },
    { id: VALID_UUID, name: 'Raspberry', depth: 2, parentId: 'mid-1' },
    { id: 'root-2', name: 'Floral', depth: 0, parentId: null },
    { id: 'mid-2', name: 'Floral', depth: 1, parentId: 'root-2' },
    { id: 'leaf-2', name: 'Rose', depth: 2, parentId: 'mid-2' },
  ];

  it('renders taste note dropdown when taste notes are loaded', async () => {
    mockTasteApi.flat.mockResolvedValue(sampleTasteNotes);

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(screen.getByText('Taste Notes')).toBeInTheDocument();
  });

  it('does NOT render taste note dropdown when no taste notes are loaded', async () => {
    mockTasteApi.flat.mockResolvedValue([]);

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(screen.queryByText('Taste Notes')).not.toBeInTheDocument();
  });

  it('shows leaf taste notes as options in the dropdown', async () => {
    mockTasteApi.flat.mockResolvedValue(sampleTasteNotes);

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    const trigger = screen.getAllByRole('combobox').find((el) =>
      el.textContent?.includes('Select taste notes...')
    );
    expect(trigger).toBeDefined();
    await userEvent.click(trigger!);

    expect(await screen.findByRole('option', { name: 'Raspberry' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Rose' })).toBeInTheDocument();
  });

  it('passes tasteNoteIds to API when URL has a valid UUID', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ tasteNoteIds: VALID_UUID }));
    mockTasteApi.flat.mockResolvedValue(sampleTasteNotes);

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(mockRecipeApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ tasteNoteIds: VALID_UUID }),
    );
  });

  it('does NOT pass tasteNoteIds to API when value is not a valid UUID', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ tasteNoteIds: 'not-a-uuid' }));

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    const callArgs = mockRecipeApi.list.mock.calls[0][0] as Record<string, string>;
    expect(callArgs).not.toHaveProperty('tasteNoteIds');
  });

  it('shows active taste note filter badge when tasteNoteId is in URL', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ tasteNoteIds: VALID_UUID }));
    mockTasteApi.flat.mockResolvedValue(sampleTasteNotes);

    render(<RecipeListPage />);

    // The badge remove button should appear
    await waitFor(() =>
      expect(screen.getByLabelText('Remove Taste Notes filter')).toBeInTheDocument()
    );
    // The name appears at least once (may also appear in the dropdown option)
    expect(screen.getAllByText('Raspberry').length).toBeGreaterThanOrEqual(1);
  });

  it('shows fallback text in badge when taste note name is not found', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ tasteNoteIds: VALID_UUID }));
    mockTasteApi.flat.mockResolvedValue([]);

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.getByText('Taste note filter active')).toBeInTheDocument());
  });

  it('shows taste note filter label in Turkish when locale is tr', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockUseSearchParams.mockReturnValue(makeSearchParams({ tasteNoteIds: VALID_UUID }));
    mockTasteApi.flat.mockResolvedValue(sampleTasteNotes);

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.getByText('Tat Notaları')).toBeInTheDocument());
    // Raspberry appears in the dropdown option and/or badge
    await waitFor(() => expect(screen.getAllByText('Raspberry').length).toBeGreaterThanOrEqual(1));
  });

  it('calls recipeApi.list exactly once when tasteNoteIds is present — regression for infinite loop', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ tasteNoteIds: VALID_UUID }));
    mockTasteApi.flat.mockResolvedValue(sampleTasteNotes);

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(mockRecipeApi.list).toHaveBeenCalledTimes(1);
    expect(mockRecipeApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ tasteNoteIds: VALID_UUID }),
    );
  });

  it('renders active filter badges after Filters heading and before Search filter', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({
      tasteNoteIds: VALID_UUID,
      equipmentId: '11111111-1111-1111-1111-111111111111',
    }));
    mockTasteApi.flat.mockResolvedValue(sampleTasteNotes);
    mockEquipmentApi.list.mockResolvedValue([
      { id: '11111111-1111-1111-1111-111111111111', name: 'Acaia Lunar', type: 'scale' },
    ]);

    render(<RecipeListPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    const filtersHeading = screen.getByRole('heading', { name: 'Filters' });
    const searchLabel = screen.getByText('Search');
    const badge1 = screen.getByLabelText('Remove Equipment filter');
    const badge2 = screen.getByLabelText('Remove Taste Notes filter');

    // Badges should appear after the Filters heading
    expect(filtersHeading.compareDocumentPosition(badge1) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(filtersHeading.compareDocumentPosition(badge2) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();

    // Badges should appear before the Search label
    expect(badge1.compareDocumentPosition(searchLabel) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(badge2.compareDocumentPosition(searchLabel) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });
});

describe('RecipeListPage — property-based tests', () => {
  const VALID_UUID = '11111111-1111-1111-1111-111111111111';

  function resetToDefaults() {
    cleanup();
    vi.clearAllMocks();
    _resetStaticCache();
    mockUseTranslation.mockReturnValue(defaultTranslation);
    mockUseAuth.mockReturnValue(defaultAuth as ReturnType<typeof useAuth>);
    mockUseSearchParams.mockReturnValue(makeSearchParams());
    mockRecipeApi.list.mockResolvedValue([]);
    mockEquipmentApi.list.mockResolvedValue([]);
    mockTasteApi.flat.mockResolvedValue([]);
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
          mockEquipmentApi.list.mockResolvedValue(equipmentList);

          render(<RecipeListPage />);

          await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

          const distinctTypes = new Set(equipmentList.map((e) => e.type));

          for (const type of EQUIPMENT_FILTER_TYPES) {
            const label = `Filter by ${EQUIPMENT_TYPE_LABELS[type]}`;
            if (distinctTypes.has(type)) {
              expect(screen.getByLabelText(label)).toBeInTheDocument();
            } else {
              expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
            }
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  it('Property 6: UUID validation prevents invalid equipmentId from being passed to API', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter(
          (s) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
        ),
        async (invalidId) => {
          resetToDefaults();
          mockUseSearchParams.mockReturnValue(makeSearchParams({ equipmentId: invalidId }));

          render(<RecipeListPage />);

          await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

          const callArgs = mockRecipeApi.list.mock.calls[0]?.[0] as
            | Record<string, string>
            | undefined;
          expect(callArgs).not.toHaveProperty('equipmentId');
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
          if (active.equipmentId) params.equipmentId = VALID_UUID;
          if (active.tasteNoteIds) params.tasteNoteIds = VALID_UUID;
          if (active.search) params.search = 'test-search';

          mockUseSearchParams.mockReturnValue(makeSearchParams(params));

          render(<RecipeListPage />);

          await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

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
        },
      ),
      { numRuns: 30 },
    );
  });
});
