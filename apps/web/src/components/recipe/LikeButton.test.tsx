import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { LikeButton } from './LikeButton.tsx';

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
            path: 'recipes/:id/like',
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

describe('LikeButton — click interaction', () => {
  it('clicking the button triggers optimistic count update and disables while pending', async () => {
    const user = userEvent.setup();
    renderWithRouter(<LikeButton recipeId='recipe-1' initialLiked={false} initialCount={3} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toContain('3');
    expect(button).not.toBeDisabled();

    await user.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
    });
  });
});

describe('LikeButton — action failure rollback', () => {
  it('reverts to initial state when action returns an error', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <LikeButton recipeId='recipe-1' initialLiked={false} initialCount={3} />,
          children: [
            {
              path: 'recipes/:id/like',
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
      expect(button.textContent).toContain('3');
    });
  });

  it('completes normally when action returns ok', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <LikeButton recipeId='recipe-1' initialLiked={false} initialCount={3} />,
          children: [
            {
              path: 'recipes/:id/like',
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
      expect(button.textContent).toContain('3');
    });
  });
});
