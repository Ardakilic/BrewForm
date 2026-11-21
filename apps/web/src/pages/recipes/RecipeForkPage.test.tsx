import { t } from '@brewform/shared/i18n';
import type { RecipeDetailOutput } from '@brewform/shared/schemas';
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
  recipeApi: { get: vi.fn(), fork: vi.fn() },
}));

import { ApiError } from '../../api/errors.ts';
import { recipeApi } from '../../api/index.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action, loader } from './RecipeForkPage.data.ts';
import { RecipeForkPage } from './RecipeForkPage.tsx';

const mockRecipeApi = vi.mocked(recipeApi);

const SOURCE = { id: 'recipe-99', title: 'Classic Espresso' } as RecipeDetailOutput;
const DEFAULT_TITLE = t('recipe.fork.ofTitle').replace('{title}', 'Classic Espresso');

/** Renders `/recipes/recipe-99/fork` (plus stand-in pages) through the real loader/action. */
function renderPage(locale: 'en' | 'tr' = 'en') {
  return renderWithAppProviders(
    [
      { path: '/', element: <div>HOME</div> },
      {
        path: '/recipes/:id/fork',
        loader,
        action,
        Component: RecipeForkPage,
        errorElement: <RouteErrorState />,
      },
      { path: '/recipes/:id/edit', element: <div>EDIT PAGE</div> },
    ],
    { initialEntries: ['/', '/recipes/recipe-99/fork'], auth: 'user', locale },
  );
}

/** Waits for the form, then clicks "Create Fork". */
async function submitFork(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: t('recipe.fork.create') }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockRecipeApi.get.mockResolvedValue(SOURCE);
  mockRecipeApi.fork.mockResolvedValue({ id: 'forked-42' } as RecipeDetailOutput);
});

describe('/recipes/:id/fork loader', () => {
  it('loads the source recipe with request.signal', async () => {
    renderPage();

    expect(await screen.findByText('Classic Espresso')).toBeInTheDocument();
    expect(mockRecipeApi.get).toHaveBeenCalledWith('recipe-99', {
      signal: expect.any(AbortSignal),
    });
  });

  it('renders the not-found page for an unknown recipe', async () => {
    mockRecipeApi.get.mockRejectedValue(new ApiError('NOT_FOUND', 'missing', undefined, 404));
    renderPage();

    expect(await screen.findByText(t('error.404'))).toBeInTheDocument();
    expect(mockLogger.error).not.toHaveBeenCalledWith(
      expect.anything(),
      'RecipeForkPage loadSourceRecipe failed',
    );
  });

  it('renders the route error state and logs when the source recipe fails to load', async () => {
    mockRecipeApi.get.mockRejectedValue(new Error('down'));
    renderPage();

    expect(await screen.findByText(t('error.route.loadFailed'))).toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'recipe-99' }),
      'RecipeForkPage loadSourceRecipe failed',
    );
  });
});

describe('RecipeForkPage — loaded state', () => {
  it('renders the heading, source title and the pre-filled fork title', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: t('recipe.fork') })).toBeInTheDocument();
    expect(screen.getByText(t('recipe.fork.forking'), { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Classic Espresso')).toBeInTheDocument();
    const input = screen.getByLabelText(t('recipe.fork.title')) as HTMLInputElement;
    expect(input.value).toBe(DEFAULT_TITLE);
    expect(input).toHaveAttribute('maxLength', '200');
  });

  it('is never indexed', async () => {
    renderPage();
    await screen.findByText('Classic Espresso');

    await waitFor(() =>
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex, nofollow',
      ),
    );
  });

  it('renders the Turkish heading', async () => {
    renderPage('tr');

    expect(
      await screen.findByRole('heading', { name: t('recipe.fork', 'tr') }),
    ).toBeInTheDocument();
  });

  it('navigates back when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: t('common.cancel') }));

    expect(await screen.findByText('HOME')).toBeInTheDocument();
  });
});

describe('/recipes/:id/fork action', () => {
  it('forks with the pre-filled title and request.signal, then opens the editor', async () => {
    const user = userEvent.setup();
    renderPage();

    await submitFork(user);

    expect(await screen.findByText('EDIT PAGE')).toBeInTheDocument();
    expect(mockRecipeApi.fork).toHaveBeenCalledWith('recipe-99', DEFAULT_TITLE, {
      signal: expect.any(AbortSignal),
    });
  });

  it('sends a custom, trimmed title', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = await screen.findByLabelText(t('recipe.fork.title'));

    await user.clear(input);
    await user.type(input, '  My Custom Fork  ');
    await submitFork(user);

    await waitFor(() =>
      expect(mockRecipeApi.fork).toHaveBeenCalledWith('recipe-99', 'My Custom Fork', {
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('sends no title when the input is blank', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = await screen.findByLabelText(t('recipe.fork.title'));

    await user.clear(input);
    await user.type(input, '   ');
    await submitFork(user);

    await waitFor(() =>
      expect(mockRecipeApi.fork).toHaveBeenCalledWith('recipe-99', undefined, {
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('disables the button and shows the pending label while forking', async () => {
    mockRecipeApi.fork.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderPage();

    await submitFork(user);

    expect(await screen.findByRole('button', { name: t('recipe.fork.creating') })).toBeDisabled();
  });

  it('shows the API error in a themed alert and stays on the page', async () => {
    mockRecipeApi.fork.mockRejectedValue(
      new ApiError('NOT_FOUND', 'RECIPE_NOT_FOUND', undefined, 404),
    );
    const user = userEvent.setup();
    renderPage();

    await submitFork(user);

    const alert = (await screen.findByText('RECIPE_NOT_FOUND')).closest(
      '[role="alert"]',
    ) as HTMLElement | null;
    expect(alert).toBeInTheDocument();
    expect(alert?.style.backgroundColor).toBe('var(--error-bg)');
    expect(screen.queryByText('EDIT PAGE')).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'recipe-99' }),
      'RecipeForkPage forkRecipe failed',
    );
  });

  it('falls back to the localised error for a non-Error rejection', async () => {
    mockRecipeApi.fork.mockRejectedValue('unknown error');
    const user = userEvent.setup();
    renderPage();

    await submitFork(user);

    expect(await screen.findByText(t('recipe.fork.forkError'))).toBeInTheDocument();
  });
});
