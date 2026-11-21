import type { RecipeListItemOutput } from '@brewform/shared/schemas';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteErrorState } from '../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../test-utils/render.tsx';
import { loader } from './HomePage.data.ts';
import { HomePage } from './HomePage.tsx';

vi.mock('../api/index.ts', () => ({
  recipeApi: {
    list: vi.fn(),
  },
}));

import { recipeApi } from '../api/index.ts';

const mockRecipeApi = vi.mocked(recipeApi);

const defaultPagination = { page: 1, perPage: 6, total: 0, totalPages: 0 };
const emptyResponse = {
  success: true as const,
  data: [],
  meta: { requestId: 'test', pagination: defaultPagination },
};

/** Builds a `RecipeListItemOutput` mock with all required fields. */
function makeRecipe(overrides: Partial<RecipeListItemOutput> = {}): RecipeListItemOutput {
  return {
    id: 'r1',
    slug: 'test-recipe',
    title: 'Test Recipe',
    authorId: 'a1',
    visibility: 'public',
    currentVersionId: null,
    likeCount: 0,
    commentCount: 0,
    forkCount: 0,
    forkedFromId: null,
    featured: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    author: { id: 'a1', username: 'testuser', displayName: 'Test User' },
    ...overrides,
  };
}

/** Renders `/` through the real home loader inside the app providers. */
function renderHomePage() {
  return renderWithAppProviders(
    [{ path: '/', element: <HomePage />, loader, errorElement: <RouteErrorState /> }],
    { initialEntries: ['/'] },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockRecipeApi.list.mockResolvedValue(emptyResponse);
});

