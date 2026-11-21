/**
 * Tests for RecipeFocusModePage and its `/recipes/:slug/focus` loader.
 *
 * Feature: recipe-detail-redesign
 * **Validates: Requirements 16.8**
 *
 * Covers:
 *  - Loader: request.signal forwarding, the cached taste-note lookup, 404 and failure states
 *  - A superseded navigation never renders the previous recipe under the new URL
 *  - Recipe title (h1) and author byline rendering
 *  - "Back to Recipe" navigation link
 *  - StatCards always rendered
 *  - BeanSection / TastingNotesSection conditional rendering
 *  - SEO canonical + noIndex
 */

import { t } from '@brewform/shared/i18n';
import type { RecipeDetailOutput, TasteNoteOutput } from '@brewform/shared/schemas';
import { act, screen, waitFor } from '@testing-library/react';
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

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../api/index.ts', () => ({
  recipeApi: { get: vi.fn() },
}));

vi.mock('../../api/static-cache.ts', () => ({
  getTasteNotesCached: vi.fn(),
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
  TastingNotesSection: ({ allTasteNotes }: { allTasteNotes: TasteNoteOutput[] }) => (
    <div data-testid="tasting-notes-section" data-lookup-size={allTasteNotes.length} />
  ),
}));

import { ApiError } from '../../api/errors.ts';
import { recipeApi } from '../../api/index.ts';
import { getTasteNotesCached } from '../../api/static-cache.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { loader } from './RecipeFocusModePage.data.ts';
import { RecipeFocusModePage } from './RecipeFocusModePage.tsx';

const mockRecipeApi = vi.mocked(recipeApi);
const mockTasteNotes = vi.mocked(getTasteNotesCached);

// ── Sample data ────────────────────────────────────────────────────────────

const sampleRecipe = {
  title: 'My Espresso',
  slug: 'my-espresso',
  author: { username: 'alice', displayName: 'Alice' },
  tasteNotes: [{ id: 'tn-1', name: 'Chocolate', intensity: 2 }],
  equipment: [],
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

/** The sample recipe with `overrides` applied (cast: only the fields the page reads). */
function recipeWith(overrides: Record<string, unknown> = {}): RecipeDetailOutput {
  return { ...sampleRecipe, ...overrides } as unknown as RecipeDetailOutput;
}

/** Renders `/recipes/:slug/focus` through the real loader. */
function renderPage(locale: 'en' | 'tr' = 'en', url = '/recipes/my-espresso/focus') {
  return renderWithAppProviders(
    [
      {
        path: '/recipes/:slug/focus',
        loader,
        Component: RecipeFocusModePage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: [url], locale },
  );
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockRecipeApi.get.mockResolvedValue(recipeWith());
  mockTasteNotes.mockResolvedValue([{ id: 'tn-1', name: 'Chocolate' } as TasteNoteOutput]);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('/recipes/:slug/focus loader', () => {
  it('loads the recipe and the cached taste-note lookup with request.signal', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('My Espresso');
    expect(mockRecipeApi.get).toHaveBeenCalledWith('my-espresso', {
      signal: expect.any(AbortSignal),
    });
    expect(mockTasteNotes).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
    expect(screen.getByTestId('tasting-notes-section')).toHaveAttribute('data-lookup-size', '1');
  });

  it('still renders the recipe when the taste-note lookup fails, and logs it', async () => {
    mockTasteNotes.mockRejectedValue(new Error('lookup down'));
    renderPage();

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('My Espresso');
    expect(screen.getByTestId('tasting-notes-section')).toHaveAttribute('data-lookup-size', '0');
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'RecipeFocusModePage loadTasteNotes failed',
    );
  });

  it('renders the route error state when the recipe fails to load', async () => {
    mockRecipeApi.get.mockRejectedValue(new Error('down'));
    renderPage('tr');

    expect(await screen.findByText(t('error.route.loadFailed', 'tr'))).toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'my-espresso' }),
      'RecipeFocusModePage loadRecipe failed',
    );
  });

  it('renders the not-found page for an unknown recipe', async () => {
    mockRecipeApi.get.mockRejectedValue(new ApiError('NOT_FOUND', 'missing', undefined, 404));
    renderPage();

    expect(await screen.findByText(t('error.404'))).toBeInTheDocument();
  });

  it('aborts a superseded load and never renders recipe A under recipe B’s URL', async () => {
    let signalA: AbortSignal | undefined;
    let resolveB: (r: RecipeDetailOutput) => void = () => {};
    mockRecipeApi.get.mockImplementation((slug: string, opts?: { signal?: AbortSignal }) => {
      if (slug === 'a') {
        signalA = opts?.signal;
        return new Promise(() => {});
      }
      return new Promise((resolve) => {
        resolveB = resolve;
      });
    });
    const { router } = renderPage('en', '/recipes/a/focus');
    await waitFor(() => expect(signalA).toBeDefined());

    // Not awaited: the navigation settles only once B's loader resolves below.
    act(() => {
      void router.navigate('/recipes/b/focus');
    });
    await waitFor(() => expect(signalA?.aborted).toBe(true));

    await act(async () => {
      resolveB(recipeWith({ title: 'Recipe B', slug: 'b' }));
    });
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Recipe B');
    expect(screen.queryByText('My Espresso')).not.toBeInTheDocument();
  });
});

