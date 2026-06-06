import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { HomePage, loader } from './HomePage.tsx';
import { I18nProvider } from '../contexts/I18nContext.tsx';
import type { RecipeListItem } from '../api/types.ts';

vi.mock('../api/index.ts', () => ({
  recipeApi: {
    list: vi.fn(),
  },
}));

import { recipeApi } from '../api/index.ts';

const mockRecipeApi = vi.mocked(recipeApi);

const defaultPagination = { page: 1, perPage: 6, total: 0, totalPages: 0 };
const emptyResponse = { data: [], meta: { pagination: defaultPagination } };

function renderHomePage() {
  const router = createMemoryRouter(
    [{ path: '/', element: <HomePage />, loader }],
    { initialEntries: ['/'] },
  );
  return render(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>,
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
      data: [
        {
          id: 'recipe-1',
          slug: 'test-recipe',
          title: 'Test Recipe',
          likeCount: 5,
          commentCount: 2,
          forkCount: 1,
          author: { id: 'a1', username: 'testuser', displayName: 'Test User' },
        } as RecipeListItem,
      ],
      meta: { pagination: { page: 1, perPage: 6, total: 1, totalPages: 1 } },
    });

    renderHomePage();

    expect(await screen.findAllByText('Test Recipe')).toHaveLength(2);
    const authorButtons = screen.getAllByRole('button', { name: 'Test User' });
    expect(authorButtons).toHaveLength(2);
  });

  it('renders "unknown" author when author is null', async () => {
    mockRecipeApi.list.mockResolvedValue({
      data: [
        {
          id: 'recipe-2',
          slug: 'no-author',
          title: 'Anonymous Recipe',
          likeCount: 3,
          commentCount: 0,
          forkCount: 0,
          author: null,
        } as RecipeListItem,
      ],
      meta: { pagination: { page: 1, perPage: 6, total: 1, totalPages: 1 } },
    });

    renderHomePage();

    const titles = await screen.findAllByText('Anonymous Recipe');
    expect(titles).toHaveLength(2);
    const unknowns = screen.getAllByText('unknown', { exact: false });
    expect(unknowns).toHaveLength(2);
  });

  it('extracts data from the response envelope for both latest and popular sections', async () => {
    mockRecipeApi.list
      .mockResolvedValueOnce({
        data: [
          {
            id: 'latest-1',
            slug: 'latest',
            title: 'Latest Brew',
            likeCount: 1,
            commentCount: 0,
            forkCount: 0,
            author: { id: 'u1', username: 'u1', displayName: 'User 1' },
          } as RecipeListItem,
        ],
        meta: { pagination: { page: 1, perPage: 6, total: 1, totalPages: 1 } },
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'popular-1',
            slug: 'popular',
            title: 'Popular Brew',
            likeCount: 10,
            commentCount: 3,
            forkCount: 2,
            author: { id: 'u2', username: 'u2', displayName: 'User 2' },
          } as RecipeListItem,
        ],
        meta: { pagination: { page: 1, perPage: 6, total: 1, totalPages: 1 } },
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
      data: [
        {
          id: '1',
          slug: 'test',
          title: 'Loaded Recipe',
          likeCount: 0,
          commentCount: 0,
          forkCount: 0,
          author: null,
        } as RecipeListItem,
      ],
      meta: { pagination: { page: 1, perPage: 6, total: 1, totalPages: 1 } },
    });

    renderHomePage();

    const recipes = await screen.findAllByText('Loaded Recipe');
    expect(recipes).toHaveLength(2);
    expect(document.querySelectorAll('.animate-pulse').length).toBe(0);
  });
});
