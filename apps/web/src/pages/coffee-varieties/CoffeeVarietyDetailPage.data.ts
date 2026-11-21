import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { ApiError } from '../../api/errors.ts';
import { coffeeVarietyApi } from '../../api/index.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('CoffeeVarietyDetailPage');

/** Recipes shown under "Recipes using <variety>". */
export const VARIETY_RECIPES_PER_PAGE = 6;

/**
 * `/coffee-varieties/:id` loader: the variety and the first recipes that use it, fetched in
 * parallel with `request.signal`. A missing variety (API 404) throws a 404 `Response`, so the
 * route renders the not-found page (no error log); any other failure is logged and renders
 * the route error state.
 */
export function loader({ params, request }: LoaderFunctionArgs) {
  const id = params.id ?? '';
  return withDataLog(log, 'CoffeeVarietyDetailPage loadData', { varietyId: id }, async () => {
    const opts = { signal: request.signal };
    try {
      const [variety, recipes] = await Promise.all([
        coffeeVarietyApi.get(id, opts),
        coffeeVarietyApi.recipes(id, { perPage: String(VARIETY_RECIPES_PER_PAGE) }, opts),
      ]);
      return { variety, recipes };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        throw new Response('Not Found', { status: 404 });
      }
      throw err;
    }
  });
}