describe('RecipeFocusModePage — recipe title and author', () => {
  it('renders the recipe title in h1 and the "By" byline — English', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('My Espresso');
    expect(screen.getByText(new RegExp(`^${t('recipe.focusMode.by')} Alice`))).toBeInTheDocument();
  });

  it('renders the byline with the Turkish prefix', async () => {
    renderPage('tr');

    await screen.findByText('My Espresso');
    expect(
      screen.getByText(new RegExp(`^${t('recipe.focusMode.by', 'tr')} Alice`)),
    ).toBeInTheDocument();
  });
});

describe('RecipeFocusModePage — Back to Recipe link', () => {
  it('points to /recipes/:slug without a double arrow', async () => {
    renderPage();

    const link = await screen.findByRole('link', { name: t('recipe.focusMode.backToRecipe') });
    expect(link).toHaveAttribute('href', '/recipes/my-espresso');
    expect(link.textContent).not.toMatch(/←\s*←/);
  });
});

describe('RecipeFocusModePage — sections', () => {
  it('renders StatCards', async () => {
    renderPage();
    expect(await screen.findByTestId('stat-cards')).toBeInTheDocument();
  });

  it('shows BeanSection when bean data is present', async () => {
    renderPage();
    expect(await screen.findByTestId('bean-section')).toBeInTheDocument();
  });

  it('hides BeanSection when no bean data', async () => {
    mockRecipeApi.get.mockResolvedValue(
      recipeWith({
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
      }),
    );
    renderPage();

    await screen.findByText('My Espresso');
    expect(screen.queryByTestId('bean-section')).not.toBeInTheDocument();
  });

  it('shows TastingNotesSection when only personalNotes is present', async () => {
    mockRecipeApi.get.mockResolvedValue(recipeWith({ tasteNotes: [] }));
    renderPage();

    expect(await screen.findByTestId('tasting-notes-section')).toBeInTheDocument();
  });

  it.each([null, ''])(
    'hides TastingNotesSection with no taste notes and personalNotes=%j',
    async (personalNotes) => {
      mockRecipeApi.get.mockResolvedValue(
        recipeWith({
          tasteNotes: [],
          currentVersion: { ...sampleRecipe.currentVersion, personalNotes },
        }),
      );
      renderPage();

      await screen.findByText('My Espresso');
      expect(screen.queryByTestId('tasting-notes-section')).not.toBeInTheDocument();
    },
  );
});

describe('RecipeFocusModePage — canonical + noIndex SEO', () => {
  it('sets robots noindex and a canonical link to the recipe page (not the focus URL)', async () => {
    renderPage();
    await screen.findByText('My Espresso');

    await waitFor(() =>
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex, nofollow',
      ),
    );
    const canonical = document.head.querySelector('link[rel="canonical"]')?.getAttribute('href');
    expect(canonical).toMatch(/\/recipes\/my-espresso$/);
    expect(canonical).not.toContain('/focus');
  });
});

describe('RecipeFocusModePage — mount/unmount logging', () => {
  it('logs mount and unmount', async () => {
    const { unmount } = renderPage();
    await screen.findByText('My Espresso');
    // The mount effect runs after the commit that renders the loader data.
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'RecipeFocusModePage mounted'),
    );

    unmount();
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'RecipeFocusModePage unmounted'),
    );
  });
});
