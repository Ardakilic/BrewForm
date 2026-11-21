import { useEffect } from 'react';
import { useLoaderData } from 'react-router';
import { RecipeListView } from '../../components/recipe-list/index.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import type { loader } from './RecipeListPage.data.ts';
import { useCoffeeVarietyFilter } from './useCoffeeVarietyFilter.tsx';

const log = createLogger('RecipeListPage');

/**
 * Thin page wrapper for `/recipes`. Reads the list, lookups and the selected coffee-variety
 * name from the route loader (`RecipeListPage.data.ts`), delegates the filter UI, badge row,
 * recipe grid and pagination to {@link RecipeListView}, and hosts the page-specific
 * coffee-variety typeahead via {@link useCoffeeVarietyFilter}.
 */
export function RecipeListPage() {
  const { recipesResponse, equipment, tasteNotes, coffeeVarietyName } =
    useLoaderData<typeof loader>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const coffeeVariety = useCoffeeVarietyFilter(coffeeVarietyName);

  useEffect(() => {
    log.debug({}, 'RecipeListPage mounted');
    return () => {
      log.debug({}, 'RecipeListPage unmounted');
    };
  }, []);

  return (
    <RecipeListView
      source="all"
      recipesResponse={recipesResponse}
      equipment={equipment}
      tasteNotes={tasteNotes}
      showAdminVisibilityFilter={user?.isAdmin === true}
      coffeeVarietyFilterSlot={coffeeVariety.slot}
      selectedCoffeeVarietyName={coffeeVariety.selectedName}
      onClearCoffeeVariety={coffeeVariety.clear}
      pageTitle={t('recipe.list.title')}
      seoDescription="Browse and discover coffee brewing recipes on BrewForm."
    />
  );
}
