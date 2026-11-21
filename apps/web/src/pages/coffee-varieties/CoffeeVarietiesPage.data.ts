import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { coffeeVarietyApi } from '../../api/index.ts';
import { withDataLog } from '../../routes/data-logging.ts';
import { parseCoffeeVarietyCatalogParams } from '../../utils/list-parsers.ts';

const log = createLogger('CoffeeVarietiesPage');

/** Variety cards per catalogue page. */
export const COFFEE_VARIETY_CATALOG_PER_PAGE = 12;

/**
 * `/coffee-varieties` loader: one page of the public coffee-variety catalogue for the URL
 * state (`page`, `category`, `q`; a legacy `search` link is still read), parsed with the same
 * `parseCoffeeVarietyCatalogParams` the page's controls use. Passes `request.signal`, so a
 * superseded navigation aborts the request; a failure renders the route error state.
 */
export function loader({ request }: LoaderFunctionArgs) {
  const { page, category, q } = parseCoffeeVarietyCatalogParams(new URL(request.url).searchParams);
  return withDataLog(log, 'CoffeeVarietiesPage loadData', { page, category }, async () => {
    const params: Record<string, string> = {
      page: String(page),
      perPage: String(COFFEE_VARIETY_CATALOG_PER_PAGE),
    };
    if (category) params.category = category;
    if (q) params.search = q;
    const res = await coffeeVarietyApi.list(params, { signal: request.signal });
    return { varieties: res.data, totalPages: Math.max(1, res.meta.pagination.totalPages) };
  });
}
