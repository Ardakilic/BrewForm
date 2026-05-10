import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RecipeFocusModePage } from './RecipeFocusModePage';

vi.mock('react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useParams: vi.fn(),
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../api/index.ts', () => ({
  recipeApi: { get: vi.fn() },
}));

vi.mock('@brewform/shared/constants', () => ({
  EMOJI_TAGS: [{ key: 'fire', emoji: '🔥', label: 'Fire' }],
}));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: vi.fn(() => null),
}));

import { useParams } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { recipeApi } from '../../api/index.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';

const mockUseParams = vi.mocked(useParams);
const mockUseTranslation = vi.mocked(useTranslation);
const mockRecipeApi = vi.mocked(recipeApi);
const mockSEOHead = vi.mocked(SEOHead);

// ── Translation helpers ────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
    'common.loading': 'Loading...',
    'recipe.brewParams': 'Brew Parameters',
    'recipe.tasteNotes': 'Taste Notes',
    'recipe.grinder': 'Grinder',
    'recipe.focusMode.backToRecipe': '← Back to Recipe',
    'recipe.focusMode.by': 'By',
    'recipe.focusMode.method': 'Method',
    'recipe.focusMode.drink': 'Drink',
    'recipe.focusMode.product': 'Product',
    'recipe.focusMode.brand': 'Brand',
    'recipe.focusMode.grind': 'Grind',
    'recipe.focusMode.dose': 'Dose',
    'recipe.focusMode.time': 'Time',
    'recipe.focusMode.yield': 'Yield',
    'recipe.focusMode.temp': 'Temp',
    'recipe.focusMode.ratio': 'Ratio',
    'recipe.focusMode.rating': 'Rating',
    'recipe.focusMode.notes': 'Notes',
  };
  return map[key] ?? key;
};

