import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ForkCard } from './ForkCard';

vi.mock('../../contexts/I18nContext', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

import { useTranslation } from '../../contexts/I18nContext';

const mockUseTranslation = vi.mocked(useTranslation);

const enT = (key: string) => {
  const map: Record<string, string> = {
    'recipe.fork': 'Fork Recipe',
    'recipe.forkDescription':
      'Forking creates your own personal copy of this recipe that you can freely modify and build upon.',
  };
  return map[key] ?? key;
};

const trT = (key: string) => {
  const map: Record<string, string> = {
    'recipe.fork': 'Tarifi Çatalla',
    'recipe.forkDescription':
      'Çatallama, bu tarifin kendi kişisel kopyanızı oluşturur; üzerinde özgürce değişiklik yapabilir ve geliştirebilirsiniz.',
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

describe('ForkCard — i18n', () => {
  /**
   * Property 4 (English): Render with English t → description text equals the English
   * recipe.forkDescription value.
   * Validates: Requirements 3.2
   */
  it('renders the English fork description via t() — Property 4 (English)', () => {
    render(<ForkCard recipeId='recipe-1' />);
    expect(
      screen.getByText(
        'Forking creates your own personal copy of this recipe that you can freely modify and build upon.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * Property 4 (Turkish): Render with Turkish t → description text equals the Turkish
   * recipe.forkDescription value.
   * Validates: Requirements 3.2
   */
  it('renders the Turkish fork description via t() — Property 4 (Turkish)', () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    render(<ForkCard recipeId='recipe-1' />);
    expect(
      screen.getByText(
        'Çatallama, bu tarifin kendi kişisel kopyanızı oluşturur; üzerinde özgürce değişiklik yapabilir ve geliştirebilirsiniz.',
      ),
    ).toBeInTheDocument();
  });
});

describe('ForkCard — fork link', () => {
  /**
   * Requirement 2.3: Rendered <a> has href matching /recipes/recipe-1/fork when recipeId="recipe-1"
   */
  it('renders a link with href /recipes/recipe-1/fork for recipeId="recipe-1"', () => {
    render(<ForkCard recipeId='recipe-1' />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/recipes/recipe-1/fork');
  });

  /**
   * Requirement 2.3: The fork link has non-empty text content (accessible label)
   */
  it('renders the fork link with non-empty text content', () => {
    render(<ForkCard recipeId='recipe-1' />);
    const link = screen.getByRole('link');
    expect(link.textContent?.trim()).not.toBe('');
  });
});
