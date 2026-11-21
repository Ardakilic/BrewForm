import type { EquipmentOutput, RecipeListItemOutput } from '@brewform/shared/schemas';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type RecipeListResponse, RecipeListView } from './RecipeListView.tsx';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    useSearchParams: vi.fn(),
  };
});

vi.mock('../../contexts/I18nContext.tsx', async () => {
  const { createContext } = await import('react');
  const { t: fallbackT } = await import('@brewform/shared/i18n');
  const useTranslation = vi.fn();
  return {
    I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useTranslation,
    // `useSafeT()` reads `I18nContext` directly (not via `useTranslation`), so the
    // mocked context delegates to the mocked hook — per-test `mockReturnValue`
    // setups apply to both translation paths.
    I18nContext: createContext({
      get locale() {
        return useTranslation()?.locale ?? 'en';
      },
      setLocale: () => undefined,
      get t() {
        return useTranslation()?.t ?? fallbackT;
      },
      availableLocales: ['en', 'tr'],
    }),
  };
});

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
    'recipe.filter.author': 'Author',
    'recipe.filter.authorPlaceholder': 'Search by author...',
    'recipe.filter.dateFrom': 'From date',
    'recipe.filter.dateTo': 'To date',
    'recipe.filter.minRating': 'Min rating',
    'recipe.filter.maxRating': 'Max rating',
    'a11y.filter.remove': 'Remove {label} filter',
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
    [
      {
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
      },
    ],
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

  it('should render the author filter input', () => {
    renderView({ recipesResponse: { data: [], meta: {} } });
    expect(screen.getByPlaceholderText('Search by author...')).toBeInTheDocument();
  });

  // advanced-search (wave 6): the UI cannot produce the API's 400 for over-long values.
  it('caps the search input at 200 and the author input at 100 characters', () => {
    renderView({ recipesResponse: { data: [], meta: {} } });
    expect(screen.getByPlaceholderText('Search recipes...')).toHaveAttribute('maxLength', '200');
    expect(screen.getByPlaceholderText('Search by author...')).toHaveAttribute('maxLength', '100');
  });

  it('should render the date range filter inputs', () => {
    renderView({ recipesResponse: { data: [], meta: {} } });
    expect(screen.getByLabelText('From date')).toBeInTheDocument();
    expect(screen.getByLabelText('To date')).toBeInTheDocument();
  });

  it('should render the rating range filter inputs', () => {
    renderView({ recipesResponse: { data: [], meta: {} } });
    expect(screen.getByLabelText('Min rating')).toBeInTheDocument();
    expect(screen.getByLabelText('Max rating')).toBeInTheDocument();
  });

  it('should render and clear an active author filter badge', () => {
    const setSearchParams = vi.fn();
    mockUseSearchParams.mockReturnValue([
      new URLSearchParams({ author: 'Alice' }),
      setSearchParams,
    ] as ReturnType<typeof useSearchParams>);
    renderView({
      recipesResponse: { data: [], meta: {} },
      initialEntries: ['/?author=Alice&brewMethod=v60'],
    });
    expect(screen.getByText('Alice')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Author filter' }));
    expect(setSearchParams).toHaveBeenCalledTimes(1);
    // useListUrlState passes the params built on the latest (router) URL as a value.
    const passed = setSearchParams.mock.calls[0][0] as URLSearchParams;
    expect(passed.get('author')).toBeNull();
    expect(passed.get('brewMethod')).toBe('v60');
  });
});

/** Data-router hydrate fallback for the real-router pagination test (renders nothing). */
const HydrateFallback = () => null;

describe('RecipeListView — pagination under a real router (regression)', () => {
  it('clicking Next on a 2-page result sets page=2 and the loader receives it with filters intact', async () => {
    const actualRouter = await vi.importActual<typeof import('react-router')>('react-router');
    // Use the real URL-backed hook for this test instead of the module-level stub.
    mockUseSearchParams.mockImplementation(actualRouter.useSearchParams);
    const { extractListParams } = await import('../../utils/recipe-filters.ts');
    const loaderCalls: Record<string, string>[] = [];
    const loader = vi.fn(({ request }: { request: Request }) => {
      loaderCalls.push(extractListParams(new URL(request.url).searchParams));
      return null;
    });
    const router = createMemoryRouter(
      [
        {
          path: '/recipes',
          loader,
          HydrateFallback,
          element: (
            <RecipeListView
              source="all"
              recipesResponse={{ data: [makeRecipe()], meta: { pagination: { total: 20 } } }}
              equipment={[]}
              tasteNotes={[]}
              pageTitle="Recipes"
              seoDescription="Browse recipes"
            />
          ),
        },
      ],
      { initialEntries: ['/recipes?brewMethod=v60&sortBy=rating'] },
    );
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByText('Next'));

    await waitFor(() => {
      expect(router.state.location.search).toBe('?brewMethod=v60&sortBy=rating&page=2');
    });
    await waitFor(() => expect(loaderCalls).toHaveLength(2));
    expect(loaderCalls[1]).toMatchObject({ page: '2', brewMethod: 'v60', sortBy: 'rating' });
  });
});

