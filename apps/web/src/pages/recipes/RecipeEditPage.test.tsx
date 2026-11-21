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
// The stand-in shows how many notes are selected and can remove them all.
vi.mock('../../components/taste/TasteAutocomplete.tsx', () => ({
  TasteAutocomplete: ({
    selectedIds,
    onSelectionChange,
  }: {
    selectedIds: string[];
    onSelectionChange: (ids: string[]) => void;
  }) => (
    <button type="button" onClick={() => onSelectionChange([])}>
      remove all taste notes ({selectedIds.length})
    </button>
  ),
}));

vi.mock('../../api/index.ts', () => ({
  beanApi: { list: vi.fn() },
  recipeApi: { get: vi.fn(), update: vi.fn() },
  coffeeVarietyApi: { search: vi.fn() },
}));

vi.mock('../../api/static-cache.ts', () => ({
  getEquipmentCached: vi.fn(),
}));

import { ApiError } from '../../api/errors.ts';
import { beanApi, coffeeVarietyApi, recipeApi } from '../../api/index.ts';
import { getEquipmentCached } from '../../api/static-cache.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { coffeeVarietySearchLoader } from '../../routes/resources/coffee-varieties.ts';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action, loader } from './RecipeEditPage.data.ts';
import { RecipeEditPage } from './RecipeEditPage.tsx';

const mockRecipeApi = vi.mocked(recipeApi);
const mockBeanApi = vi.mocked(beanApi);
const mockEquipment = vi.mocked(getEquipmentCached);
const mockVarietySearch = vi.mocked(coffeeVarietyApi.search);

/** Equipment linked to the current version (the detail payload's flattened shape). */
const LINKED_EQUIPMENT = {
  id: 'eq-1',
  equipmentId: 'eq-1',
  name: 'Flair 58',
  type: 'espresso_machine',
};
/** The equipment lookup the loader returns. */
const EQUIPMENT_LOOKUP = [
  { id: 'eq-1', name: 'Flair 58', type: 'espresso_machine' },
  { id: 'eq-2', name: 'Niche Zero', type: 'grinder' },
] as EquipmentOutput[];

/** Minimal `RecipeDetailOutput` fixture cast through `unknown` — the edit
 * page reads only a subset of fields from `currentVersion` and the top-level
 * recipe row. */
const recipe = {
  id: 'r1',
  slug: 'test-recipe',
  title: 'Test Recipe',
  authorId: 'u1',
  visibility: 'public',
  versions: [{ versionNumber: 3 }, { versionNumber: 2 }, { versionNumber: 1 }],
  currentVersion: {
    id: 'v3',
    versionNumber: 3,
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
    coffeeVarietyId: 'var-bourbon',
    coffeeVarietyName: 'Bourbon',
  },
  tasteNotes: [{ id: 'tn-1', name: 'Cocoa', intensity: 3 }],
  equipment: [LINKED_EQUIPMENT],
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
      { path: '/resources/coffee-varieties/search', loader: coffeeVarietySearchLoader },
    ],
    { initialEntries: ['/recipes/r1/edit'], auth: 'user', locale },
  );
}

/** Clicks Save and returns the `RecipeUpdate` body the action forwarded to the API. */
async function saveAndGetBody(user: ReturnType<typeof userEvent.setup>) {
  mockRecipeApi.update.mockResolvedValue({ slug: 'test-recipe' } as RecipeDetailOutput);
  await user.click(screen.getByRole('button', { name: t('common.saveChanges') }));
  await screen.findByText('RECIPE PAGE');
  expect(mockRecipeApi.update).toHaveBeenCalledTimes(1);
  return mockRecipeApi.update.mock.calls[0][1] as Record<string, unknown>;
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
  mockEquipment.mockResolvedValue(EQUIPMENT_LOOKUP);
  mockVarietySearch.mockResolvedValue([{ id: 'var-gesha', name: 'Gesha', category: 'variety' }]);
});

