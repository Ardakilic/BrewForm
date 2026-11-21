import type { RecipeListItemOutput } from '@brewform/shared/schemas';
import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { recipeApi } from '../api/index.ts';
import { withDataLog } from '../routes/data-logging.ts';

const log = createLogger('HomePage');

/** Number of recipes shown in each home-page grid. */
export const HOME_GRID_SIZE = '6';

/** Loader data for the home page — latest and most-liked public recipes. */
export interface HomeLoaderData {
  latestRecipes: RecipeListItemOutput[];
  popularRecipes: RecipeListItemOutput[];
}

/**
 * `/` loader: fetches the six latest and six most-liked public recipes in parallel and returns
 * them as {@link HomeLoaderData}. Both requests carry `request.signal`, so leaving the page
 * before they resolve aborts them.
 */
export function loader({ request }: LoaderFunctionArgs): Promise<HomeLoaderData> {
  const opts = { signal: request.signal };
  return withDataLog(log, 'HomePage loadRecipes', {}, async () => {
    const [latestRes, popularRes] = await Promise.all([
      recipeApi.list({ perPage: HOME_GRID_SIZE, sortBy: 'createdAt' }, opts),
      recipeApi.list({ perPage: HOME_GRID_SIZE, sortBy: 'likeCount' }, opts),
    ]);
    return {
      latestRecipes: latestRes.data ?? [],
      popularRecipes: popularRes.data ?? [],
    };
  });
}
