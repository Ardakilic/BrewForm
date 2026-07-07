import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { RecipeListItemOutput } from '@brewform/shared/schemas';
import { RecipeCard } from './RecipeCard.tsx';

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

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRecipe(overrides: Partial<RecipeListItemOutput> = {}): RecipeListItemOutput {
  return {
    id: 'r1',
    slug: 'test-recipe',
    title: 'Test Recipe',
    authorId: 'u1',
    visibility: 'public',
    currentVersionId: null,
    likeCount: 5,
    commentCount: 2,
    forkCount: 1,
    forkedFromId: null,
    featured: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    author: {
      id: 'u1',
      username: 'alice',
      displayName: 'Alice',
    },
    ...overrides,
  };
}

function renderWithRouter(ui: React.ReactElement) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: ui,
        children: [
          { path: 'recipes/:slug', element: null },
          { path: 'u/:username', element: null },
        ],
      },
    ],
    { initialEntries: ['/'] },
  );
  return { router, ...render(<RouterProvider router={router} />) };
}

describe('RecipeCard', () => {
  it('should render the recipe title and link to /recipes/:slug', () => {
    renderWithRouter(<RecipeCard recipe={makeRecipe()} />);
    const title = screen.getByText('Test Recipe');
    expect(title).toBeInTheDocument();
    const link = title.closest('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('/recipes/test-recipe');
  });

  it('should render the author button and navigate to /u/:username on click (stopPropagation)', async () => {
    const { router } = renderWithRouter(<RecipeCard recipe={makeRecipe()} />);
    const authorButton = screen.getByRole('button', { name: 'Alice' });
    expect(authorButton).toBeInTheDocument();
    expect(authorButton.tagName).toBe('BUTTON');
    // Card is still on '/' (author button is a <button>, not a nested <a>)
    expect(router.state.location.pathname).toBe('/');
    const user = userEvent.setup();
    await user.click(authorButton);
    // Author button click navigates to /u/alice
    expect(router.state.location.pathname).toBe('/u/alice');
    // And stopPropagation prevented the outer card navigation to /recipes/test-recipe
    expect(router.state.location.pathname).not.toBe('/recipes/test-recipe');
  });

  it('should render likeCount, commentCount, and forkCount', () => {
    renderWithRouter(<RecipeCard recipe={makeRecipe()} />);
    expect(screen.getByText(/❤️ 5/)).toBeInTheDocument();
    expect(screen.getByText(/💬 2/)).toBeInTheDocument();
    expect(screen.getByText(/🍴 1/)).toBeInTheDocument();
  });

  it('should render "unknown" when author is null', () => {
    // `author: null` tests RecipeCard's defensive fallback; the shared
    // schema types `author` as non-nullable, so cast to satisfy the
    // type-checker.
    renderWithRouter(
      <RecipeCard recipe={{ ...makeRecipe(), author: null } as unknown as RecipeListItemOutput} />,
    );
    // The "by unknown" text is in a <p> tag; there's no author button
    expect(screen.queryByRole('button', { name: /alice/i })).not.toBeInTheDocument();
    const paragraph = document.querySelector('p.mt-1');
    expect(paragraph).not.toBeNull();
    expect(paragraph!.textContent).toContain('unknown');
  });
});
