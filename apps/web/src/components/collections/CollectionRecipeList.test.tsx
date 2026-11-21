import { t } from '@brewform/shared/i18n';
import type { CollectionItemOutput } from '@brewform/shared/schemas';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../api/index.ts', () => ({
  collectionApi: {
    reorder: vi.fn(),
    removeRecipe: vi.fn(),
  },
}));

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

vi.mock('@brewform/shared/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@brewform/shared/constants')>()),
  BREW_METHODS_LIST: [
    { value: 'v60', label: 'V60' },
    { value: 'espresso_machine', label: 'Espresso Machine' },
  ],
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { ApiError } from '../../api/errors.ts';
import { collectionApi } from '../../api/index.ts';
import {
  action as collectionAction,
  reorderAction,
} from '../../pages/collections/CollectionDetailPage.data.ts';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { CollectionRecipeList } from './CollectionRecipeList.tsx';

const mockReorder = vi.mocked(collectionApi.reorder);
const mockRemoveRecipe = vi.mocked(collectionApi.removeRecipe);

const MOVE_UP = t('collection.moveUp');
const MOVE_DOWN = t('collection.moveDown');
const REMOVE = t('collection.detail.removeFromCollection');

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

/**
 * Renders the list at `/collections/c1` with the real collection route action and the
 * `collections/:id/reorder` resource action, inside the app providers (toasts included).
 */
function renderWithRouter(ui: React.ReactElement) {
  return renderWithAppProviders(
    [
      { path: '/collections/:id', element: ui, action: collectionAction },
      { path: '/collections/:id/reorder', action: reorderAction },
      { path: '/recipes/:slug', element: null },
      { path: '/u/:username', element: null },
    ],
    { initialEntries: ['/collections/c1'], auth: 'user' },
  );
}

