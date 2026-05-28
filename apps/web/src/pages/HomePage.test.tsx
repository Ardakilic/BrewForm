import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { HomePage } from './HomePage.tsx';
import type { RecipeListItem } from '../api/types.ts';

vi.mock('react-router', () => ({
  Link: (
    { to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown },
  ) => <a href={to} {...props}>{children}</a>,
}));

vi.mock('../contexts/I18nContext', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../api/index.ts', () => {
  const empty = {
    data: [],
    meta: { pagination: { page: 1, perPage: 6, total: 0, totalPages: 0 } },
  };
  return {
    recipeApi: {
      list: vi.fn().mockResolvedValue(empty),
    },
  };
});

import { useTranslation } from '../contexts/I18nContext.tsx';

const mockUseTranslation = vi.mocked(useTranslation);

const enT = (key: string) => {
  const map: Record<string, string> = {
    'app.name': 'BrewForm',
    'app.tagline': 'Coffee brewing recipes and tasting notes',
    'common.browseRecipes': 'Browse Recipes',
    'nav.register': 'Sign Up',
    'home.latestRecipes': 'Latest Recipes',
    'home.popularRecipes': 'Popular Recipes',
  };
  return map[key] ?? key;
};

const trT = (key: string) => {
  const map: Record<string, string> = {
    'app.name': 'BrewForm',
    'app.tagline': 'Kahve demleme tarifleri ve tadım notları',
    'common.browseRecipes': 'Tariflere Göz At',
    'nav.register': 'Kayıt Ol',
    'home.latestRecipes': 'Son Tarifler',
    'home.popularRecipes': 'Popüler Tarifler',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
});

describe('HomePage — i18n', () => {
  it('renders tagline and CTA buttons using t() — English', () => {
    render(<HomePage />);

    expect(screen.getByText('Coffee brewing recipes and tasting notes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse Recipes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign Up' })).toBeInTheDocument();
  });

  it('renders tagline and CTA buttons in Turkish when locale is tr', () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<HomePage />);

    expect(screen.getByText('Kahve demleme tarifleri ve tadım notları')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tariflere Göz At' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kayıt Ol' })).toBeInTheDocument();
  });

  it('renders section headings using t() — English', () => {
    render(<HomePage />);

    expect(screen.getByText('Latest Recipes')).toBeInTheDocument();
    expect(screen.getByText('Popular Recipes')).toBeInTheDocument();
  });

  it('renders section headings in Turkish when locale is tr', () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<HomePage />);

    expect(screen.getByText('Son Tarifler')).toBeInTheDocument();
    expect(screen.getByText('Popüler Tarifler')).toBeInTheDocument();
  });

  it('Browse Recipes link points to /recipes', () => {
    render(<HomePage />);

    expect(screen.getByRole('link', { name: 'Browse Recipes' })).toHaveAttribute(
      'href',
      '/recipes',
    );
  });

  it('Sign Up link points to /register', () => {
    render(<HomePage />);

    expect(screen.getByRole('link', { name: 'Sign Up' })).toHaveAttribute('href', '/register');
  });

  it('renders recipe cards with clickable author link when API returns data', async () => {
    const mockResponse = {
      data: [
        {
          id: 'recipe-1',
          slug: 'test-recipe',
          title: 'Test Recipe',
          likeCount: 5,
          commentCount: 2,
          forkCount: 1,
          author: { username: 'testuser', displayName: 'Test User' },
        } as RecipeListItem,
      ],
      meta: { pagination: { page: 1, perPage: 6, total: 1, totalPages: 1 } },
    };
    const { recipeApi } = await import('../api/index.ts');
    vi.mocked(recipeApi.list).mockResolvedValue(mockResponse);

    render(<HomePage />);

    // Title appears in both Latest and Popular sections
    expect(await screen.findAllByText('Test Recipe')).toHaveLength(2);
    // Author links appear in both Latest and Popular sections
    const authorLinks = screen.getAllByRole('link', { name: 'Test User' });
    expect(authorLinks).toHaveLength(2);
    authorLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', '/u/testuser');
    });
  });

  it('renders "unknown" author when author is null', async () => {
    const mockResponse = {
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
    };
    const { recipeApi } = await import('../api/index.ts');
    vi.mocked(recipeApi.list).mockResolvedValue(mockResponse);

    render(<HomePage />);

    const titles = await screen.findAllByText('Anonymous Recipe');
    expect(titles).toHaveLength(2);
    const unknowns = screen.getAllByText('unknown', { exact: false });
    expect(unknowns).toHaveLength(2);
  });

  it('extracts data from the response envelope for both latest and popular sections', async () => {
    const latestResponse = {
      data: [
        {
          id: 'latest-1',
          slug: 'latest',
          title: 'Latest Brew',
          likeCount: 1,
          commentCount: 0,
          forkCount: 0,
          author: { username: 'u1', displayName: 'User 1' },
        } as RecipeListItem,
      ],
      meta: { pagination: { page: 1, perPage: 6, total: 1, totalPages: 1 } },
    };
    const popularResponse = {
      data: [
        {
          id: 'popular-1',
          slug: 'popular',
          title: 'Popular Brew',
          likeCount: 10,
          commentCount: 3,
          forkCount: 2,
          author: { username: 'u2', displayName: 'User 2' },
        } as RecipeListItem,
      ],
      meta: { pagination: { page: 1, perPage: 6, total: 1, totalPages: 1 } },
    };
    const { recipeApi } = await import('../api/index.ts');
    vi.mocked(recipeApi.list)
      .mockResolvedValueOnce(latestResponse)
      .mockResolvedValueOnce(popularResponse);

    render(<HomePage />);

    expect(await screen.findByText('Latest Brew')).toBeInTheDocument();
    expect(await screen.findByText('Popular Brew')).toBeInTheDocument();
  });

  it('handles empty data in response envelope gracefully', async () => {
    const { recipeApi } = await import('../api/index.ts');
    const emptyResponse = {
      data: [],
      meta: { pagination: { page: 1, perPage: 6, total: 0, totalPages: 0 } },
    };
    vi.mocked(recipeApi.list).mockResolvedValue(emptyResponse);

    render(<HomePage />);

    expect(screen.getByText('Latest Recipes')).toBeInTheDocument();
    expect(screen.getByText('Popular Recipes')).toBeInTheDocument();
    expect(screen.queryByText(/❤️/)).not.toBeInTheDocument();
  });

  it('shows recipe card skeleton placeholders while loading', async () => {
    const { recipeApi } = await import('../api/index.ts');
    let resolvePromise!: (value: any) => void;
    const deferred = new Promise<any>((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(recipeApi.list).mockReturnValue(deferred);

    render(<HomePage />);

    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);

    resolvePromise({
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

    await waitFor(() => {
      expect(document.querySelectorAll('.animate-pulse').length).toBe(0);
    });

    expect(await screen.findAllByText('Loaded Recipe')).toHaveLength(2);
  });
});
