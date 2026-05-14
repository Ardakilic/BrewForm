import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { _resetStaticCache, StarredRecipesPage } from './StarredRecipesPage';

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
  recipeApi: { list: vi.fn(), starred: vi.fn() },
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

const mockUseSearchParams = vi.mocked(useSearchParams);
const mockUseTranslation = vi.mocked(useTranslation);
const mockUseAuth = vi.mocked(useAuth);
const mockRecipeApi = vi.mocked(recipeApi);
const mockEquipmentApi = vi.mocked(equipmentApi);
const mockTasteApi = vi.mocked(tasteApi);

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
  _resetStaticCache();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockUseAuth.mockReturnValue(defaultAuth as ReturnType<typeof useAuth>);
  mockUseSearchParams.mockReturnValue(makeSearchParams());
  mockRecipeApi.starred.mockResolvedValue([]);
  mockEquipmentApi.list.mockResolvedValue([]);
  mockTasteApi.flat.mockResolvedValue([]);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('StarredRecipesPage', () => {
  it('renders page title and filter labels', async () => {
    render(<StarredRecipesPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(screen.getByRole('heading', { name: 'Starred Recipes' })).toBeInTheDocument();
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

    render(<StarredRecipesPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(screen.getByText('Please log in to view your starred recipes.')).toBeInTheDocument();
  });

  it('shows empty state when no starred recipes', async () => {
    mockRecipeApi.starred.mockResolvedValue([]);

    render(<StarredRecipesPage />);

    await waitFor(() => {
      expect(screen.getByText("You haven't starred any recipes yet.")).toBeInTheDocument();
    });
  });

  it('renders recipe cards with clickable author link when API returns data', async () => {
    mockRecipeApi.starred.mockResolvedValue([
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
    ]);

    render(<StarredRecipesPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(screen.getByText('Test Recipe')).toBeInTheDocument();

    // Author display name should be visible as a link
    const authorLink = screen.getByRole('link', { name: 'Test User' });
    expect(authorLink).toHaveAttribute('href', '/u/testuser');
  });

  it('passes filters to API when search params are present', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ brewMethod: 'espresso_machine' }));

    render(<StarredRecipesPage />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(mockRecipeApi.starred).toHaveBeenCalledWith(
      expect.objectContaining({ brewMethod: 'espresso_machine' }),
    );
  });
});