describe('RecipeListView — debounced search and author inputs under a real router', () => {
  /** Renders the view at `entry` (after an `/elsewhere` entry) with a recording loader. */
  async function renderAt(entry: string) {
    const actualRouter = await vi.importActual<typeof import('react-router')>('react-router');
    mockUseSearchParams.mockImplementation(actualRouter.useSearchParams);
    const { extractListParams } = await import('../../utils/recipe-filters.ts');
    const loaderCalls: Record<string, string>[] = [];
    const router = createMemoryRouter(
      [
        {
          path: '/recipes',
          loader: ({ request }: { request: Request }) => {
            loaderCalls.push(extractListParams(new URL(request.url).searchParams));
            return null;
          },
          HydrateFallback,
          element: (
            <RecipeListView
              source="all"
              recipesResponse={{ data: [], meta: {} }}
              equipment={[]}
              tasteNotes={[]}
              pageTitle="Recipes"
              seoDescription="Browse recipes"
            />
          ),
        },
        { path: '/elsewhere', element: <p>elsewhere</p> },
      ],
      { initialEntries: ['/elsewhere', entry], initialIndex: 1 },
    );
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
    await screen.findByPlaceholderText('Search recipes...');
    return { router, loaderCalls };
  }

  /** The search box. */
  const searchBox = () => screen.getByPlaceholderText('Search recipes...') as HTMLInputElement;
  /** The author box. */
  const authorBox = () => screen.getByPlaceholderText('Search by author...') as HTMLInputElement;

  it('typing in the search box runs the loader once per pause and replaces history', async () => {
    const { router, loaderCalls } = await renderAt('/recipes?brewMethod=v60&page=2');
    const before = loaderCalls.length;

    await userEvent.type(searchBox(), 'kenya');

    await waitFor(() => expect(router.state.location.search).toBe('?brewMethod=v60&search=kenya'), {
      timeout: 2000,
    });
    await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
    expect(loaderCalls.length - before).toBe(1);
    expect(loaderCalls.at(-1)).toMatchObject({ search: 'kenya', brewMethod: 'v60', page: '1' });
    expect(router.state.historyAction).toBe('REPLACE');

    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe('/elsewhere');
  });

  it('typing in the author box commits author after the pause', async () => {
    const { router } = await renderAt('/recipes');

    await userEvent.type(authorBox(), 'alice');

    await waitFor(() => expect(router.state.location.search).toBe('?author=alice'), {
      timeout: 2000,
    });
  });

  it('the search box re-syncs on Back', async () => {
    const { router } = await renderAt('/recipes?search=kenya');
    const brewMethodSelect = screen.getByRole('option', { name: 'V60' }).closest('select');
    fireEvent.change(brewMethodSelect as HTMLSelectElement, { target: { value: 'v60' } });
    await waitFor(() => expect(router.state.location.search).toBe('?search=kenya&brewMethod=v60'));

    await act(() => router.navigate('/recipes'));
    await waitFor(() => expect(searchBox().value).toBe(''));

    await act(() => router.navigate(-1));
    await waitFor(() => expect(searchBox().value).toBe('kenya'));
  });

  it('Clear Filters empties the search and author boxes', async () => {
    await renderAt('/recipes?search=kenya&author=alice');
    expect(searchBox().value).toBe('kenya');
    expect(authorBox().value).toBe('alice');

    fireEvent.click(screen.getByText('Clear Filters'));

    await waitFor(() => {
      expect(searchBox().value).toBe('');
      expect(authorBox().value).toBe('');
    });
  });

  it('removing the author badge empties the author box', async () => {
    const { router } = await renderAt('/recipes?author=alice&sortBy=rating');

    fireEvent.click(screen.getByRole('button', { name: 'Remove Author filter' }));

    await waitFor(() => expect(router.state.location.search).toBe('?sortBy=rating'));
    await waitFor(() => expect(authorBox().value).toBe(''));
  });
});
