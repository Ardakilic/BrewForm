import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

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

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (k: string) => {
      const map: Record<string, string> = {
        'recipe.compareTitle': 'Tarifleri Karşılaştır',
        'compare.notFound': 'Bir veya iki tarif bulunamadı.',
        'common.loading': 'Yükleniyor...',
        'recipe.brewMethod': 'Demleme Yöntemi',
        'recipe.drinkType': 'İçecek Türü',
        'recipe.dose': 'Doz',
        'recipe.yield': 'Verim',
        'recipe.time': 'Süre',
        'recipe.temperature': 'Sıcaklık',
        'recipe.ratio': 'Oran',
        'recipe.rating': 'Puan',
        'recipe.tasteNotes': 'Tat Notları',
        'equipment.title': 'Ekipman',
      };
      return map[k] ?? k;
    },
    locale: 'tr',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

vi.mock('../../api/index.ts', () => ({
  recipeApi: {
    get: vi.fn(),
    merge: vi.fn(),
  },
}));

import { recipeApi } from '../../api/index.ts';
import type { RecipeDetailOutput } from '@brewform/shared/schemas';
import { RecipeComparePage } from './RecipeComparePage.tsx';

const mockRecipeApi = vi.mocked(recipeApi);

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
      extractionTimeSeconds: 28,
      temperatureCelsius: 93,
      brewRatio: 2,
      rating: 8,
      grindSize: null,
      grinder: null,
    },
    tasteNotes: [],
    equipment: [],
  } as unknown as RecipeDetailOutput;
}

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/recipes/compare/:slug1/:slug2', element: <RecipeComparePage /> },
      { path: '/recipes/:id/edit', element: <div>EDIT PAGE</div> },
    ],
    { initialEntries: ['/recipes/compare/recipe-1/recipe-2'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  vi.clearAllMocks();
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
    )
  );
});

describe('RecipeComparePage', () => {
  it('renders the Turkish compare title', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Tarifleri Karşılaştır')).toBeInTheDocument();
    });
  });

  it('highlights differing values in the diff view', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('18g')).toBeInTheDocument();
    });
    const row = screen.getByText('18g').closest('.grid') as HTMLElement;
    expect(row.style.backgroundColor).toBe('var(--diff-highlight, rgba(255, 200, 0, 0.1))');
    const sameRow = screen.getAllByText('36ml')[0].closest('.grid') as HTMLElement;
    expect(sameRow.style.backgroundColor).toBe('transparent');
  });

  it('shows the merge button when both recipes loaded', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('merge.button')).toBeInTheDocument();
    });
  });

  it('hides the merge button when a recipe fails to load', async () => {
    mockRecipeApi.get.mockImplementation(
      ((slug: string) =>
        slug === 'recipe-1'
          ? Promise.resolve(makeRecipe({}))
          : Promise.resolve(null)) as typeof mockRecipeApi.get,
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Bir veya iki tarif bulunamadı.')).toBeInTheDocument();
    });
    expect(screen.queryByText('merge.button')).not.toBeInTheDocument();
  });

  it('merge flow calls the API and navigates to the edit page', async () => {
    mockRecipeApi.merge.mockResolvedValue({ id: 'merged-1' } as RecipeDetailOutput);
    const router = renderPage();
    await waitFor(() => {
      expect(screen.getByText('merge.button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('merge.button'));
    fireEvent.click(screen.getAllByRole('radio')[0]);
    fireEvent.click(screen.getByText('merge.create'));
    await waitFor(() => {
      expect(mockRecipeApi.merge).toHaveBeenCalledWith({
        recipeVersionId1: 'ver-1',
        recipeVersionId2: 'ver-2',
        title: 'Recipe One + Recipe Two',
        selections: { brewMethod: 'v1' },
      });
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/recipes/merged-1/edit');
    });
    expect(screen.getByText('EDIT PAGE')).toBeInTheDocument();
  });

  it('shows an error message when the merge API fails', async () => {
    mockRecipeApi.merge.mockRejectedValue(new Error('merge failed'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('merge.button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('merge.button'));
    fireEvent.click(screen.getByText('merge.create'));
    await waitFor(() => {
      expect(screen.getByText('merge failed')).toBeInTheDocument();
    });
  });
});