const trT = (key: string) => {
  const map: Record<string, string> = {
    'common.loading': 'Yükleniyor...',
    'recipe.brewParams': 'Demleme Parametreleri',
    'recipe.tasteNotes': 'Tat Notları',
    'recipe.grinder': 'Öğütücü',
    'recipe.focusMode.backToRecipe': '← Tarife Dön',
    'recipe.focusMode.by': 'Yazan',
    'recipe.focusMode.method': 'Yöntem',
    'recipe.focusMode.drink': 'İçecek',
    'recipe.focusMode.product': 'Ürün',
    'recipe.focusMode.brand': 'Marka',
    'recipe.focusMode.grind': 'Öğütme',
    'recipe.focusMode.dose': 'Doz',
    'recipe.focusMode.time': 'Süre',
    'recipe.focusMode.yield': 'Verim',
    'recipe.focusMode.temp': 'Sıcaklık',
    'recipe.focusMode.ratio': 'Oran',
    'recipe.focusMode.rating': 'Puan',
    'recipe.focusMode.notes': 'Notlar',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

const sampleRecipe = {
  title: 'My Espresso',
  slug: 'my-espresso',
  author: { username: 'alice', displayName: 'Alice' },
  tasteNotes: [{ id: 'tn-1', name: 'Chocolate' }],
  currentVersion: {
    brewMethod: 'ESPRESSO',
    drinkType: 'ESPRESSO',
    productName: 'Ethiopia Yirgacheffe',
    coffeeBrand: 'Blue Bottle',
    grinder: 'Niche Zero',
    grindSize: '2.5',
    groundWeightGrams: 18,
    extractionTimeSeconds: 28,
    extractionVolumeMl: 36,
    temperatureCelsius: 93,
    brewRatio: 2,
    rating: 8,
    emojiTag: 'fire',
    personalNotes: 'Great shot today.',
  },
};

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseParams.mockReturnValue({ slug: 'my-espresso' });
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockRecipeApi.get.mockResolvedValue(sampleRecipe as unknown as Record<string, unknown>);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('RecipeFocusModePage — loading state', () => {
  it('shows "Loading..." while fetching — English', () => {
    mockRecipeApi.get.mockReturnValue(new Promise(() => {}));
    render(<RecipeFocusModePage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows "Yükleniyor..." while fetching — Turkish', () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockRecipeApi.get.mockReturnValue(new Promise(() => {}));
    render(<RecipeFocusModePage />);
    expect(screen.getByText('Yükleniyor...')).toBeInTheDocument();
  });
});

describe('RecipeFocusModePage — i18n section headings', () => {
  it('renders back link, author prefix, and section headings using t() — English', async () => {
    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    expect(screen.getByRole('link', { name: '← Back to Recipe' })).toBeInTheDocument();
    expect(screen.getByText(/^By Alice/)).toBeInTheDocument();
    expect(screen.getByText('Brew Parameters')).toBeInTheDocument();
    expect(screen.getByText('Taste Notes')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });

  it('renders section headings in Turkish when locale is tr', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    expect(screen.getByRole('link', { name: '← Tarife Dön' })).toBeInTheDocument();
    expect(screen.getByText(/^Yazan Alice/)).toBeInTheDocument();
    expect(screen.getByText('Demleme Parametreleri')).toBeInTheDocument();
    expect(screen.getByText('Tat Notları')).toBeInTheDocument();
    expect(screen.getByText('Notlar')).toBeInTheDocument();
  });
});

describe('RecipeFocusModePage — i18n param labels', () => {
  it('renders param labels using t() — English', async () => {
    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    expect(screen.getByText('Method')).toBeInTheDocument();
    expect(screen.getByText('Drink')).toBeInTheDocument();
    expect(screen.getByText('Product')).toBeInTheDocument();
    expect(screen.getByText('Brand')).toBeInTheDocument();
    expect(screen.getByText('Grinder')).toBeInTheDocument();
    expect(screen.getByText('Grind')).toBeInTheDocument();
    expect(screen.getByText('Dose')).toBeInTheDocument();
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText('Yield')).toBeInTheDocument();
    expect(screen.getByText('Temp')).toBeInTheDocument();
    expect(screen.getByText('Ratio')).toBeInTheDocument();
    expect(screen.getByText('Rating')).toBeInTheDocument();
  });

  it('renders param labels in Turkish when locale is tr', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    expect(screen.getByText('Yöntem')).toBeInTheDocument();
    expect(screen.getByText('İçecek')).toBeInTheDocument();
    expect(screen.getByText('Ürün')).toBeInTheDocument();
    expect(screen.getByText('Marka')).toBeInTheDocument();
    expect(screen.getByText('Öğütücü')).toBeInTheDocument();
    expect(screen.getByText('Öğütme')).toBeInTheDocument();
    expect(screen.getByText('Doz')).toBeInTheDocument();
    expect(screen.getByText('Süre')).toBeInTheDocument();
    expect(screen.getByText('Verim')).toBeInTheDocument();
    expect(screen.getByText('Sıcaklık')).toBeInTheDocument();
    expect(screen.getByText('Oran')).toBeInTheDocument();
    expect(screen.getByText('Puan')).toBeInTheDocument();
  });
});

describe('RecipeFocusModePage — content rendering', () => {
  it('renders recipe title and author', async () => {
    render(<RecipeFocusModePage />);

    await waitFor(() => {
      expect(screen.getByText('My Espresso')).toBeInTheDocument();
      expect(screen.getByText(/Alice/)).toBeInTheDocument();
    });
  });

  it('renders taste notes', async () => {
    render(<RecipeFocusModePage />);

    await waitFor(() => {
      expect(screen.getByText('Chocolate')).toBeInTheDocument();
    });
  });

  it('renders personal notes', async () => {
    render(<RecipeFocusModePage />);

    await waitFor(() => {
      expect(screen.getByText('Great shot today.')).toBeInTheDocument();
    });
  });

  it('back link points to the recipe detail page', async () => {
    render(<RecipeFocusModePage />);

    await waitFor(() => screen.getByRole('link', { name: '← Back to Recipe' }));

    expect(screen.getByRole('link', { name: '← Back to Recipe' })).toHaveAttribute(
      'href',
      '/recipes/my-espresso',
    );
  });

  it('does not render taste notes section when tasteNotes is empty', async () => {
    mockRecipeApi.get.mockResolvedValue({
      ...sampleRecipe,
      tasteNotes: [],
    } as unknown as Record<string, unknown>);

    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    expect(screen.queryByText('Taste Notes')).not.toBeInTheDocument();
  });

  it('does not render notes section when personalNotes is absent', async () => {
    mockRecipeApi.get.mockResolvedValue({
      ...sampleRecipe,
      currentVersion: { ...sampleRecipe.currentVersion, personalNotes: null },
    } as unknown as Record<string, unknown>);

    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
  });
});

describe('RecipeFocusModePage — canonical + noindex SEO', () => {
  it('passes noIndex=true to SEOHead', async () => {
    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    const calls = mockSEOHead.mock.calls;
    const lastProps = calls[calls.length - 1][0] as { noIndex?: boolean; canonical?: string };
    expect(lastProps.noIndex).toBe(true);
  });

  it('passes canonical pointing to /recipes/:slug', async () => {
    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    const calls = mockSEOHead.mock.calls;
    const lastProps = calls[calls.length - 1][0] as { noIndex?: boolean; canonical?: string };
    expect(lastProps.canonical).toMatch(/\/recipes\/my-espresso$/);
  });

  it('canonical does NOT point to the focus URL', async () => {
    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    const calls = mockSEOHead.mock.calls;
    const lastProps = calls[calls.length - 1][0] as { canonical?: string };
    expect(lastProps.canonical).not.toContain('/focus');
  });
});
