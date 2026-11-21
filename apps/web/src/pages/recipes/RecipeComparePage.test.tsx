import { t } from '@brewform/shared/i18n';
import type { RecipeDetailOutput } from '@brewform/shared/schemas';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

vi.mock('../../api/index.ts', () => ({
  recipeApi: {
    get: vi.fn(),
    merge: vi.fn(),
  },
}));

import { ApiError } from '../../api/errors.ts';
import { recipeApi } from '../../api/index.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action, loader } from './RecipeComparePage.data.ts';
import { RecipeComparePage } from './RecipeComparePage.tsx';

const mockRecipeApi = vi.mocked(recipeApi);
const tr = (key: string) => t(key, 'tr');

/** Minimal `RecipeDetailOutput` mock for the compare page (only the fields the
 * page reads: `id`, `slug`, `title`, `currentVersion`, `tasteNotes`,
 * `equipment`). Cast through `unknown` because the full schema has many more
 * required fields that the compare page does not use. */
function makeRecipe(overrides: {
  id?: string;
  slug?: string;
  title?: string;
  versionId?: string;
  grams?: number;
  seconds?: number;
  ratio?: number;
}): RecipeDetailOutput {
  return {
    id: overrides.id ?? 'r1',
    slug: overrides.slug ?? 'recipe-1',
    title: overrides.title ?? 'Test Recipe',
    currentVersion: {
      id: overrides.versionId ?? 'v1',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      groundWeightGrams: overrides.grams ?? 18,
      extractionVolumeMl: 36,
      extractionTimeSeconds: overrides.seconds ?? 28,
      temperatureCelsius: 93,
      brewRatio: overrides.ratio ?? 2,
      rating: 8,
      grindSize: null,
      grinder: null,
    },
    tasteNotes: [],
    equipment: [],
  } as unknown as RecipeDetailOutput;
}

/** Renders the compare page (plus a stand-in edit page) through the real loader and action. */
function renderPage() {
  return renderWithAppProviders(
    [
      {
        path: '/recipes/compare/:slug1/:slug2',
        loader,
        action,
        Component: RecipeComparePage,
        errorElement: <RouteErrorState />,
      },
      { path: '/recipes/:id/edit', element: <div>EDIT PAGE</div> },
    ],
    { initialEntries: ['/recipes/compare/recipe-1/recipe-2'], auth: 'user', locale: 'tr' },
  );
}

/** Opens the merge dialog once the page has loaded. */
async function openMerge() {
  fireEvent.click(await screen.findByText(tr('merge.button')));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockRecipeApi.get.mockImplementation((slug: string) =>
    Promise.resolve(
      slug === 'recipe-1'
        ? makeRecipe({ id: 'r1', versionId: 'ver-1', title: 'Recipe One', grams: 18 })
        : makeRecipe({
            id: 'r2',
            slug: 'recipe-2',
            versionId: 'ver-2',
            title: 'Recipe Two',
            grams: 20,
          }),
    ),
  );
});

describe('/recipes/compare/:slug1/:slug2 loader', () => {
  it('loads both recipes in parallel with request.signal', async () => {
    renderPage();

    expect(await screen.findByText(tr('recipe.compareTitle'))).toBeInTheDocument();
    expect(mockRecipeApi.get).toHaveBeenCalledWith('recipe-1', {
      signal: expect.any(AbortSignal),
    });
    expect(mockRecipeApi.get).toHaveBeenCalledWith('recipe-2', {
      signal: expect.any(AbortSignal),
    });
  });

  it('renders the not-found page when a recipe does not exist', async () => {
    mockRecipeApi.get.mockImplementation((slug: string) =>
      slug === 'recipe-1'
        ? Promise.resolve(makeRecipe({}))
        : Promise.reject(new ApiError('NOT_FOUND', 'missing', undefined, 404)),
    );
    renderPage();

    expect(await screen.findByText(tr('error.404'))).toBeInTheDocument();
    expect(screen.queryByText(tr('merge.button'))).not.toBeInTheDocument();
  });

  it('renders the route error state (not compare.notFound) when a load fails', async () => {
    mockRecipeApi.get.mockRejectedValue(new Error('down'));
    renderPage();

    expect(await screen.findByText(tr('error.route.loadFailed'))).toBeInTheDocument();
    expect(screen.queryByText(tr('compare.notFound'))).not.toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ slug1: 'recipe-1', slug2: 'recipe-2' }),
      'RecipeComparePage loadData failed',
    );
  });
});

