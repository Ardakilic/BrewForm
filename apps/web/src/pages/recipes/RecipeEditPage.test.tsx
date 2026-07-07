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

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: () => null,
}));

vi.mock('../../components/taste/TasteAutocomplete.tsx', () => ({
  TasteAutocomplete: () => null,
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (k: string) => {
      const map: Record<string, string> = {
        'recipe.edit': 'Tarifi Düzenle',
        'common.loading': 'Yükleniyor...',
        'common.saving': 'Kaydediliyor...',
        'common.saveChanges': 'Değişiklikleri Kaydet',
        'common.cancel': 'İptal',
        'recipe.editPage.bumpVersion': 'Sürüm Yükselt',
        'recipe.editPage.noVersions': 'Tarifin sürümü yok',
        'recipe.editPage.loadError': 'Tarif yüklenemedi',
        'recipe.editPage.updateError': 'Tarif güncellenemedi',
        'recipe.form.basicInfo': 'Temel Bilgiler',
        'recipe.form.title': 'Başlık',
        'recipe.form.brewConfig': 'Demleme Yapılandırması',
        'recipe.form.coffeeIdentity': 'Kahve Kimliği',
        'recipe.form.brewParams': 'Demleme Parametreleri',
        'recipe.form.tasteRating': 'Tat & Puan',
        'recipe.form.rating': 'Puan (1-10)',
        'recipe.form.howDidItTaste': 'Nasıl tadı vardı?',
        'recipe.form.selectPlaceholder': 'Seç...',
        'recipe.form.dose': 'Doz (g)',
        'recipe.form.extractionTime': 'Çıkarım Süresi (sn)',
        'recipe.form.yield': 'Sonuç (ml)',
        'recipe.form.temperature': 'Sıcaklık (°C)',
        'recipe.form.tds': 'TDS (%)',
        'recipe.form.tds.placeholder': 'ör. 1.35',
        'recipe.form.mainBrewerPlaceholder': 'örn. 58mm portafiltre, 20g sepet',
        'recipe.brewMethod': 'Demleme Yöntemi',
        'recipe.drinkType': 'İçecek Türü',
        'recipe.visibility': 'Görünürlük',
        'recipe.productName': 'Ürün Adı',
        'recipe.coffeeBrand': 'Kahve Markası',
        'recipe.grinder': 'Öğütücü',
        'recipe.grindSize': 'Öğütme Boyutu',
        'recipe.mainBrewer': 'Ana Demleme Cihazı',
        'recipe.roastDate': 'Kavurma Tarihi',
        'recipe.packageOpenDate': 'Paket Açma Tarihi',
        'recipe.grindDate': 'Öğütme Tarihi',
        'recipe.tasteNotes': 'Tat Notları',
        'recipe.preparationNotes': 'Hazırlama Notları',
        'recipe.personalNotes': 'Kişisel Notlar',
        'bean.processing': 'Kahve İşleme Yöntemi',
      };
      return map[k] ?? k;
    },
    locale: 'tr',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

vi.mock('../../api/client.ts', () => ({
  ApiError: class ApiError extends Error {
    code = 'UNKNOWN_ERROR';
    status = 500;
  },
}));

vi.mock('../../api/index.ts', () => ({
  recipeApi: { get: vi.fn(), update: vi.fn() },
}));

import { recipeApi } from '../../api/index.ts';
import type { RecipeDetailOutput } from '@brewform/shared/schemas';
import { RecipeEditPage } from './RecipeEditPage.tsx';

const mockRecipeApi = vi.mocked(recipeApi);

/** Minimal `RecipeDetailOutput` fixture cast through `unknown` — the edit
 * page reads only a subset of fields from `currentVersion` and the top-level
 * recipe row. */
const recipe = {
  id: 'r1',
  slug: 'test-recipe',
  title: 'Test Recipe',
  authorId: 'u1',
  visibility: 'public',
  likeCount: 0,
  commentCount: 0,
  forkCount: 0,
  forkedFromId: null,
  featured: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  versionCount: 1,
  currentVersion: {
    id: 'v1',
    versionNumber: 1,
    brewMethod: 'espresso_machine',
    drinkType: 'espresso',
    productName: null,
    coffeeBrand: null,
    coffeeProcessing: null,
    grinder: null,
    grindSize: null,
    brewerDetails: null,
    groundWeightGrams: null,
    extractionTimeSeconds: null,
    extractionVolumeMl: null,
    temperatureCelsius: null,
    tds: null,
    brewRatio: null,
    flowRate: null,
    preInfusionTimeSeconds: null,
    personalNotes: null,
    preparationNotes: '',
    rating: null,
    emojiTag: null,
    roastDate: null,
    packageOpenDate: null,
    grindDate: null,
    brewDate: null,
    bean: null,
  },
  author: null,
  tasteNotes: [],
  equipment: [],
  bean: null,
  photos: [],
  avgRating: null,
  ratingCount: 0,
  userRating: null,
  userLiked: false,
  userFavourited: false,
  favouriteCount: 0,
} as unknown as RecipeDetailOutput;

beforeEach(() => {
  vi.clearAllMocks();
  mockRecipeApi.get.mockResolvedValue(recipe);
});

describe('RecipeEditPage — tr locale spot-check', () => {
  it('renders the Turkish edit heading', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/recipes/:id/edit',
          element: <RecipeEditPage />,
        },
      ],
      { initialEntries: ['/recipes/r1/edit'] },
    );

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText('Tarifi Düzenle')).toBeInTheDocument();
    });
  });
});
