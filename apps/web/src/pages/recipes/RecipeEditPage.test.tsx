import { t } from '@brewform/shared/i18n';
import type { BeanOutput, EquipmentOutput, RecipeDetailOutput } from '@brewform/shared/schemas';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// The taste-note picker loads its own lookup through a fetcher; it is not under test here.
vi.mock('../../components/taste/TasteAutocomplete.tsx', () => ({
  TasteAutocomplete: () => null,
}));

vi.mock('../../api/index.ts', () => ({
  beanApi: { list: vi.fn() },
  recipeApi: { get: vi.fn(), update: vi.fn() },
}));

vi.mock('../../api/static-cache.ts', () => ({
  getEquipmentCached: vi.fn(),
}));

import { ApiError } from '../../api/errors.ts';
import { beanApi, recipeApi } from '../../api/index.ts';
import { getEquipmentCached } from '../../api/static-cache.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action, loader } from './RecipeEditPage.data.ts';
import { RecipeEditPage } from './RecipeEditPage.tsx';

const mockRecipeApi = vi.mocked(recipeApi);
const mockBeanApi = vi.mocked(beanApi);
const mockEquipment = vi.mocked(getEquipmentCached);

/** Minimal `RecipeDetailOutput` fixture cast through `unknown` — the edit
 * page reads only a subset of fields from `currentVersion` and the top-level
 * recipe row. */
const recipe = {
  id: 'r1',
  slug: 'test-recipe',
  title: 'Test Recipe',
  authorId: 'u1',
  visibility: 'public',
  currentVersion: {
    id: 'v1',
    versionNumber: 1,
    brewMethod: 'espresso_machine',
    drinkType: 'espresso',
    productName: null,
    coffeeBrand: null,
    coffeeProcessing: null,
    grinder: 'Niche Zero',
    grindSize: null,
    brewerDetails: null,
    groundWeightGrams: 18,
    extractionTimeSeconds: null,
    extractionVolumeMl: null,
    temperatureCelsius: null,
    tds: null,
    personalNotes: null,
    preparationNotes: 'Pull a shot',
    rating: null,
    emojiTag: null,
    roastDate: '2024-01-02T00:00:00.000Z',
    packageOpenDate: null,
    grindDate: null,
  },
  tasteNotes: [{ id: 'tn-1', name: 'Cocoa', intensity: 3 }],
  equipment: [],
} as unknown as RecipeDetailOutput;

/** Renders `/recipes/r1/edit` (plus a stand-in recipe page) through the real loader/action. */
function renderPage(locale: 'en' | 'tr' = 'en') {
  return renderWithAppProviders(
    [
      {
        path: '/recipes/:id/edit',
        loader,
        action,
        Component: RecipeEditPage,
        errorElement: <RouteErrorState />,
      },
      { path: '/recipes/:slug', element: <div>RECIPE PAGE</div> },
    ],
    { initialEntries: ['/recipes/r1/edit'], auth: 'user', locale },
  );
}

/** Runs the loader for recipe `id` and returns its result or what it threw. */
function runLoader(id = 'r1') {
  return loader({
    params: { id },
    request: new Request(`http://localhost/recipes/${id}/edit`),
    context: undefined,
  } as never).catch((err: unknown) => err);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockRecipeApi.get.mockResolvedValue(recipe);
  mockBeanApi.list.mockResolvedValue([{ id: 'b1' } as BeanOutput]);
  mockEquipment.mockResolvedValue([{ id: 'eq-1' } as EquipmentOutput]);
});

