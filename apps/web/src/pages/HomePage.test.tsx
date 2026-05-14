import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomePage } from './HomePage';

vi.mock('react-router', () => ({
  Link: (
    { to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown },
  ) => <a href={to} {...props}>{children}</a>,
}));

vi.mock('../contexts/I18nContext', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../api/index.ts', () => ({
  recipeApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

import { useTranslation } from '../contexts/I18nContext';

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
    const mockRecipes = [
      {
        id: 'recipe-1',
        slug: 'test-recipe',
        title: 'Test Recipe',
        likeCount: 5,
        commentCount: 2,
        forkCount: 1,
        author: { username: 'testuser', displayName: 'Test User' },
      },
    ];
    const { recipeApi } = await import('../api/index.ts');
    vi.mocked(recipeApi.list).mockResolvedValue(mockRecipes);

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
});
