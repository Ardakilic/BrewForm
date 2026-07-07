import { useEffect } from 'react';
import { redirect, useLoaderData } from 'react-router';
import { ApiError, recipeApi } from '../../api/index.ts';
import { getEquipmentCached, getTasteNotesCached } from '../../api/static-cache.ts';
import type {
  EquipmentOutput,
  PaginatedResponse,
  RecipeListItemOutput,
  TasteNoteOutput,
} from '@brewform/shared/schemas';
import { extractListParams } from '../../utils/recipe-filters.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import { RecipeListView } from '../../components/recipe-list/index.ts';

const log = createLogger('StarredRecipesPage');

/** Loader payload for {@link StarredRecipesPage}. */
export interface StarredRecipesLoaderData {
  recipesResponse: PaginatedResponse<RecipeListItemOutput>;
  equipment: EquipmentOutput[];
  tasteNotes: TasteNoteOutput[];
}

/** React Router data loader for `/recipes/starred` — fetches the
 *  authenticated user's starred recipes plus cached lookups. Redirects
 *  to `/login` on a 401. */
export const loader = async (
  { request }: { request: Request },
): Promise<StarredRecipesLoaderData> => {
  const url = new URL(request.url);
  const params = extractListParams(url.searchParams);
  try {
    const [recipesResponse, equipment, tasteNotes] = await Promise.all([
      recipeApi.starred(params),
      getEquipmentCached(),
      getTasteNotesCached(),
    ]);
    return { recipesResponse, equipment, tasteNotes };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) throw redirect('/login');
    throw err;
  }
};

/**
 * Thin page wrapper for `/recipes/starred`. Bypasses the view with a
 * login-required message when unauthenticated, otherwise delegates to
 * {@link RecipeListView}. 401 redirects live in the loader.
 */
export function StarredRecipesPage() {
  const { recipesResponse, equipment, tasteNotes } = useLoaderData() as StarredRecipesLoaderData;
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    log.debug({}, 'StarredRecipesPage mounted');
    return () => {
      log.debug({}, 'StarredRecipesPage unmounted');
    };
  }, []);

  if (!isAuthenticated) {
    return (
      <div className='mx-auto max-w-6xl px-6 py-8'>
        <div className='text-center py-12' style={{ color: 'var(--text-tertiary)' }}>
          {t('recipe.starred.loginRequired')}
        </div>
      </div>
    );
  }

  return (
    <RecipeListView
      source='starred'
      recipesResponse={recipesResponse}
      equipment={equipment}
      tasteNotes={tasteNotes}
      emptyMessageKey='recipe.starred.noResults'
      pageTitle={t('recipe.starred.title')}
      seoDescription='Your starred coffee brewing recipes on BrewForm.'
    />
  );
}
