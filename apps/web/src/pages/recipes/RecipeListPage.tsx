import { useEffect } from 'react';
import { useLoaderData } from 'react-router';
import { recipeApi } from '../../api/index.ts';
import { getEquipmentCached, getTasteNotesCached } from '../../api/static-cache.ts';
import type { EquipmentListItem, RecipeListItem, TasteNoteFlatItem } from '../../api/types.ts';
import { extractListParams } from '../../utils/recipe-filters.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import { RecipeListView } from '../../components/recipe-list/index.ts';
import { useCoffeeVarietyFilter } from './useCoffeeVarietyFilter.tsx';

const log = createLogger('RecipeListPage');

/** Loader payload for {@link RecipeListPage}. */
export interface RecipeListLoaderData {
  recipesResponse: { data: RecipeListItem[]; meta: { pagination?: { total?: number } } };
  equipment: EquipmentListItem[];
  tasteNotes: TasteNoteFlatItem[];
}

/**
 * React Router data loader for `/recipes` — fetches the paginated recipe
 * list plus cached equipment and taste-note lookups in parallel.
 */
export const loader = async ({ request }: { request: Request }): Promise<RecipeListLoaderData> => {
  const url = new URL(request.url);
  const params = extractListParams(url.searchParams);
  const [recipesResponse, equipment, tasteNotes] = await Promise.all([
    recipeApi.list(params),
    getEquipmentCached(),
    getTasteNotesCached(),
  ]);
  return { recipesResponse, equipment, tasteNotes };
};

/**
 * Thin page wrapper for `/recipes`. Delegates the filter UI, badge
 * row, recipe grid, and pagination to {@link RecipeListView}, and
 * hosts the page-specific coffee-variety search via
 * {@link useCoffeeVarietyFilter}.
 */
export function RecipeListPage() {
  const { recipesResponse, equipment, tasteNotes } = useLoaderData() as RecipeListLoaderData;
  const { user } = useAuth();
  const { t } = useTranslation();
  const coffeeVariety = useCoffeeVarietyFilter();

  useEffect(() => {
    log.debug({}, 'RecipeListPage mounted');
    return () => {
      log.debug({}, 'RecipeListPage unmounted');
    };
  }, []);

  return (
    <RecipeListView
      source='all'
      recipesResponse={recipesResponse}
      equipment={equipment}
      tasteNotes={tasteNotes}
      showAdminVisibilityFilter={user?.isAdmin === true}
      coffeeVarietyFilterSlot={coffeeVariety.slot}
      selectedCoffeeVarietyName={coffeeVariety.selectedName}
      onClearCoffeeVariety={coffeeVariety.clear}
      pageTitle={t('recipe.list.title')}
      seoDescription='Browse and discover coffee brewing recipes on BrewForm.'
    />
  );
}
