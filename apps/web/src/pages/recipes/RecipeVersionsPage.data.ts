import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { ApiError } from '../../api/errors.ts';
import { recipeApi } from '../../api/index.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('RecipeVersionsPage');

/**
 * `/recipes/:slug/versions` loader: the recipe's title, slug and version rows, fetched with
 * `request.signal`. An unknown recipe (API 404) renders the not-found page; any other failure
 * logs `RecipeVersionsPage loadData failed` and renders the route error state with a retry
 * control (never `common.noResults`). Public.
 */
export const loader = ({ params, request }: LoaderFunctionArgs) => {
  const slug = params.slug ?? '';
  return withDataLog(log, 'RecipeVersionsPage loadData', { slug }, async () => {
    try {
      return await recipeApi.versions(slug, { signal: request.signal });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        throw new Response('Not Found', { status: 404 });
      }
      throw err;
    }
  });
};
