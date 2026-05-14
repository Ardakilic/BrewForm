import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ForkCard } from './ForkCard';

vi.mock('../../contexts/I18nContext', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('react-router', () => ({
  Link: (
    { to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown },
  ) => <a href={to} {...props}>{children}</a>,
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

describe('ForkCard — heading', () => {
  it('renders the "Fork Recipe" heading — English', () => {
    render(<ForkCard recipeId='recipe-1' />);
    expect(screen.getByRole('heading', { name: 'Fork Recipe' })).toBeInTheDocument();
  });

  it('renders the Turkish heading when locale is tr', () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    render(<ForkCard recipeId='recipe-1' />);
    expect(screen.getByRole('heading', { name: 'Tarifi Çatalla' })).toBeInTheDocument();
  });
});

describe('ForkCard — fork link button', () => {
  it('renders a link with href /recipes/recipe-1/fork for recipeId="recipe-1"', () => {
    render(<ForkCard recipeId='recipe-1' />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/recipes/recipe-1/fork');
  });

  it('renders the fork link with the fork emoji and label text', () => {
    render(<ForkCard recipeId='recipe-1' />);
    const link = screen.getByRole('link');
    expect(link.textContent).toContain('🍴');
    expect(link.textContent).toContain('Fork Recipe');
  });

  it('renders the fork link with btn-secondary styling class', () => {
    render(<ForkCard recipeId='recipe-1' />);
    const link = screen.getByRole('link');
    expect(link.classList.contains('btn-secondary')).toBe(true);
  });
});

describe('ForkCard — description', () => {
  it('renders the English fork description via t() — Property 4 (English)', () => {
    render(<ForkCard recipeId='recipe-1' />);
    expect(
      screen.getByText(
        'Forking creates your own personal copy of this recipe that you can freely modify and build upon.',
      ),
    ).toBeInTheDocument();
  });

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
