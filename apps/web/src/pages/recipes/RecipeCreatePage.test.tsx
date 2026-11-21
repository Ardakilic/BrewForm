import { t } from '@brewform/shared/i18n';
import type {
  BeanOutput,
  EquipmentOutput,
  RecipeDetailOutput,
  SetupOutput,
} from '@brewform/shared/schemas';
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

vi.mock('../../api/index.ts', () => ({
  beanApi: { get: vi.fn() },
  recipeApi: { create: vi.fn() },
  setupApi: { list: vi.fn() },
  coffeeVarietyApi: { search: vi.fn() },
}));

vi.mock('../../api/static-cache.ts', () => ({
  getEquipmentCached: vi.fn(),
}));

// The taste-note picker loads its own lookup through a fetcher; it is not under test here.
vi.mock('../../components/taste/TasteAutocomplete.tsx', () => ({
  TasteAutocomplete: () => null,
}));

import { ApiError } from '../../api/errors.ts';
import { beanApi, coffeeVarietyApi, recipeApi, setupApi } from '../../api/index.ts';
import { getEquipmentCached } from '../../api/static-cache.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { coffeeVarietySearchLoader } from '../../routes/resources/coffee-varieties.ts';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action, loader } from './RecipeCreatePage.data.ts';
import { RecipeCreatePage } from './RecipeCreatePage.tsx';

const mockRecipeApi = vi.mocked(recipeApi);
const mockBeanApi = vi.mocked(beanApi);
const mockSetupApi = vi.mocked(setupApi);
const mockEquipment = vi.mocked(getEquipmentCached);
const mockVarietySearch = vi.mocked(coffeeVarietyApi.search);

const GRINDER = { id: 'eq-1', name: 'Niche Zero', type: 'grinder' } as EquipmentOutput;
const SETUP = {
  id: 'setup-1',
  name: 'Morning bar',
  isDefault: true,
  grinder: 'Niche Zero',
  brewerDetails: '58mm basket',
} as SetupOutput;
const BEAN = {
  id: 'bean-1',
  name: 'Yirgacheffe',
  brand: null,
  roaster: 'Square Mile',
  processing: 'Washed',
} as unknown as BeanOutput;

/** Renders `/recipes/new` (plus a stand-in recipe page) through the real loader and action. */
function renderPage(url = '/recipes/new') {
  return renderWithAppProviders(
    [
      {
        path: '/recipes/new',
        loader,
        action,
        Component: RecipeCreatePage,
        errorElement: <RouteErrorState />,
      },
      { path: '/recipes/:slug', element: <div>RECIPE PAGE</div> },
      { path: '/resources/coffee-varieties/search', loader: coffeeVarietySearchLoader },
    ],
    { initialEntries: [url], auth: 'user' },
  );
}

/** Fills the two required fields (title and preparation notes). */
async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText(t('recipe.form.titlePlaceholder')), 'Morning shot');
  await user.type(screen.getByPlaceholderText(t('recipe.form.preparationPlaceholder')), 'Pull it');
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockEquipment.mockResolvedValue([GRINDER]);
  mockSetupApi.list.mockResolvedValue([SETUP]);
  mockBeanApi.get.mockResolvedValue(BEAN);
  mockVarietySearch.mockResolvedValue([{ id: 'var-gesha', name: 'Gesha', category: 'variety' }]);
});

/** Clicks submit and returns the `RecipeCreate` body the action forwarded to the API. */
async function submitAndGetBody(user: ReturnType<typeof userEvent.setup>) {
  mockRecipeApi.create.mockResolvedValue({ slug: 'morning-shot' } as RecipeDetailOutput);
  await user.click(screen.getByRole('button', { name: t('recipe.createPage.submit') }));
  await screen.findByText('RECIPE PAGE');
  expect(mockRecipeApi.create).toHaveBeenCalledTimes(1);
  return mockRecipeApi.create.mock.calls[0][0] as Record<string, unknown>;
}

