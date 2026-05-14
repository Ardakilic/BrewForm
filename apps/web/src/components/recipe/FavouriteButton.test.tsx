import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FavouriteButton } from './FavouriteButton';

vi.mock('../../api/client.ts', () => ({
  api: {
    post: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FavouriteButton — Property 2 (no w-full class)', () => {
  it('button does not have w-full class when initialFavourited=false, initialCount=0', () => {
    render(<FavouriteButton recipeId='recipe-1' initialFavourited={false} initialCount={0} />);
    const button = screen.getByRole('button');
    expect(button.classList.contains('w-full')).toBe(false);
  });

  it('button does not have w-full class when initialFavourited=true, initialCount=3', () => {
    render(<FavouriteButton recipeId='recipe-1' initialFavourited initialCount={3} />);
    const button = screen.getByRole('button');
    expect(button.classList.contains('w-full')).toBe(false);
  });
});

describe('FavouriteButton — Requirement 1.5 (count display)', () => {
  it('renders "0" when initialCount=0', () => {
    render(<FavouriteButton recipeId='recipe-1' initialFavourited={false} initialCount={0} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toContain('0');
  });

  it('renders "4" when initialCount=4', () => {
    render(<FavouriteButton recipeId='recipe-1' initialFavourited={false} initialCount={4} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toContain('4');
  });
});

describe('FavouriteButton — Requirement 1.6 (no count when undefined)', () => {
  it('does not render a numeric count when initialCount is not provided', () => {
    render(<FavouriteButton recipeId='recipe-1' initialFavourited={false} />);
    const button = screen.getByRole('button');
    expect(button.textContent).not.toMatch(/\d/);
  });
});
