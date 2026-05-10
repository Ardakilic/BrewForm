import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LikeButton } from './LikeButton';

vi.mock('../../api/client.ts', () => ({
  api: {
    post: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LikeButton — Property 1 (no w-full)', () => {
  it('button does not have w-full class when initialLiked=false, initialCount=0', () => {
    render(<LikeButton recipeId='recipe-1' initialLiked={false} initialCount={0} />);
    const button = screen.getByRole('button');
    expect(button.classList.contains('w-full')).toBe(false);
  });

  it('button does not have w-full class when initialLiked=true, initialCount=5', () => {
    render(<LikeButton recipeId='recipe-1' initialLiked={true} initialCount={5} />);
    const button = screen.getByRole('button');
    expect(button.classList.contains('w-full')).toBe(false);
  });
});

describe('LikeButton — Requirement 1.4 (count display)', () => {
  it('renders "0" when initialCount=0', () => {
    render(<LikeButton recipeId='recipe-1' initialLiked={false} initialCount={0} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toContain('0');
  });

  it('renders "7" when initialCount=7', () => {
    render(<LikeButton recipeId='recipe-1' initialLiked={false} initialCount={7} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toContain('7');
  });
});

describe('LikeButton — Requirement 1.6 (no count when undefined)', () => {
  it('renders no numeric text when initialCount is not provided', () => {
    render(<LikeButton recipeId='recipe-1' initialLiked={false} />);
    const button = screen.getByRole('button');
    expect(button.textContent).not.toMatch(/[0-9]/);
  });
});