describe('/recipes/new loader', () => {
  it('loads equipment and setups with request.signal and no bean without ?beanId', async () => {
    renderPage();

    expect(await screen.findByText('Niche Zero')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Morning bar/ })).toBeInTheDocument();
    expect(mockEquipment).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
    expect(mockSetupApi.list).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
    expect(mockBeanApi.get).not.toHaveBeenCalled();
  });

  it('pre-fills the coffee fields from the ?beanId bean', async () => {
    renderPage('/recipes/new?beanId=bean-1');

    expect(await screen.findByDisplayValue('Yirgacheffe')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Square Mile')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Washed')).toBeInTheDocument();
    expect(mockBeanApi.get).toHaveBeenCalledWith('bean-1', { signal: expect.any(AbortSignal) });
  });

  it('still opens the form when the ?beanId bean cannot be loaded, and logs it', async () => {
    mockBeanApi.get.mockRejectedValue(new ApiError('NOT_FOUND', 'missing', undefined, 404));
    renderPage('/recipes/new?beanId=gone');

    expect(await screen.findByText('Niche Zero')).toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ beanId: 'gone' }),
      'RecipeCreatePage loadBean failed',
    );
  });

  it('renders the route error state when the equipment lookup fails', async () => {
    mockEquipment.mockRejectedValue(new Error('down'));
    renderPage();

    expect(await screen.findByText(t('error.route.loadFailed'))).toBeInTheDocument();
    expect(screen.queryByText(t('recipe.createPage.heading'))).not.toBeInTheDocument();
  });

  it('redirects a final 401 to the login page with a return path', async () => {
    mockSetupApi.list.mockRejectedValue(new ApiError('UNAUTHORIZED', 'no', undefined, 401));
    const result = await loader({
      params: {},
      request: new Request('http://localhost/recipes/new'),
      context: undefined,
    } as never).catch((err: unknown) => err);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get('Location')).toBe('/login?next=%2Frecipes%2Fnew');
  });
});

describe('/recipes/new action', () => {
  it('creates the recipe with request.signal and navigates to it', async () => {
    mockRecipeApi.create.mockResolvedValue({ slug: 'morning-shot' } as RecipeDetailOutput);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Niche Zero');

    await fillRequired(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: t('recipe.createPage.submit') }));

    expect(await screen.findByText('RECIPE PAGE')).toBeInTheDocument();
    expect(mockRecipeApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Morning shot',
        preparationNotes: 'Pull it',
        visibility: 'draft',
        isFavourite: false,
        equipmentIds: ['eq-1'],
      }),
      { signal: expect.any(AbortSignal) },
    );
  });

  it('auto-fills from the ?setupId setup and sends it', async () => {
    mockRecipeApi.create.mockResolvedValue({ slug: 'morning-shot' } as RecipeDetailOutput);
    const user = userEvent.setup();
    renderPage('/recipes/new?setupId=setup-1');
    expect(await screen.findByDisplayValue('58mm basket')).toBeInTheDocument();

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: t('recipe.createPage.submit') }));

    await screen.findByText('RECIPE PAGE');
    expect(mockRecipeApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ setupId: 'setup-1', grinder: 'Niche Zero' }),
      expect.anything(),
    );
  });

  it('lists API validation details and stays on the form when creation fails', async () => {
    mockRecipeApi.create.mockRejectedValue(
      new ApiError('VALIDATION_ERROR', 'Invalid', [{ field: 'title', message: 'Too short' }], 400),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Niche Zero');

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: t('recipe.createPage.submit') }));

    expect(await screen.findByText('title: Too short')).toBeInTheDocument();
    expect(screen.queryByText('RECIPE PAGE')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Morning shot')).toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(ApiError) }),
      'RecipeCreatePage createRecipe failed',
    );
  });

  it('shows the API message for a non-validation failure', async () => {
    mockRecipeApi.create.mockRejectedValue(new Error('Network down'));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Niche Zero');

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: t('recipe.createPage.submit') }));

    expect(await screen.findByText('Network down')).toBeInTheDocument();
  });
});

