import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import type { EquipmentOutput, RecipeListItemOutput } from '@brewform/shared/schemas';
import { type RecipeListResponse, RecipeListView } from './RecipeListView.tsx';

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

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: () => null,
}));

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

vi.mock('@brewform/shared/constants', () => ({
  BREW_METHODS_LIST: [{ value: 'v60', label: 'V60' }],
  DRINK_TYPES_LIST: [{ value: 'pour_over', label: 'Pour Over' }],
  VISIBILITY_STATES_LIST: [
    { value: 'public', label: 'Public' },
    { value: 'draft', label: 'Draft' },
  ],
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
import { useTranslation } from '../../contexts/I18nContext.tsx';

const mockUseSearchParams = vi.mocked(useSearchParams);
const mockUseTranslation = vi.mocked(useTranslation);

const enT = (key: string) => {
  const map: Record<string, string> = {
    'recipe.list.filters': 'Filters',
    'recipe.list.clearFilters': 'Clear Filters',
    'recipe.list.search': 'Search',
    'recipe.list.searchPlaceholder': 'Search recipes...',
    'recipe.brewMethod': 'Brew Method',
    'recipe.drinkType': 'Drink Type',
    'recipe.list.sortBy': 'Sort By',
    'recipe.list.newest': 'Newest',
    'recipe.list.mostLiked': 'Most Liked',
    'recipe.list.topRated': 'Top Rated',
    'recipe.list.noResults': 'No recipes found.',
    'recipe.list.all': 'All',
    'recipe.list.visibilityAdmin': 'Visibility (Admins only)',
    'recipe.list.page': 'Page {page} of {total}',
    'recipe.list.equipmentFilter': 'Equipment',
    'recipe.list.equipmentFilterActive': 'Equipment filter active',
    'recipe.mainBrewer': 'Main Brewer',
    'recipe.list.tasteNotesFilter': 'Taste Notes',
    'recipe.list.tasteNoteFilterActive': 'Taste note filter active',
    'recipe.list.coffeeVarietyFilter': 'Coffee Variety',
    'recipe.list.coffeeVarietyActive': 'Coffee variety filter active',
    'common.loading': 'Loading...',
    'common.previous': 'Previous',
    'common.next': 'Next',
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

function makeRecipe(overrides: Partial<RecipeListItemOutput> = {}): RecipeListItemOutput {
  return {
    id: 'r1',
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
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    author: {
      id: 'u1',
      username: 'alice',
      displayName: 'Alice',
    },
    ...overrides,
  };
}

/** Builds a minimal `EquipmentOutput` mock with all required fields. */
function makeEquipment(overrides: Partial<EquipmentOutput> = {}): EquipmentOutput {
  return {
    id: 'e1',
    name: 'Comandante C40',
    type: 'grinder',
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

function renderView(
  props: Partial<Parameters<typeof RecipeListView>[0]> & {
    initialEntries?: string[];
  } = {},
) {
  const {
    initialEntries = ['/'],
    source = 'all' as const,
    recipesResponse = { data: [], meta: {} } as RecipeListResponse,
    equipment = [],
    tasteNotes = [],
    pageTitle = 'Recipes',
    seoDescription = 'Browse recipes',
    ...rest
  } = props;
  const router = createMemoryRouter(
    [{
      path: '/',
      element: (
        <RecipeListView
          source={source}
          recipesResponse={recipesResponse}
          equipment={equipment}
          tasteNotes={tasteNotes}
          pageTitle={pageTitle}
          seoDescription={seoDescription}
          {...rest}
        />
      ),
    }],
    { initialEntries },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockUseSearchParams.mockReturnValue(makeSearchParams());
});

describe('RecipeListView', () => {
  it('should render a RecipeCard for each recipe in recipesResponse.data', () => {
    const recipes = [
      makeRecipe({ id: 'r1', slug: 'recipe-1', title: 'Recipe One' }),
      makeRecipe({ id: 'r2', slug: 'recipe-2', title: 'Recipe Two' }),
    ];
    renderView({ recipesResponse: { data: recipes, meta: {} } });
    expect(screen.getByText('Recipe One')).toBeInTheDocument();
    expect(screen.getByText('Recipe Two')).toBeInTheDocument();
  });

  it('should show the empty state when data is empty', () => {
    renderView({ recipesResponse: { data: [], meta: {} } });
    expect(screen.getByText('No recipes found.')).toBeInTheDocument();
  });

  it('should show the Clear button when hasActiveFilters is true', () => {
    // brewMethod is set → hasActiveFilters true
    mockUseSearchParams.mockReturnValue(makeSearchParams({ brewMethod: 'v60' }));
    renderView({ recipesResponse: { data: [], meta: {} } });
    expect(screen.getByText('Clear Filters')).toBeInTheDocument();
  });

  it('should NOT show the Clear button when no filters are active', () => {
    renderView({ recipesResponse: { data: [], meta: {} } });
    expect(screen.queryByText('Clear Filters')).not.toBeInTheDocument();
  });

  it('should NOT render the admin visibility filter by default', () => {
    renderView({ recipesResponse: { data: [], meta: {} } });
    expect(screen.queryByText('Visibility (Admins only)')).not.toBeInTheDocument();
  });

  it('should render the admin visibility filter when showAdminVisibilityFilter is true', () => {
    renderView({ recipesResponse: { data: [], meta: {} }, showAdminVisibilityFilter: true });
    expect(screen.getByText('Visibility (Admins only)')).toBeInTheDocument();
  });

  it('should hide pagination when total <= PER_PAGE (12)', () => {
    renderView({
      recipesResponse: {
        data: [makeRecipe()],
        meta: { pagination: { total: 5 } },
      },
    });
    expect(screen.queryByText('Previous')).not.toBeInTheDocument();
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });

  it('should show pagination when total > PER_PAGE (12)', () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ page: '2' }));
    renderView({
      recipesResponse: {
        data: [makeRecipe()],
        meta: { pagination: { total: 25 } },
      },
    });
    // Page 2 of 3 → Previous visible, Next visible, page label "Page 2 of 3"
    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('should render ActiveFilterBadge for an active equipmentId (valid UUID)', () => {
    const equipmentUuid = '11111111-1111-1111-1111-111111111111';
    mockUseSearchParams.mockReturnValue(makeSearchParams({ equipmentId: equipmentUuid }));
    renderView({
      recipesResponse: { data: [], meta: {} },
      equipment: [makeEquipment({ id: equipmentUuid, name: 'Comandante C40', type: 'grinder' })],
    });
    // The badge label "Equipment" + value "Comandante C40" both render.
    // The select dropdown also contains the name as an <option>, so assert
    // on the badge's specific structure (Equipment label is unique).
    expect(screen.getByText('Equipment')).toBeInTheDocument();
    // Confirm the equipment name appears at least once (badge value or option)
    expect(screen.getAllByText('Comandante C40').length).toBeGreaterThan(0);
  });

  it('should render ActiveFilterBadge for an active mainBrewer filter', () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ mainBrewer: 'James Hoffmann' }));
    renderView({ recipesResponse: { data: [], meta: {} } });
    expect(screen.getByText('James Hoffmann')).toBeInTheDocument();
  });
});