/** Two v60 items, "First" then "Second". */
function twoItems(): CollectionItemOutput[] {
  return [
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
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockReorder.mockResolvedValue({ message: 'ok' });
  mockRemoveRecipe.mockResolvedValue({ message: 'ok' });
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CollectionRecipeList', () => {
  it('renders recipe cards grouped by brew method with section headings', async () => {
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

    renderWithRouter(<CollectionRecipeList collectionId="c1" items={items} isOwner={false} />);

    // Headings for each group (V60 and Espresso Machine in BREW_METHODS_LIST order, then Other)
    expect(await screen.findByRole('heading', { name: 'V60' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Espresso Machine' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: t('collection.detail.otherBrewMethod') }),
    ).toBeInTheDocument();

    // Recipe titles render (via RecipeCard)
    expect(screen.getByText('V60 Brew')).toBeInTheDocument();
    expect(screen.getByText('Espresso Shot')).toBeInTheDocument();
    expect(screen.getByText('No Version')).toBeInTheDocument();
  });

  it('renders recipe card links pointing to /recipes/:slug', async () => {
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

    renderWithRouter(<CollectionRecipeList collectionId="c1" items={items} isOwner={false} />);

    const title = await screen.findByText('V60 Brew');
    const link = title.closest('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('/recipes/my-v60');
  });

  it('shows reorder/remove buttons for the owner', async () => {
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

    renderWithRouter(<CollectionRecipeList collectionId="c1" items={items} isOwner />);

    expect(await screen.findByLabelText(MOVE_UP)).toBeInTheDocument();
    expect(screen.getByLabelText(MOVE_DOWN)).toBeInTheDocument();
    expect(screen.getByLabelText(REMOVE)).toBeInTheDocument();
  });

  it('does NOT show reorder/remove buttons for non-owners', async () => {
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

    renderWithRouter(<CollectionRecipeList collectionId="c1" items={items} isOwner={false} />);

    await screen.findByText('V60 Brew');
    expect(screen.queryByLabelText(MOVE_UP)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(MOVE_DOWN)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(REMOVE)).not.toBeInTheDocument();
  });

  it('reorders through the reorder resource action on move down', async () => {
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

    renderWithRouter(<CollectionRecipeList collectionId="c1" items={items} isOwner />);

    const user = userEvent.setup();
    // Two items each render a "Move down" button; click the first item's
    // down button to swap item-1 with item-2.
    const downBtns = await screen.findAllByLabelText(MOVE_DOWN);
    await user.click(downBtns[0]);

    await waitFor(() =>
      expect(mockReorder).toHaveBeenCalledWith('c1', ['item-2', 'item-1'], {
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('removes an item through the collection route action', async () => {
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

    renderWithRouter(<CollectionRecipeList collectionId="c1" items={items} isOwner />);

    const user = userEvent.setup();
    const removeBtn = await screen.findByLabelText(REMOVE);
    await user.click(removeBtn);

    await waitFor(() =>
      expect(mockRemoveRecipe).toHaveBeenCalledWith('c1', 'r1', {
        signal: expect.any(AbortSignal),
      }),
    );
    await waitFor(() => expect(screen.queryByText('V60 Brew')).not.toBeInTheDocument());
  });

  it('swaps optimistically, disables the arrows while the reorder is pending, then re-enables', async () => {
    let resolveReorder: (value: { message: string }) => void = () => undefined;
    mockReorder.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReorder = resolve;
        }),
    );
    renderWithRouter(<CollectionRecipeList collectionId="c1" items={twoItems()} isOwner />);
    const user = userEvent.setup();

    await user.click((await screen.findAllByLabelText(MOVE_DOWN))[0]);

    // Optimistic swap: "Second" now renders before "First".
    const titles = () => screen.getAllByText(/^(First|Second)$/).map((el) => el.textContent);
    expect(titles()).toEqual(['Second', 'First']);
    await waitFor(() => {
      for (const btn of [
        ...screen.getAllByLabelText(MOVE_UP),
        ...screen.getAllByLabelText(MOVE_DOWN),
      ]) {
        expect(btn).toBeDisabled();
      }
    });

    resolveReorder({ message: 'ok' });
    await waitFor(() => expect(screen.getAllByLabelText(MOVE_UP)[1]).toBeEnabled());
    expect(titles()).toEqual(['Second', 'First']);
    expect(mockReorder).toHaveBeenCalledTimes(1);
  });

  it('rolls the order back and shows an error toast when the reorder fails', async () => {
    mockReorder.mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', undefined, 500));
    renderWithRouter(<CollectionRecipeList collectionId="c1" items={twoItems()} isOwner />);
    const user = userEvent.setup();

    await user.click((await screen.findAllByLabelText(MOVE_DOWN))[0]);

    expect(await screen.findByText(t('collection.error.reorder'))).toBeInTheDocument();
    const titles = screen.getAllByText(/^(First|Second)$/).map((el) => el.textContent);
    expect(titles).toEqual(['First', 'Second']);
  });

  it('keeps the item and shows an error toast when the removal fails', async () => {
    mockRemoveRecipe.mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', undefined, 500));
    renderWithRouter(<CollectionRecipeList collectionId="c1" items={twoItems()} isOwner />);
    const user = userEvent.setup();

    await user.click((await screen.findAllByLabelText(REMOVE))[0]);

    expect(await screen.findByText(t('collection.error.remove'))).toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();
  });
});

describe('collections/:id/reorder resource action', () => {
  it('returns { ok: true } after collectionApi.reorder resolves', async () => {
    const result = await reorderAction({
      params: { id: 'c1' },
      request: new Request('http://localhost/collections/c1/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: ['b', 'a'] }),
      }),
      context: undefined,
    } as never);

    expect(result).toEqual({ ok: true });
    expect(mockReorder).toHaveBeenCalledWith('c1', ['b', 'a'], {
      signal: expect.any(AbortSignal),
    });
  });

  it('returns { ok: false, error } when the API fails', async () => {
    mockReorder.mockRejectedValue(new ApiError('FORBIDDEN', 'Not yours', undefined, 403));

    const result = await reorderAction({
      params: { id: 'c1' },
      request: new Request('http://localhost/collections/c1/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: ['a'] }),
      }),
      context: undefined,
    } as never);

    expect(result).toEqual({ ok: false, error: 'Not yours', code: 'FORBIDDEN' });
  });
});
