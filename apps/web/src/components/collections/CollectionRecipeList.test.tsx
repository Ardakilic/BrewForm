import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { CollectionItemOutput } from '@brewform/shared/schemas';
import { CollectionRecipeList } from './CollectionRecipeList.tsx';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../api/index.ts', () => ({
  collectionApi: {
    reorder: vi.fn().mockResolvedValue({ message: 'ok' }),
    removeRecipe: vi.fn().mockResolvedValue({ message: 'ok' }),
  },
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

vi.mock('@brewform/shared/constants', () => ({
  BREW_METHODS_LIST: [
    { value: 'v60', label: 'V60' },
    { value: 'espresso_machine', label: 'Espresso Machine' },
  ],
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { useTranslation } from '../../contexts/I18nContext.tsx';
import { collectionApi } from '../../api/index.ts';

const mockUseTranslation = vi.mocked(useTranslation);
const mockReorder = vi.mocked(collectionApi.reorder);
const mockRemoveRecipe = vi.mocked(collectionApi.removeRecipe);

// ── Translation helper ─────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
    'collection.detail.otherBrewMethod': 'Other',
    'collection.moveUp': 'Move up',
    'collection.moveDown': 'Move down',
    'collection.detail.removeFromCollection': 'Remove from collection',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

// ── Factory helpers ────────────────────────────────────────────────────────

function makeRecipe(overrides: Record<string, unknown> = {}) {
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
    author: { id: 'u1', username: 'alice', displayName: 'Alice' },
    brewMethod: null as string | null,
    drinkType: null as string | null,
    ...overrides,
  };
}

function makeItem(overrides: Partial<CollectionItemOutput> = {}): CollectionItemOutput {
  return {
    id: 'item-1',
    collectionId: 'c1',
    recipeId: 'r1',
    sortOrder: 0,
    createdAt: '2024-01-01T00:00:00Z',
    recipe: makeRecipe() as CollectionItemOutput['recipe'],
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

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockReorder.mockResolvedValue({ message: 'ok' });
  mockRemoveRecipe.mockResolvedValue({ message: 'ok' });
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CollectionRecipeList', () => {
  it('renders recipe cards grouped by brew method with section headings', () => {
    const items = [
      makeItem({
        id: 'item-1',
        recipeId: 'r1',
        recipe: makeRecipe({
          id: 'r1',
          title: 'V60 Brew',
          brewMethod: 'v60',
        }) as CollectionItemOutput['recipe'],
      }),
      makeItem({
        id: 'item-2',
        recipeId: 'r2',
        sortOrder: 1,
        recipe: makeRecipe({
          id: 'r2',
          slug: 'espresso',
          title: 'Espresso Shot',
          brewMethod: 'espresso_machine',
        }) as CollectionItemOutput['recipe'],
      }),
      makeItem({
        id: 'item-3',
        recipeId: 'r3',
        sortOrder: 2,
        recipe: makeRecipe({
          id: 'r3',
          slug: 'no-method',
          title: 'No Version',
          brewMethod: null,
        }) as CollectionItemOutput['recipe'],
      }),
    ];

    renderWithRouter(
      <CollectionRecipeList collectionId='c1' items={items} isOwner={false} />,
    );

    // Headings for each group (V60 and Espresso Machine in BREW_METHODS_LIST order, then Other)
    expect(screen.getByRole('heading', { name: 'V60' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Espresso Machine' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Other' })).toBeInTheDocument();

    // Recipe titles render (via RecipeCard)
    expect(screen.getByText('V60 Brew')).toBeInTheDocument();
    expect(screen.getByText('Espresso Shot')).toBeInTheDocument();
    expect(screen.getByText('No Version')).toBeInTheDocument();
  });

  it('renders recipe card links pointing to /recipes/:slug', () => {
    const items = [
      makeItem({
        id: 'item-1',
        recipeId: 'r1',
        recipe: makeRecipe({
          id: 'r1',
          slug: 'my-v60',
          title: 'V60 Brew',
          brewMethod: 'v60',
        }) as CollectionItemOutput['recipe'],
      }),
    ];

    renderWithRouter(
      <CollectionRecipeList collectionId='c1' items={items} isOwner={false} />,
    );

    const title = screen.getByText('V60 Brew');
    const link = title.closest('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('/recipes/my-v60');
  });

  it('shows reorder/remove buttons for the owner', () => {
    const items = [
      makeItem({
        id: 'item-1',
        recipeId: 'r1',
        recipe: makeRecipe({
          id: 'r1',
          title: 'V60 Brew',
          brewMethod: 'v60',
        }) as CollectionItemOutput['recipe'],
      }),
    ];

    renderWithRouter(
      <CollectionRecipeList collectionId='c1' items={items} isOwner />,
    );

    expect(screen.getByLabelText('Move up')).toBeInTheDocument();
    expect(screen.getByLabelText('Move down')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove from collection')).toBeInTheDocument();
  });

  it('does NOT show reorder/remove buttons for non-owners', () => {
    const items = [
      makeItem({
        id: 'item-1',
        recipeId: 'r1',
        recipe: makeRecipe({
          id: 'r1',
          title: 'V60 Brew',
          brewMethod: 'v60',
        }) as CollectionItemOutput['recipe'],
      }),
    ];

    renderWithRouter(
      <CollectionRecipeList collectionId='c1' items={items} isOwner={false} />,
    );

    expect(screen.queryByLabelText('Move up')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Move down')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Remove from collection')).not.toBeInTheDocument();
  });

  it('reorders optimistically and calls collectionApi.reorder on move down', async () => {
    const items = [
      makeItem({
        id: 'item-1',
        recipeId: 'r1',
        sortOrder: 0,
        recipe: makeRecipe({
          id: 'r1',
          title: 'First',
          brewMethod: 'v60',
        }) as CollectionItemOutput['recipe'],
      }),
      makeItem({
        id: 'item-2',
        recipeId: 'r2',
        sortOrder: 1,
        recipe: makeRecipe({
          id: 'r2',
          slug: 'second',
          title: 'Second',
          brewMethod: 'v60',
        }) as CollectionItemOutput['recipe'],
      }),
    ];

    renderWithRouter(
      <CollectionRecipeList collectionId='c1' items={items} isOwner />,
    );

    const user = userEvent.setup();
    // Two items each render a "Move down" button; click the first item's
    // down button to swap item-1 with item-2.
    const downBtns = screen.getAllByLabelText('Move down');
    await user.click(downBtns[0]);

    expect(mockReorder).toHaveBeenCalledWith('c1', ['item-2', 'item-1']);
  });

  it('removes an item and calls collectionApi.removeRecipe', async () => {
    const items = [
      makeItem({
        id: 'item-1',
        recipeId: 'r1',
        recipe: makeRecipe({
          id: 'r1',
          title: 'V60 Brew',
          brewMethod: 'v60',
        }) as CollectionItemOutput['recipe'],
      }),
    ];

    renderWithRouter(
      <CollectionRecipeList collectionId='c1' items={items} isOwner />,
    );

    const user = userEvent.setup();
    const removeBtn = screen.getByLabelText('Remove from collection');
    await user.click(removeBtn);

    expect(mockRemoveRecipe).toHaveBeenCalledWith('c1', 'r1');
  });
});