describe('/recipes/:id/edit loader', () => {
  it('loads the recipe, beans and equipment in parallel with request.signal', async () => {
    const result = await runLoader();

    expect(result).toEqual({
      recipe,
      beans: [{ id: 'b1' }],
      equipment: [{ id: 'eq-1' }],
    });
    expect(mockRecipeApi.get).toHaveBeenCalledWith('r1', { signal: expect.any(AbortSignal) });
    expect(mockBeanApi.list).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
    expect(mockEquipment).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  });

  it("logs 'RecipeEditPage loadRecipe failed' and rethrows when the recipe request rejects", async () => {
    const err = new TypeError('Failed to fetch');
    mockRecipeApi.get.mockRejectedValue(err);

    await expect(runLoader()).resolves.toBe(err);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err }),
      'RecipeEditPage loadRecipe failed',
    );
  });

  it("logs 'RecipeEditPage loadBeans failed' and rethrows when the beans request rejects", async () => {
    const err = new Error('beans down');
    mockBeanApi.list.mockRejectedValue(err);

    await expect(runLoader()).resolves.toBe(err);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err }),
      'RecipeEditPage loadBeans failed',
    );
  });

  it("logs 'RecipeEditPage loadEquipment failed' and rethrows when the equipment request rejects", async () => {
    const err = new Error('equipment down');
    mockEquipment.mockRejectedValue(err);

    await expect(runLoader()).resolves.toBe(err);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err }),
      'RecipeEditPage loadEquipment failed',
    );
  });

  it('turns an API 404 into a 404 Response without an error log', async () => {
    mockRecipeApi.get.mockRejectedValue(new ApiError('NOT_FOUND', 'missing', undefined, 404));

    const result = await runLoader('gone');

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(404);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('renders the route error state inside the shell instead of a blank form', async () => {
    mockRecipeApi.get.mockRejectedValue(new TypeError('Failed to fetch'));
    renderPage();

    expect(await screen.findByText(t('error.route.loadFailed'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('common.saveChanges') })).toBeNull();
  });
});

describe('RecipeEditPage', () => {
  it('renders the Turkish edit heading', async () => {
    renderPage('tr');

    expect(await screen.findByText(t('recipe.edit', 'tr'))).toBeInTheDocument();
  });

  it('pre-fills the form from the current version', async () => {
    renderPage();

    expect(await screen.findByDisplayValue('Test Recipe')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Niche Zero')).toBeInTheDocument();
    expect(screen.getByDisplayValue('18')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2024-01-02')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Pull a shot')).toBeInTheDocument();
  });

  it("labels the author's notes as public brewer notes with the visibility hint", async () => {
    renderPage();

    const field = await screen.findByRole('textbox', { name: t('recipe.brewerNotes') });
    expect(field).toHaveAccessibleDescription(t('recipe.brewerNotes.hint'));
    expect(screen.getByRole('heading', { name: t('recipe.brewerNotes') })).toBeInTheDocument();
  });

  it('shows the brewer-notes label and hint in Turkish', async () => {
    renderPage('tr');

    const field = await screen.findByRole('textbox', { name: t('recipe.brewerNotes', 'tr') });
    expect(field).toHaveAccessibleDescription(t('recipe.brewerNotes.hint', 'tr'));
  });

  it('shows the no-versions message for a recipe without a current version', async () => {
    mockRecipeApi.get.mockResolvedValue({ ...recipe, currentVersion: null } as never);
    renderPage();

    expect(await screen.findByText(t('recipe.editPage.noVersions'))).toBeInTheDocument();
  });

  it('saves through the action with request.signal and navigates to the recipe', async () => {
    mockRecipeApi.update.mockResolvedValue({ slug: 'renamed' } as RecipeDetailOutput);
    const user = userEvent.setup();
    renderPage();
    const title = await screen.findByDisplayValue('Test Recipe');

    await user.clear(title);
    await user.type(title, 'Renamed');
    await user.click(screen.getByRole('button', { name: t('common.saveChanges') }));

    expect(await screen.findByText('RECIPE PAGE')).toBeInTheDocument();
    expect(mockRecipeApi.update).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({
        title: 'Renamed',
        bumpVersion: false,
        grinder: 'Niche Zero',
        groundWeightGrams: 18,
        tds: null,
        tasteNoteIds: ['tn-1'],
        tasteNoteIntensities: { 'tn-1': 3 },
        roastDate: '2024-01-02',
      }),
      { signal: expect.any(AbortSignal) },
    );
  });

  it('lists validation details as bullets and stays on the form when saving fails', async () => {
    mockRecipeApi.update.mockRejectedValue(
      new ApiError('VALIDATION_ERROR', 'Invalid', [{ field: 'title', message: 'Too long' }], 400),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByDisplayValue('Test Recipe');

    await user.click(screen.getByRole('button', { name: t('common.saveChanges') }));

    expect(await screen.findByText('• title: Too long')).toBeInTheDocument();
    expect(screen.queryByText('RECIPE PAGE')).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'r1' }),
      'RecipeEditPage updateRecipe failed',
    );
  });

  it('logs mount and unmount', async () => {
    const { unmount } = renderPage();
    await screen.findByDisplayValue('Test Recipe');
    // The mount effect runs after the commit that renders the loader data.
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'RecipeEditPage mounted'),
    );

    unmount();
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'RecipeEditPage unmounted'),
    );
  });
});
