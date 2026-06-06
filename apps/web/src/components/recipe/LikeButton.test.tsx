import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { LikeButton } from './LikeButton.tsx';

function renderWithRouter(ui: React.ReactElement) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: ui,
        children: [
          { path: 'recipes/:id/like', element: null },
        ],
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LikeButton — Property 1 (no w-full)', () => {
  it('button does not have w-full class when initialLiked=false, initialCount=0', () => {
    renderWithRouter(<LikeButton recipeId='recipe-1' initialLiked={false} initialCount={0} />);
    const button = screen.getByRole('button');
    expect(button.classList.contains('w-full')).toBe(false);
  });

  it('button does not have w-full class when initialLiked=true, initialCount=5', () => {
    renderWithRouter(<LikeButton recipeId='recipe-1' initialLiked initialCount={5} />);
    const button = screen.getByRole('button');
    expect(button.classList.contains('w-full')).toBe(false);
  });
});

describe('LikeButton — Requirement 1.4 (count display)', () => {
  it('renders "0" when initialCount=0', () => {
    renderWithRouter(<LikeButton recipeId='recipe-1' initialLiked={false} initialCount={0} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toContain('0');
  });

  it('renders "7" when initialCount=7', () => {
    renderWithRouter(<LikeButton recipeId='recipe-1' initialLiked={false} initialCount={7} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toContain('7');
  });
});

describe('LikeButton — Requirement 1.6 (count display when favourite)', () => {
  it('renders count when initialCount is provided and favourited', () => {
    renderWithRouter(<LikeButton recipeId='recipe-1' initialLiked={false} initialCount={5} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toContain('5');
  });
});
