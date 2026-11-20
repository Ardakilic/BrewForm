import { useSearchParams } from 'react-router';
import { parsePageParam } from '../../utils/recipe-filters.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parsed URL filter state plus mutation helpers returned by
 * {@link useRecipeFilters}.
 */
export interface UseRecipeFiltersResult {
  searchParams: URLSearchParams;
  setSearchParams: (next: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams)) => void;
  page: number;
  brewMethod: string;
  drinkType: string;
  visibility: string;
  sortBy: string;
  search: string;
  equipmentId: string;
  mainBrewer: string;
  tasteNoteIds: string[];
  coffeeVarietyId: string;
  author: string;
  dateFrom: string;
  dateTo: string;
  minRating: string;
  maxRating: string;
  updateFilter: (key: string, value: string | string[]) => void;
  setPage: (page: number) => void;
  clearAllFilters: () => void;
}

/**
 * Reads and writes recipe-list filter state from the URL search params.
 *
 * - Parses scalar filters (brewMethod, drinkType, etc.) with safe defaults,
 *   and `page` with the loader's rules (`parsePageParam`: a positive integer,
 *   otherwise 1).
 * - Parses `tasteNoteIds` as a comma-separated UUID list, dropping any
 *   non-UUID entry.
 * - Exposes `updateFilter(key, value)` which sets the param (joining
 *   arrays with `,`) or deletes it when empty. A filter change (any key
 *   other than `page`) removes `page` so the user lands on page 1;
 *   `updateFilter('page', n)` keeps every filter.
 * - Exposes `setPage(n)` which sets only `page`, keeping every filter, and
 *   omits it for page 1 (the default is never written to the URL).
 * - Exposes `clearAllFilters()` which removes every URL search param.
 *
 * The hook keeps a self-contained UUID regex for `tasteNoteIds`, and shares
 * only the `page` parser with the loader's parameter-extraction layer
 * (`apps/web/src/utils/recipe-filters.ts`), so both read the same page.
 */
export function useRecipeFilters(): UseRecipeFiltersResult {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = parsePageParam(searchParams.get('page'));
  const brewMethod = searchParams.get('brewMethod') ?? '';
  const drinkType = searchParams.get('drinkType') ?? '';
  const visibility = searchParams.get('visibility') ?? '';
  const sortBy = searchParams.get('sortBy') ?? 'createdAt';
  const search = searchParams.get('search') ?? '';
  const equipmentId = searchParams.get('equipmentId') ?? '';
  const mainBrewer = searchParams.get('mainBrewer') ?? '';
  const coffeeVarietyId = searchParams.get('coffeeVarietyId') ?? '';
  const author = searchParams.get('author') ?? '';
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo = searchParams.get('dateTo') ?? '';
  const minRating = searchParams.get('minRating') ?? '';
  const maxRating = searchParams.get('maxRating') ?? '';

  const tasteNoteIdsParam = searchParams.get('tasteNoteIds') ?? '';
  const tasteNoteIds = tasteNoteIdsParam
    ? tasteNoteIdsParam
        .split(',')
        .map((id) => id.trim())
        .filter((id) => UUID_RE.test(id))
    : [];

  /**
   * Set or delete a URL search-param. Arrays are joined with `,`;
   * empty values delete the key. Changing any key other than `page`
   * clears `page` so the user is returned to page 1.
   */
  function updateFilter(key: string, value: string | string[]): void {
    const params = new URLSearchParams(searchParams);
    if (Array.isArray(value)) {
      if (value.length > 0) {
        params.set(key, value.join(','));
      } else {
        params.delete(key);
      }
    } else if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    if (key !== 'page') params.delete('page');
    setSearchParams(params);
  }

  /** Go to page `n`, keeping every filter; page 1 removes the `page` param. */
  function setPage(n: number): void {
    const params = new URLSearchParams(searchParams);
    if (n > 1) {
      params.set('page', String(n));
    } else {
      params.delete('page');
    }
    setSearchParams(params);
  }

  /** Replace all URL search params with an empty set. */
  function clearAllFilters(): void {
    setSearchParams({});
  }

  return {
    searchParams,
    setSearchParams,
    page,
    brewMethod,
    drinkType,
    visibility,
    sortBy,
    search,
    equipmentId,
    mainBrewer,
    tasteNoteIds,
    coffeeVarietyId,
    author,
    dateFrom,
    dateTo,
    minRating,
    maxRating,
    updateFilter,
    setPage,
    clearAllFilters,
  };
}
