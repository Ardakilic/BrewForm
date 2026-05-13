/**
 * Tests for RecipeFocusModePage
 *
 * Feature: recipe-detail-redesign
 * **Validates: Requirements 16.8**
 *
 * Covers:
 *  - Loading state
 *  - Recipe title (h1) and author byline rendering
 *  - "Back to Recipe" navigation link
 *  - StatCards always rendered
 *  - BeanSection conditional rendering
 *  - TastingNotesSection conditional rendering
 *  - SEO canonical + noIndex
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RecipeFocusModePage } from './RecipeFocusModePage';

// ── Mocks ──────────────────────────────────────────────────────────────────

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
  tasteApi: { flat: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: vi.fn(() => null),
}));

vi.mock('../../components/recipe/StatCards.tsx', () => ({
  StatCards: () => <div data-testid="stat-cards" />,
}));

vi.mock('../../components/recipe/BeanSection.tsx', () => ({
  BeanSection: () => <div data-testid="bean-section" />,
}));

vi.mock('../../components/recipe/BrewTimeline.tsx', () => ({
  BrewTimeline: () => <div data-testid="brew-timeline" />,
}));

vi.mock('../../components/recipe/EquipmentSection.tsx', () => ({
  EquipmentSection: () => <div data-testid="equipment-section" />,
}));

vi.mock('../../components/recipe/TastingNotesSection.tsx', () => ({
  TastingNotesSection: () => <div data-testid="tasting-notes-section" />,
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
    'recipe.focusMode.backToRecipe': 'Back to Recipe',
    'recipe.focusMode.by': 'By',
  };
  return map[key] ?? key;
};

const trT = (key: string) => {
  const map: Record<string, string> = {
    'common.loading': 'Yükleniyor...',
    'recipe.focusMode.backToRecipe': 'Tarife Dön',
    'recipe.focusMode.by': 'Yazan',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

// ── Sample data ────────────────────────────────────────────────────────────

const sampleRecipe = {
  title: 'My Espresso',
  slug: 'my-espresso',
  author: { username: 'alice', displayName: 'Alice' },
  tasteNotes: [{ id: 'tn-1', name: 'Chocolate', intensity: 2 }],
  currentVersion: {
    brewMethod: 'ESPRESSO',
    drinkType: 'ESPRESSO',
    productName: 'Ethiopia Yirgacheffe',
    coffeeBrand: 'Blue Bottle',
    groundWeightGrams: 18,
    extractionTimeSeconds: 28,
    extractionVolumeMl: 36,
    temperatureCelsius: 93,
    brewRatio: 2,
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

describe('RecipeFocusModePage — recipe title and author', () => {
  it('renders recipe title in h1', async () => {
    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My Espresso');
  });

  it('renders author byline', async () => {
    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    expect(screen.getByText(/Alice/)).toBeInTheDocument();
  });

  it('renders author byline with "By" prefix — English', async () => {
    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    expect(screen.getByText(/^By Alice/)).toBeInTheDocument();
  });

  it('renders author byline with "Yazan" prefix — Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    expect(screen.getByText(/^Yazan Alice/)).toBeInTheDocument();
  });
});

describe('RecipeFocusModePage — Back to Recipe link', () => {
  it('renders Back to Recipe link', async () => {
    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    expect(screen.getByRole('link', { name: /Back to Recipe/i })).toBeInTheDocument();
  });

  it('back link href points to /recipes/:slug', async () => {
    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    expect(screen.getByRole('link', { name: /Back to Recipe/i })).toHaveAttribute(
      'href',
      '/recipes/my-espresso',
    );
  });

  it('back link does NOT contain double arrow', async () => {
    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    const link = screen.getByRole('link', { name: /Back to Recipe/i });
    expect(link.textContent).not.toMatch(/←\s*←/);
  });
});

describe('RecipeFocusModePage — StatCards', () => {
  it('renders StatCards', async () => {
    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    expect(screen.getByTestId('stat-cards')).toBeInTheDocument();
  });
});

describe('RecipeFocusModePage — BeanSection conditional rendering', () => {
  it('shows BeanSection when bean data is present', async () => {
    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    expect(screen.getByTestId('bean-section')).toBeInTheDocument();
  });

  it('hides BeanSection when no bean data', async () => {
    mockRecipeApi.get.mockResolvedValue({
      ...sampleRecipe,
      currentVersion: {
        ...sampleRecipe.currentVersion,
        productName: null,
        coffeeBrand: null,
        coffeeProcessing: null,
        roastDate: null,
        packageOpenDate: null,
        grindDate: null,
        bean: null,
      },
    } as unknown as Record<string, unknown>);

    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    expect(screen.queryByTestId('bean-section')).not.toBeInTheDocument();
  });
});

describe('RecipeFocusModePage — TastingNotesSection conditional rendering', () => {
  it('shows TastingNotesSection when taste notes are present', async () => {
    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    expect(screen.getByTestId('tasting-notes-section')).toBeInTheDocument();
  });

  it('shows TastingNotesSection when personalNotes is present but tasteNotes is empty', async () => {
    mockRecipeApi.get.mockResolvedValue({
      ...sampleRecipe,
      tasteNotes: [],
      currentVersion: {
        ...sampleRecipe.currentVersion,
        personalNotes: 'Great shot today.',
      },
    } as unknown as Record<string, unknown>);

    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    expect(screen.getByTestId('tasting-notes-section')).toBeInTheDocument();
  });

  it('hides TastingNotesSection when no taste notes and no personalNotes', async () => {
    mockRecipeApi.get.mockResolvedValue({
      ...sampleRecipe,
      tasteNotes: [],
      currentVersion: {
        ...sampleRecipe.currentVersion,
        personalNotes: null,
      },
    } as unknown as Record<string, unknown>);

    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    expect(screen.queryByTestId('tasting-notes-section')).not.toBeInTheDocument();
  });

  it('hides TastingNotesSection when personalNotes is empty string and no taste notes', async () => {
    mockRecipeApi.get.mockResolvedValue({
      ...sampleRecipe,
      tasteNotes: [],
      currentVersion: {
        ...sampleRecipe.currentVersion,
        personalNotes: '',
      },
    } as unknown as Record<string, unknown>);

    render(<RecipeFocusModePage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    expect(screen.queryByTestId('tasting-notes-section')).not.toBeInTheDocument();
  });
});

describe('RecipeFocusModePage — canonical + noIndex SEO', () => {
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