describe('/recipes/:id/edit loader', () => {
  it('loads the recipe, beans and equipment in parallel with request.signal', async () => {
    const result = await runLoader();

    expect(result).toEqual({
      recipe,
      beans: [{ id: 'b1' }],
      equipment: EQUIPMENT_LOOKUP,
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
    // The same message is shown inline under the title input.
    expect(screen.getByText('Too long')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Recipe')).toBeInTheDocument();
    expect(screen.queryByText('RECIPE PAGE')).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'r1' }),
      'RecipeEditPage updateRecipe failed',
    );
  });

  it('replaces the field-level messages when the form is submitted again', async () => {
    mockRecipeApi.update
      .mockRejectedValueOnce(
        new ApiError(
          'VALIDATION_ERROR',
          'Invalid',
          [{ field: 'grinder', message: 'Bad grinder' }],
          400,
        ),
      )
      .mockRejectedValueOnce(
        new ApiError(
          'VALIDATION_ERROR',
          'Invalid',
          [{ field: 'tasteNoteIds.0', message: 'Unknown taste note' }],
          400,
        ),
      );
    const user = userEvent.setup();
    renderPage();
    await screen.findByDisplayValue('Test Recipe');
    const save = screen.getByRole('button', { name: t('common.saveChanges') });

    await user.click(save);
    expect(await screen.findByText('Bad grinder')).toBeInTheDocument();

    await user.click(save);
    expect(await screen.findByText('Unknown taste note')).toBeInTheDocument();
    expect(screen.queryByText('Bad grinder')).toBeNull();
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

describe('RecipeEditPage — honest saves', () => {
  it('sends grinder: null when the grinder is cleared, amending without a bump', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.clear(await screen.findByDisplayValue('Niche Zero'));

    const body = await saveAndGetBody(user);

    expect(body).toMatchObject({ grinder: null, bumpVersion: false });
  });

  it('sends null for every cleared optional input', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.clear(await screen.findByDisplayValue('18'));
    await user.clear(screen.getByDisplayValue('2024-01-02'));

    const body = await saveAndGetBody(user);

    expect(body).toMatchObject({ groundWeightGrams: null, roastDate: null });
    expect(body).toMatchObject({ productName: null, tds: null, rating: null, emojiTag: null });
  });

  it('omits the fields the page does not render, so the API keeps them', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByDisplayValue('Test Recipe');

    const body = await saveAndGetBody(user);

    for (const key of ['additionalPreparations', 'preInfusionTimeSeconds', 'vendorId', 'beanId']) {
      expect(key in body, key).toBe(false);
    }
  });

  it('sends tasteNoteIds: [] when every taste note is removed', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'remove all taste notes (1)' }));

    const body = await saveAndGetBody(user);

    expect(body).toMatchObject({ tasteNoteIds: [], tasteNoteIntensities: {} });
  });

  it('pre-populates the equipment and sends it unchanged', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('checkbox', { name: /Flair 58/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Niche Zero/ })).not.toBeChecked();
    const body = await saveAndGetBody(user);

    expect(body.equipmentIds).toEqual(['eq-1']);
  });

  it('sends equipmentIds: [] when every equipment item is unticked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('checkbox', { name: /Flair 58/ }));

    const body = await saveAndGetBody(user);

    expect(body.equipmentIds).toEqual([]);
  });

  it('lists linked equipment the lookup lacks, so it can be unticked', async () => {
    mockEquipment.mockResolvedValue([EQUIPMENT_LOOKUP[1]]);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('checkbox', { name: /Flair 58/ })).toBeChecked();
    const body = await saveAndGetBody(user);

    expect(body.equipmentIds).toEqual(['eq-1']);
  });

  it('pre-populates the coffee variety and sends a changed one', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('Bourbon')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: t('recipe.form.coffeeVariety') }), 'ges');
    await user.click(await screen.findByText('Gesha'));
    expect(screen.queryByText('Bourbon')).toBeNull();
    const body = await saveAndGetBody(user);

    expect(body.coffeeVarietyId).toBe('var-gesha');
    expect(mockVarietySearch).toHaveBeenCalledWith('ges', { signal: expect.any(AbortSignal) });
  });

  it('sends coffeeVarietyId: null when the variety is cleared', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      await screen.findByRole('button', { name: t('recipe.form.coffeeVariety.clear') }),
    );

    const body = await saveAndGetBody(user);

    expect(body.coffeeVarietyId).toBeNull();
  });
});

describe('RecipeEditPage — version choice', () => {
  it('labels the checkbox and describes an in-place update of the current version', async () => {
    renderPage();

    const checkbox = await screen.findByRole('checkbox', {
      name: t('recipe.editPage.bumpVersion'),
    });
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toHaveAccessibleDescription(
      t('recipe.editPage.bumpHint.off').replace('{current}', '3'),
    );
    expect(screen.getByText('Updates the current version (v3) in place')).toBeInTheDocument();
  });

  it('switches the hint to the next version number when ticked and sends bumpVersion', async () => {
    const user = userEvent.setup();
    renderPage();
    const checkbox = await screen.findByRole('checkbox', {
      name: t('recipe.editPage.bumpVersion'),
    });

    await user.click(checkbox);

    expect(checkbox).toHaveAccessibleDescription('Creates version v4; v3 stays unchanged');
    const body = await saveAndGetBody(user);
    expect(body.bumpVersion).toBe(true);
  });

  it('numbers the next version after the highest existing one', async () => {
    mockRecipeApi.get.mockResolvedValue({
      ...recipe,
      versions: [{ versionNumber: 3 }, { versionNumber: 7 }],
    } as unknown as RecipeDetailOutput);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('checkbox', { name: t('recipe.editPage.bumpVersion') }),
    );

    expect(screen.getByText('Creates version v8; v3 stays unchanged')).toBeInTheDocument();
  });

  it('shows the label and hint in Turkish', async () => {
    renderPage('tr');

    const checkbox = await screen.findByRole('checkbox', {
      name: t('recipe.editPage.bumpVersion', 'tr'),
    });
    expect(checkbox).toHaveAccessibleDescription(
      t('recipe.editPage.bumpHint.off', 'tr').replace('{current}', '3'),
    );
  });
});