describe('RecipeComparePage', () => {
  it('renders the Turkish compare title', async () => {
    renderPage();
    expect(await screen.findByText(tr('recipe.compareTitle'))).toBeInTheDocument();
  });

  it('is never indexed (derived view): sets robots noindex, nofollow', async () => {
    renderPage();
    await screen.findByText(tr('recipe.compareTitle'));

    await waitFor(() =>
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex, nofollow',
      ),
    );
  });

  it('highlights differing values in the diff view', async () => {
    renderPage();
    const differing = await screen.findByText('18g');
    const row = differing.closest('.grid') as HTMLElement;
    expect(row.style.backgroundColor).toBe('var(--diff-highlight, rgba(255, 200, 0, 0.1))');
    const sameRow = screen.getAllByText('36ml')[0].closest('.grid') as HTMLElement;
    expect(sameRow.style.backgroundColor).toBe('transparent');
  });

  it('shows the merge button when both recipes loaded', async () => {
    renderPage();
    expect(await screen.findByText(tr('merge.button'))).toBeInTheDocument();
  });

  it('formats the ratio rounded to one decimal and long durations compactly (tr)', async () => {
    mockRecipeApi.get.mockImplementation((slug: string) =>
      Promise.resolve(
        slug === 'recipe-1'
          ? makeRecipe({ id: 'r1', versionId: 'ver-1', ratio: 2.2222223, seconds: 43200 })
          : makeRecipe({ id: 'r2', slug: 'recipe-2', versionId: 'ver-2', ratio: 2, seconds: 28 }),
      ),
    );
    renderPage();
    expect(await screen.findByText('1:2,2')).toBeInTheDocument();
    expect(screen.getByText('1:2')).toBeInTheDocument();
    expect(screen.getByText('12 sa')).toBeInTheDocument();
    expect(screen.getByText('28 sn')).toBeInTheDocument();
    expect(screen.queryByText(/2[.,]2222/)).not.toBeInTheDocument();
    expect(screen.queryByText('43200s')).not.toBeInTheDocument();
  });
});

describe('/recipes/compare/:slug1/:slug2 merge action', () => {
  it('merges through the action with request.signal and opens the editor', async () => {
    mockRecipeApi.merge.mockResolvedValue({ id: 'merged-1' } as RecipeDetailOutput);
    const { router } = renderPage();

    await openMerge();
    fireEvent.click(screen.getAllByRole('radio')[0]);
    fireEvent.click(screen.getByText(tr('merge.create')));

    await waitFor(() => {
      expect(mockRecipeApi.merge).toHaveBeenCalledWith(
        {
          recipeVersionId1: 'ver-1',
          recipeVersionId2: 'ver-2',
          title: 'Recipe One + Recipe Two',
          selections: { brewMethod: 'v1' },
        },
        { signal: expect.any(AbortSignal) },
      );
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/recipes/merged-1/edit');
    });
    expect(screen.getByText('EDIT PAGE')).toBeInTheDocument();
  });

  it('shows an error message and stays on the page when the merge fails', async () => {
    mockRecipeApi.merge.mockRejectedValue(new Error('merge failed'));
    renderPage();

    await openMerge();
    fireEvent.click(screen.getByText(tr('merge.create')));

    expect(await screen.findByText('merge failed')).toBeInTheDocument();
    expect(screen.queryByText('EDIT PAGE')).not.toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ recipeVersionId1: 'ver-1', recipeVersionId2: 'ver-2' }),
      'RecipeComparePage mergeRecipes failed',
    );
  });
});
