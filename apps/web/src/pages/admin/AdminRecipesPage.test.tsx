import { t } from '@brewform/shared/i18n';
import type { PaginatedResponse } from '@brewform/shared/schemas';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  adminApi: { getRecipes: vi.fn(), setRecipeVisibility: vi.fn(), deleteRecipe: vi.fn() },
}));

import { adminApi } from '../../api/index.ts';
import type { AdminRecipe } from '../../api/types.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action, loader } from './AdminRecipesPage.data.ts';
import { AdminRecipesPage } from './AdminRecipesPage.tsx';

const mockApi = vi.mocked(adminApi);

const RECIPE: AdminRecipe = {
  id: 'r1',
  title: 'Test Recipe',
  slug: 'test-recipe',
  visibility: 'public',
  author: { username: 'alice' },
  likeCount: 0,
  commentCount: 0,
  createdAt: '2025-01-01T00:00:00Z',
};

/** Builds the paginated envelope `GET /admin/recipes` returns. */
function recipesPage(recipes: AdminRecipe[]): PaginatedResponse<AdminRecipe> {
  return {
    success: true,
    data: recipes,
    meta: {
      requestId: 't',
      pagination: { page: 1, perPage: 50, total: recipes.length, totalPages: 1 },
    },
  };
}

/** Renders `/admin/recipes` through its real loader and action. */
function renderPage(locale: 'en' | 'tr' = 'en') {
  return renderWithAppProviders(
    [
      {
        path: '/admin/recipes',
        loader,
        action,
        Component: AdminRecipesPage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: ['/admin/recipes'], auth: 'admin', locale },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockApi.getRecipes.mockResolvedValue(recipesPage([RECIPE]));
});

describe('AdminRecipesPage', () => {
  it('renders the Turkish heading and the recipes from the loader', async () => {
    renderPage('tr');

    expect(await screen.findByText('Test Recipe')).toBeInTheDocument();
    expect(screen.getByText(t('admin.recipes.management', 'tr'))).toBeInTheDocument();
    expect(mockApi.getRecipes).toHaveBeenCalledWith(
      { perPage: '50' },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('changes visibility through the action', async () => {
    mockApi.setRecipeVisibility.mockResolvedValue({ ...RECIPE, visibility: 'draft' });
    renderPage();
    await screen.findByText('Test Recipe');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'draft' } });

    await waitFor(() =>
      expect(mockApi.setRecipeVisibility).toHaveBeenCalledWith('r1', 'draft', {
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('shows an error toast when the visibility change fails', async () => {
    mockApi.setRecipeVisibility.mockRejectedValue(new Error('down'));
    renderPage();
    await screen.findByText('Test Recipe');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'draft' } });

    expect(await screen.findByText(t('admin.recipes.visibilityError'))).toBeInTheDocument();
  });

  it('deletes after confirming and removes the row on revalidation', async () => {
    mockApi.deleteRecipe.mockResolvedValue({ message: 'ok' });
    renderPage();
    await screen.findByText('Test Recipe');

    mockApi.getRecipes.mockResolvedValue(recipesPage([]));
    fireEvent.click(screen.getByRole('button', { name: t('common.delete') }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t('common.delete') }));

    await waitFor(() => expect(screen.queryByText('Test Recipe')).not.toBeInTheDocument());
    expect(mockApi.deleteRecipe).toHaveBeenCalledWith('r1', { signal: expect.any(AbortSignal) });
  });

  it('shows an error toast and keeps the row when delete fails', async () => {
    mockApi.deleteRecipe.mockRejectedValue(new Error('Network error'));
    renderPage('tr');
    await screen.findByText('Test Recipe');

    fireEvent.click(screen.getByRole('button', { name: t('common.delete', 'tr') }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t('common.delete', 'tr') }));

    expect(await screen.findByText(t('admin.recipes.deleteFailed', 'tr'))).toBeInTheDocument();
    expect(screen.getByText('Test Recipe')).toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('renders the route error state when the loader fails', async () => {
    mockApi.getRecipes.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByText(t('error.route.loadFailed'))).toBeInTheDocument();
  });
});