describe('HomePage — i18n', () => {
  it('renders tagline and CTA buttons using t() — English', async () => {
    renderHomePage();

    expect(await screen.findByText('Coffee brewing recipes and tasting notes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse Recipes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign Up' })).toBeInTheDocument();
  });

  it('renders tagline and CTA buttons in Turkish when locale is tr', async () => {
    localStorage.setItem('brewform_locale', 'tr');

    renderHomePage();

    expect(await screen.findByText('Kahve demleme tarifleri ve tadım notları')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tariflere Göz At' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kayıt Ol' })).toBeInTheDocument();
  });

  it('renders section headings using t() — English', async () => {
    renderHomePage();

    expect(await screen.findByText('Latest Recipes')).toBeInTheDocument();
    expect(screen.getByText('Popular Recipes')).toBeInTheDocument();
  });

  it('renders section headings in Turkish when locale is tr', async () => {
    localStorage.setItem('brewform_locale', 'tr');

    renderHomePage();

    expect(await screen.findByText('Son Tarifler')).toBeInTheDocument();
    expect(screen.getByText('Popüler Tarifler')).toBeInTheDocument();
  });

  it('Browse Recipes link points to /recipes', async () => {
    renderHomePage();

    await screen.findByRole('link', { name: 'Browse Recipes' });
    expect(screen.getByRole('link', { name: 'Browse Recipes' })).toHaveAttribute(
      'href',
      '/recipes',
    );
  });

  it('Sign Up link points to /register', async () => {
    renderHomePage();

    await screen.findByRole('link', { name: 'Sign Up' });
    expect(screen.getByRole('link', { name: 'Sign Up' })).toHaveAttribute('href', '/register');
  });

  it('renders recipe cards with clickable author link when API returns data', async () => {
    mockRecipeApi.list.mockResolvedValue({
      success: true,
      data: [
        makeRecipe({
          id: 'recipe-1',
          slug: 'test-recipe',
          title: 'Test Recipe',
          likeCount: 5,
          commentCount: 2,
          forkCount: 1,
          author: { id: 'a1', username: 'testuser', displayName: 'Test User' },
        }),
      ],
      meta: { requestId: 'test', pagination: { page: 1, perPage: 6, total: 1, totalPages: 1 } },
    });

    renderHomePage();

    expect(await screen.findAllByText('Test Recipe')).toHaveLength(2);
    const authorButtons = screen.getAllByRole('button', { name: 'Test User' });
    expect(authorButtons).toHaveLength(2);
  });

  it('renders "Deleted user" when author is null (the account was deleted)', async () => {
    mockRecipeApi.list.mockResolvedValue({
      success: true,
      data: [
        {
          ...makeRecipe(),
          id: 'recipe-2',
          slug: 'no-author',
          title: 'Anonymous Recipe',
          likeCount: 3,
          author: null,
        },
      ],
      meta: { requestId: 'test', pagination: { page: 1, perPage: 6, total: 1, totalPages: 1 } },
    });

    renderHomePage();

    const titles = await screen.findAllByText('Anonymous Recipe');
    expect(titles).toHaveLength(2);
    expect(screen.getAllByText('Deleted user')).toHaveLength(2);
    expect(screen.queryByText('unknown', { exact: false })).not.toBeInTheDocument();
  });

  it('extracts data from the response envelope for both latest and popular sections', async () => {
    mockRecipeApi.list
      .mockResolvedValueOnce({
        success: true,
        data: [
          makeRecipe({
            id: 'latest-1',
            slug: 'latest',
            title: 'Latest Brew',
            likeCount: 1,
            author: { id: 'u1', username: 'u1', displayName: 'User 1' },
          }),
        ],
        meta: { requestId: 'test', pagination: { page: 1, perPage: 6, total: 1, totalPages: 1 } },
      })
      .mockResolvedValueOnce({
        success: true,
        data: [
          makeRecipe({
            id: 'popular-1',
            slug: 'popular',
            title: 'Popular Brew',
            likeCount: 10,
            commentCount: 3,
            forkCount: 2,
            author: { id: 'u2', username: 'u2', displayName: 'User 2' },
          }),
        ],
        meta: { requestId: 'test', pagination: { page: 1, perPage: 6, total: 1, totalPages: 1 } },
      });

    renderHomePage();

    expect(await screen.findByText('Latest Brew')).toBeInTheDocument();
    expect(await screen.findByText('Popular Brew')).toBeInTheDocument();
  });

  it('handles empty data in response envelope gracefully', async () => {
    renderHomePage();

    await waitFor(() => {
      expect(screen.getByText('Latest Recipes')).toBeInTheDocument();
      expect(screen.getByText('Popular Recipes')).toBeInTheDocument();
    });
    expect(screen.queryByText(/❤️/)).not.toBeInTheDocument();
  });

  it('renders recipes without skeleton placeholders after loader resolves', async () => {
    mockRecipeApi.list.mockResolvedValue({
      success: true,
      data: [
        {
          ...makeRecipe(),
          id: '1',
          slug: 'test',
          title: 'Loaded Recipe',
          author: null,
        } as unknown as RecipeListItemOutput,
      ],
      meta: { requestId: 'test', pagination: { page: 1, perPage: 6, total: 1, totalPages: 1 } },
    });

    renderHomePage();

    const recipes = await screen.findAllByText('Loaded Recipe');
    expect(recipes).toHaveLength(2);
    expect(document.querySelectorAll('.animate-pulse').length).toBe(0);
  });
});

describe('HomePage loader', () => {
  it('forwards request.signal to both recipe list requests', async () => {
    const controller = new AbortController();
    await loader({
      request: new Request('http://localhost/', { signal: controller.signal }),
      params: {},
      context: undefined,
    } as never);

    expect(mockRecipeApi.list).toHaveBeenCalledTimes(2);
    expect(mockRecipeApi.list).toHaveBeenCalledWith(
      { perPage: '6', sortBy: 'createdAt' },
      { signal: expect.any(AbortSignal) },
    );
    expect(mockRecipeApi.list).toHaveBeenCalledWith(
      { perPage: '6', sortBy: 'likeCount' },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('renders the route error state instead of empty grids when the load fails', async () => {
    mockRecipeApi.list.mockRejectedValue(new Error('down'));

    renderHomePage();

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('Latest Recipes')).not.toBeInTheDocument();
  });
});
