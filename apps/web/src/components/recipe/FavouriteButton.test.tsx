import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import React from 'react';
import { FavouriteButton } from './FavouriteButton.tsx';

function renderWithRouter(ui: React.ReactElement) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: ui,
        children: [
          { path: 'recipes/:id/favourite', element: null },
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

describe('FavouriteButton — Property 2 (no w-full class)', () => {
  it('button does not have w-full class when initialFavourited=false, initialCount=0', () => {
    renderWithRouter(
      <FavouriteButton recipeId='recipe-1' initialFavourited={false} initialCount={0} />,
    );
    const button = screen.getByRole('button');
    expect(button.classList.contains('w-full')).toBe(false);
  });

  it('button does not have w-full class when initialFavourited=true, initialCount=3', () => {
    renderWithRouter(<FavouriteButton recipeId='recipe-1' initialFavourited initialCount={3} />);
    const button = screen.getByRole('button');
    expect(button.classList.contains('w-full')).toBe(false);
  });
});

describe('FavouriteButton — Requirement 1.5 (count display)', () => {
  it('renders "0" when initialCount=0', () => {
    renderWithRouter(
      <FavouriteButton recipeId='recipe-1' initialFavourited={false} initialCount={0} />,
    );
    const button = screen.getByRole('button');
    expect(button.textContent).toContain('0');
  });

  it('renders "4" when initialCount=4', () => {
    renderWithRouter(
      <FavouriteButton recipeId='recipe-1' initialFavourited={false} initialCount={4} />,
    );
    const button = screen.getByRole('button');
    expect(button.textContent).toContain('4');
  });
});
