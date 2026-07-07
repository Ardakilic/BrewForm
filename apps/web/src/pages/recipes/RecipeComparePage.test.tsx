import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
const recipe = {
  id: 'r1',
  slug: 'recipe-1',
  title: 'Test Recipe',
  currentVersion: {
    brewMethod: 'espresso_machine',
    drinkType: 'espresso',
    groundWeightGrams: 18,
    extractionVolumeMl: 36,
    extractionTimeSeconds: 28,
    temperatureCelsius: 93,
    brewRatio: 2,
    rating: 8,
  },
  tasteNotes: [],
  equipment: [],
} as unknown as RecipeDetailOutput;

beforeEach(() => {
  vi.clearAllMocks();
  mockRecipeApi.get.mockResolvedValue(recipe);
});

describe('RecipeComparePage — tr locale spot-check', () => {
  it('renders the Turkish compare title', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/recipes/compare/:slug1/:slug2',
          element: <RecipeComparePage />,
        },
      ],
      { initialEntries: ['/recipes/compare/recipe-1/recipe-2'] },
    );

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText('Tarifleri Karşılaştır')).toBeInTheDocument();
    });
  });
});