describe('RecipeCreatePage — bean and coffee variety links', () => {
  it('sends beanId when opened from a bean (?beanId=)', async () => {
    const user = userEvent.setup();
    renderPage('/recipes/new?beanId=bean-1');
    await screen.findByDisplayValue('Yirgacheffe');

    await fillRequired(user);
    const body = await submitAndGetBody(user);

    expect(body.beanId).toBe('bean-1');
  });

  it('sends no beanId without ?beanId', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Niche Zero');

    await fillRequired(user);
    const body = await submitAndGetBody(user);

    expect('beanId' in body).toBe(false);
  });

  it('sends no beanId when the ?beanId bean could not be loaded', async () => {
    mockBeanApi.get.mockRejectedValue(new ApiError('NOT_FOUND', 'missing', undefined, 404));
    const user = userEvent.setup();
    renderPage('/recipes/new?beanId=gone');
    await screen.findByText('Niche Zero');

    await fillRequired(user);
    const body = await submitAndGetBody(user);

    expect('beanId' in body).toBe(false);
  });

  it('sends the selected coffee variety as coffeeVarietyId', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Niche Zero');

    await user.type(screen.getByRole('textbox', { name: t('recipe.form.coffeeVariety') }), 'ges');
    await user.click(await screen.findByText('Gesha'));
    await fillRequired(user);
    const body = await submitAndGetBody(user);

    expect(body.coffeeVarietyId).toBe('var-gesha');
    expect(mockVarietySearch).toHaveBeenCalledWith('ges', { signal: expect.any(AbortSignal) });
  });

  it('sends no coffeeVarietyId when no variety is picked', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Niche Zero');

    await fillRequired(user);
    const body = await submitAndGetBody(user);

    expect('coffeeVarietyId' in body).toBe(false);
  });
});

describe('RecipeCreatePage — coffee dates', () => {
  it('sends the roast, package-open and grind dates that were entered', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Niche Zero');

    await fillRequired(user);
    await user.type(screen.getByLabelText(t('recipe.roastDate')), '2024-03-01');
    await user.type(screen.getByLabelText(t('recipe.packageOpenDate')), '2024-03-05');
    await user.type(screen.getByLabelText(t('recipe.grindDate')), '2024-03-06');
    const body = await submitAndGetBody(user);

    expect(body).toMatchObject({
      roastDate: '2024-03-01',
      packageOpenDate: '2024-03-05',
      grindDate: '2024-03-06',
    });
  });

  it('sends no date fields when they are left empty', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Niche Zero');

    expect(screen.getByLabelText(t('recipe.roastDate'))).toHaveValue('');
    expect(screen.getByLabelText(t('recipe.packageOpenDate'))).toHaveValue('');
    expect(screen.getByLabelText(t('recipe.grindDate'))).toHaveValue('');
    await fillRequired(user);
    const body = await submitAndGetBody(user);

    expect('roastDate' in body).toBe(false);
    expect('packageOpenDate' in body).toBe(false);
    expect('grindDate' in body).toBe(false);
  });
});

describe('RecipeCreatePage — brewer notes', () => {
  it("labels the author's notes as public brewer notes with the visibility hint", async () => {
    renderPage();

    const field = await screen.findByRole('textbox', { name: t('recipe.brewerNotes') });
    expect(field).toHaveAccessibleDescription(t('recipe.brewerNotes.hint'));
    expect(screen.getByRole('heading', { name: t('recipe.brewerNotes') })).toBeInTheDocument();
  });
});

describe('RecipeCreatePage — mount/unmount logging', () => {
  it('logs mount and unmount', async () => {
    const { unmount } = renderPage();
    await screen.findByText('Niche Zero');
    // The mount effect runs after the commit that renders the loader data.
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'RecipeCreatePage mounted'),
    );

    mockLogger.debug.mockClear();
    unmount();
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'RecipeCreatePage unmounted'),
    );
  });
});
