import type {
  EquipmentOutput,
  PaginatedResponse,
  RecipeListItemOutput,
  TasteNoteOutput,
} from '@brewform/shared/schemas';
import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { recipeApi } from '../../api/index.ts';
import { getEquipmentCached, getTasteNotesCached } from '../../api/static-cache.ts';
import { requireAuth } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';
import { extractListParams } from '../../utils/recipe-filters.ts';

const log = createLogger('StarredRecipesPage');

/** Loader payload for `StarredRecipesPage`. */
export interface StarredRecipesLoaderData {
  recipesResponse: PaginatedResponse<RecipeListItemOutput>;
  equipment: EquipmentOutput[];
  tasteNotes: TasteNoteOutput[];
}

/**
 * `/recipes/starred` loader: the signed-in user's starred recipes for the URL's filters plus
 * the cached equipment and taste-note lookups, in parallel, every request carrying
 * `request.signal`. Wrapped in `requireAuth`, so a final 401 redirects to `/login?next=…`.
 */
export const loader = requireAuth(
  ({ request }: Pick<LoaderFunctionArgs, 'request'>): Promise<StarredRecipesLoaderData> =>
    withDataLog(log, 'StarredRecipesPage loadRecipes', {}, async () => {
      const params = extractListParams(new URL(request.url).searchParams);
      const opts = { signal: request.signal };
      const [recipesResponse, equipment, tasteNotes] = await Promise.all([
        recipeApi.starred(params, opts),
        getEquipmentCached(opts),
        getTasteNotesCached(opts),
      ]);
      return { recipesResponse, equipment, tasteNotes };
    }),
);
