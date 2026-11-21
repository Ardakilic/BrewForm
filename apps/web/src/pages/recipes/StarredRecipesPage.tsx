import { useEffect } from 'react';
import { useLoaderData } from 'react-router';
import { RecipeListView } from '../../components/recipe-list/index.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import type { loader } from './StarredRecipesPage.data.ts';

const log = createLogger('StarredRecipesPage');

/**
 * Thin page wrapper for `/recipes/starred`. Bypasses the view with a
 * login-required message when unauthenticated, otherwise delegates to
 * {@link RecipeListView} with the data from the route loader
 * (`StarredRecipesPage.data.ts`). 401 redirects live in the loader (`requireAuth`).
 */
export function StarredRecipesPage() {
  const { recipesResponse, equipment, tasteNotes } = useLoaderData<typeof loader>();
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
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
          {t('recipe.starred.loginRequired')}
        </div>
      </div>
    );
  }

  return (
    <RecipeListView
      source="starred"
      recipesResponse={recipesResponse}
      equipment={equipment}
      tasteNotes={tasteNotes}
      emptyMessageKey="recipe.starred.noResults"
      pageTitle={t('recipe.starred.title')}
      seoDescription="Your starred coffee brewing recipes on BrewForm."
    />
  );
}
