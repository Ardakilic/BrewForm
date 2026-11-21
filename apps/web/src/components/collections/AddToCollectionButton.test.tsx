import { t } from '@brewform/shared/i18n';
import type { CollectionListItemOutput } from '@brewform/shared/schemas';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../api/index.ts', () => ({
  collectionApi: { list: vi.fn(), addRecipe: vi.fn(), removeRecipe: vi.fn(), create: vi.fn() },
}));

import { collectionApi } from '../../api/index.ts';
import { shouldRevalidate as shouldRevalidateDetail } from '../../pages/recipes/RecipeDetailPage.data.ts';
import {
  myCollectionsAction,
  myCollectionsLoader,
  shouldRevalidateMyCollections,
} from '../../routes/resources/collections.ts';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { AddToCollectionButton } from './AddToCollectionButton.tsx';

const RECIPE_ID = 'recipe-1';
const mockApi = vi.mocked(collectionApi);

/** One collection row of the mocked list. */
const ROW: CollectionListItemOutput = {
  id: 'c1',
  userId: 'u1',
  name: 'Alpha',
  description: null,
  visibility: 'private',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  recipeCount: 0,
  containsRecipe: false,
};

/** How many times the page loader ran. */
let pageLoads = 0;

/** Renders the button on a recipe page with a counting loader and the collections resource route. */
function renderPage() {
  return renderWithAppProviders(
    [
      {
        path: '/recipes/:slug',
        loader: () => {
          pageLoads += 1;
          return null;
        },
        shouldRevalidate: shouldRevalidateDetail,
        element: <AddToCollectionButton recipeId={RECIPE_ID} />,
      },
      {
        path: '/resources/collections/mine',
        loader: myCollectionsLoader,
        action: myCollectionsAction,
        shouldRevalidate: shouldRevalidateMyCollections,
      },
    ],
    { initialEntries: ['/recipes/my-espresso'], auth: 'user', locale: 'en' },
  );
}

/** Waits until every fetcher, navigation and revalidation is idle. */
async function waitForIdle(router: ReturnType<typeof renderWithAppProviders>['router']) {
  await waitFor(() => {
    expect(router.state.navigation.state).toBe('idle');
    expect(router.state.revalidation).toBe('idle');
    expect([...router.state.fetchers.values()].every((f) => f.state === 'idle')).toBe(true);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  pageLoads = 0;
  mockApi.list.mockResolvedValue({ data: [ROW] } as never);
  mockApi.addRecipe.mockResolvedValue({ message: 'Recipe added' } as never);
});

describe('AddToCollectionButton — refreshes the page once after a change', () => {
  it('toggling one row and closing runs the page loader exactly once more', async () => {
    const { router } = renderPage();
    await waitForIdle(router);
    const before = pageLoads;
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: t('collection.modal.add') }));
    await user.click((await screen.findByText('Alpha')).closest('button') as HTMLButtonElement);
    await waitFor(() => expect(mockApi.addRecipe).toHaveBeenCalledTimes(1));
    await waitForIdle(router);
    expect(pageLoads).toBe(before);
    await user.click(screen.getByRole('button', { name: t('common.close') }));

    await waitFor(() => expect(pageLoads).toBe(before + 1));
    await waitForIdle(router);
    expect(pageLoads).toBe(before + 1);
  });

  it('opening and closing with no change runs no loader', async () => {
    const { router } = renderPage();
    await waitForIdle(router);
    const before = pageLoads;
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: t('collection.modal.add') }));
    await screen.findByText('Alpha');
    await waitForIdle(router);
    await user.click(screen.getByRole('button', { name: t('common.close') }));
    await waitForIdle(router);

    expect(pageLoads).toBe(before);
  });
});
