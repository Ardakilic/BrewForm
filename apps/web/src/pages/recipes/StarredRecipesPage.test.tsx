import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

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

vi.mock('../../utils/recipe-filters.ts', async (importOriginal) => {
  const actual = await importOriginal() as {
    extractListParams: (sp: URLSearchParams) => Record<string, string>;
  };
  return {
    extractListParams: vi.fn(actual.extractListParams),
  };
});

vi.mock('../../api/index.ts', () => ({
  recipeApi: { starred: vi.fn() },
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
import { recipeApi } from '../../api/index.ts';
import { getEquipmentCached, getTasteNotesCached } from '../../api/static-cache.ts';
import { loader, StarredRecipesPage } from './StarredRecipesPage.tsx';

const mockUseSearchParams = vi.mocked(useSearchParams);
const mockUseTranslation = vi.mocked(useTranslation);
const mockUseAuth = vi.mocked(useAuth);
const mockRecipeApiStarred = vi.mocked(recipeApi.starred);
const mockGetEquipmentCached = vi.mocked(getEquipmentCached);
const mockGetTasteNotesCached = vi.mocked(getTasteNotesCached);

// ── Render helper ──────────────────────────────────────────────────────────

const HydrateFallback = () => null;

function renderStarredPage(initialEntries = ['/recipes/starred']) {
  const router = createMemoryRouter(
    [
      {
        path: '/recipes/starred',
        element: <StarredRecipesPage />,
        loader,
        HydrateFallback,
      },
    ],
    { initialEntries },
  );
  return render(
    <I18nProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </I18nProvider>,
  );
}

// ── Translation helpers ────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
    'recipe.starred.title': 'Starred Recipes',
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
    'recipe.starred.noResults': "You haven't starred any recipes yet.",
    'recipe.starred.loginRequired': 'Please log in to view your starred recipes.',
    'recipe.list.all': 'All',
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

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

const defaultAuth = {
  user: {
    id: 'user-1',
    email: 'a@a.com',
    emailVerifiedAt: null,
    username: 'testuser',
    displayName: null,
    avatarUrl: null,
    isAdmin: false,
    onboardingCompleted: true,
  },
  isAuthenticated: true,
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
  mockRecipeApiStarred.mockResolvedValue({ data: [], meta: { pagination: { total: 0 } } });
  mockGetEquipmentCached.mockResolvedValue([]);
  mockGetTasteNotesCached.mockResolvedValue([]);
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockUseAuth.mockReturnValue(defaultAuth as ReturnType<typeof useAuth>);
  mockUseSearchParams.mockReturnValue(makeSearchParams());
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('StarredRecipesPage', () => {
  it('renders page title and filter labels', async () => {
    renderStarredPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Starred Recipes' })).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByText('Brew Method')).toBeInTheDocument();
    expect(screen.getByText('Drink Type')).toBeInTheDocument();
    expect(screen.getByText('Sort By')).toBeInTheDocument();
  });

  it('shows login required message when not authenticated', async () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth,
      isAuthenticated: false,
      user: null,
    } as ReturnType<typeof useAuth>);

    renderStarredPage();

    await waitFor(() => {
      expect(
        screen.getByText('Please log in to view your starred recipes.'),
      ).toBeInTheDocument();
    });
  });

  it('shows empty state when no starred recipes', async () => {
    renderStarredPage();

    await waitFor(() => {
      expect(
        screen.getByText("You haven't starred any recipes yet."),
      ).toBeInTheDocument();
    });
  });

  it('renders recipe cards with clickable author link when API returns data', async () => {
    mockRecipeApiStarred.mockResolvedValue({
      data: [
        {
          id: 'recipe-1',
          slug: 'test-recipe',
          title: 'Test Recipe',
          visibility: 'public',
          likeCount: 5,
          commentCount: 2,
          forkCount: 1,
          author: { username: 'testuser', displayName: 'Test User' },
          currentVersion: {
            brewMethod: 'espresso_machine',
            drinkType: 'espresso',
            rating: null,
          },
          createdAt: '2025-01-01T00:00:00Z',
        },
      ],
      meta: { pagination: { total: 1 } },
    });

    renderStarredPage();

    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument();
    });

    const authorButton = screen.getByRole('button', { name: 'Test User' });
    expect(authorButton).toBeInTheDocument();
  });

  it('passes filters to API when search params are present', async () => {
    renderStarredPage(['/recipes/starred?brewMethod=espresso_machine']);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Starred Recipes' })).toBeInTheDocument();
    });

    expect(mockRecipeApiStarred).toHaveBeenCalledWith(
      expect.objectContaining({ brewMethod: 'espresso_machine' }),
    );
  });

  it('transitions from loading to loaded state when loader resolves', async () => {
    let resolveLoader: (
      value: { data: never[]; meta: { pagination: { total: number } } },
    ) => void;
    const deferred = new Promise<{
      data: never[];
      meta: { pagination: { total: number } };
    }>((resolve) => {
      resolveLoader = resolve;
    });
    mockRecipeApiStarred.mockReturnValueOnce(deferred);

    renderStarredPage();

    // HydrateFallback renders null; component is not yet present
    expect(
      screen.queryByRole('heading', { name: 'Starred Recipes' }),
    ).not.toBeInTheDocument();

    resolveLoader!({ data: [], meta: { pagination: { total: 0 } } });

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Starred Recipes' }),
      ).toBeInTheDocument();
    });
  });
});
