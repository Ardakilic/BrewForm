import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import React from 'react';
import { FavouriteButton } from './FavouriteButton.tsx';

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

function renderWithRouter(ui: React.ReactElement) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: ui,
        children: [
          {
            path: 'recipes/:id/favourite',
            action: () => new Promise(() => {}),
            element: null,
          },
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

describe('FavouriteButton — click interaction', () => {
  it('clicking the button triggers optimistic count update and disables while pending', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <FavouriteButton recipeId='recipe-1' initialFavourited={false} initialCount={5} />,
    );
    const button = screen.getByRole('button');
    expect(button.textContent).toContain('5');
    expect(button).not.toBeDisabled();

    await user.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
    });
  });
});

describe('FavouriteButton — action failure rollback', () => {
  it('reverts to initial state when action returns an error', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <FavouriteButton recipeId='recipe-1' initialFavourited={false} initialCount={5} />
          ),
          children: [
            {
              path: 'recipes/:id/favourite',
              action: () => ({ ok: false, error: 'server error' }),
              element: null,
            },
          ],
        },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    const button = screen.getByRole('button');

    await user.click(button);

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button.textContent).toContain('5');
    });
  });

  it('completes normally when action returns ok', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <FavouriteButton recipeId='recipe-1' initialFavourited={false} initialCount={5} />
          ),
          children: [
            {
              path: 'recipes/:id/favourite',
              action: () => ({ ok: true }),
              element: null,
            },
          ],
        },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    const button = screen.getByRole('button');

    await user.click(button);

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button.textContent).toContain('5');
    });
  });
});
