import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { coffeeVarietyApi } from '../../api/index.ts';
import type { CoffeeVarietySearchResult } from '../../api/types.ts';
import { type ActionFailure, toActionFailure } from '../action-result.ts';
import { withDataLog } from '../data-logging.ts';

const log = createLogger('resources/coffee-varieties');

/** The resource-route path of {@link coffeeVarietySearchLoader} (append `?q=<text>`). */
export const COFFEE_VARIETY_SEARCH_PATH = '/resources/coffee-varieties/search';

/** Shortest query the typeahead searches for; shorter queries return no results. */
export const MIN_COFFEE_VARIETY_QUERY_LENGTH = 2;

/** Result of {@link coffeeVarietySearchLoader}: the matches for `query`, or the failure. */
export type CoffeeVarietySearchResultData =
  | { ok: true; query: string; results: CoffeeVarietySearchResult[] }
  | (ActionFailure & { query: string });

/** Builds the fetcher URL that searches coffee varieties for `query`. */
export function coffeeVarietySearchHref(query: string): string {
  return `${COFFEE_VARIETY_SEARCH_PATH}?${new URLSearchParams({ q: query })}`;
}

/**
 * `resources/coffee-varieties/search` loader for the `/recipes` coffee-variety typeahead
 * (`useCoffeeVarietyFilter`, loaded with `useFetcher().load()`, so a newer query cancels the
 * previous request). Reads `?q=`, trims it, and returns `{ ok: true, query, results }`; a query
 * shorter than {@link MIN_COFFEE_VARIETY_QUERY_LENGTH} returns no results without a request. A
 * failed search returns `{ ok: false, query, error }` (logged) instead of throwing, so the
 * typeahead closes its dropdown rather than replacing the page; an aborted request rethrows.
 */
export async function coffeeVarietySearchLoader({
  request,
}: Pick<LoaderFunctionArgs, 'request'>): Promise<CoffeeVarietySearchResultData> {
  const query = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (query.length < MIN_COFFEE_VARIETY_QUERY_LENGTH) return { ok: true, query, results: [] };
  try {
    const results = await withDataLog(
      log,
      'coffeeVarietySearch',
      { queryLength: query.length },
      () => coffeeVarietyApi.search(query, { signal: request.signal }),
    );
    return { ok: true, query, results };
  } catch (err) {
    return { ...toActionFailure(err, []), query };
  }
}

/**
 * `shouldRevalidate` for the search resource route: a typeahead result never depends on a
 * mutation, so actions elsewhere in the app must not re-run the last search.
 */
export function shouldRevalidateCoffeeVarietySearch(): boolean {
  return false;
}
