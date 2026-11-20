import { useListUrlState } from '../../hooks/useListUrlState.ts';
import { parsePageParam, readPage } from '../../utils/list-params.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The default sort; it is omitted from the URL. */
const RECIPE_LIST_DEFAULTS = { sortBy: 'createdAt' };

/** Parsed `/recipes` (and `/recipes/starred`) filter state. */
export interface RecipeFilterState {
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
}

/**
 * Parses the recipe-list URL into {@link RecipeFilterState}: scalar filters with safe
 * defaults, `page` with the loader's rules (a positive integer, otherwise 1), and
 * `tasteNoteIds` as a comma-separated UUID list (non-UUID entries dropped).
 */
export function parseRecipeFilters(searchParams: URLSearchParams): RecipeFilterState {
  const tasteNoteIdsParam = searchParams.get('tasteNoteIds') ?? '';
  return {
    page: readPage(searchParams),
    brewMethod: searchParams.get('brewMethod') ?? '',
    drinkType: searchParams.get('drinkType') ?? '',
    visibility: searchParams.get('visibility') ?? '',
    sortBy: searchParams.get('sortBy') ?? RECIPE_LIST_DEFAULTS.sortBy,
    search: searchParams.get('search') ?? '',
    equipmentId: searchParams.get('equipmentId') ?? '',
    mainBrewer: searchParams.get('mainBrewer') ?? '',
    tasteNoteIds: tasteNoteIdsParam
      ? tasteNoteIdsParam
          .split(',')
          .map((id) => id.trim())
          .filter((id) => UUID_RE.test(id))
      : [],
    coffeeVarietyId: searchParams.get('coffeeVarietyId') ?? '',
    author: searchParams.get('author') ?? '',
    dateFrom: searchParams.get('dateFrom') ?? '',
    dateTo: searchParams.get('dateTo') ?? '',
    minRating: searchParams.get('minRating') ?? '',
    maxRating: searchParams.get('maxRating') ?? '',
  };
}

/**
 * Parsed URL filter state plus mutation helpers returned by
 * {@link useRecipeFilters}.
 */
export interface UseRecipeFiltersResult extends RecipeFilterState {
  searchParams: URLSearchParams;
  updateFilter: (key: string, value: string | string[]) => void;
  setPage: (page: number) => void;
  clearAllFilters: () => void;
}

/**
 * Reads and writes recipe-list filter state from the URL search params, delegating to the
 * shared {@link useListUrlState} hook with {@link parseRecipeFilters}.
 *
 * - `updateFilter(key, value)` sets the param (joining arrays with `,`) or deletes it when
 *   empty or equal to its default (`sortBy=createdAt`). A filter change (any key other than
 *   `page`) removes `page` so the user lands on page 1; `updateFilter('page', n)` behaves
 *   like `setPage(n)` and keeps every filter.
 * - `setPage(n)` sets only `page`, keeping every filter, and omits it for page 1.
 * - `clearAllFilters()` removes every URL search param.
 *
 * Free-text inputs (`search`, `author`) bind through `useDebouncedUrlText` in the view; the
 * values here are the committed URL values.
 */
export function useRecipeFilters(): UseRecipeFiltersResult {
  const { state, searchParams, setFilter, setPage, clearAll } = useListUrlState(
    parseRecipeFilters,
    { defaults: RECIPE_LIST_DEFAULTS },
  );

  /** Set or delete one URL param; `page` routes to `setPage`, any other key resets the page. */
  function updateFilter(key: string, value: string | string[]): void {
    if (key === 'page') {
      setPage(parsePageParam(Array.isArray(value) ? value[0] : value));
      return;
    }
    setFilter(key, value);
  }

  return {
    ...state,
    searchParams,
    updateFilter,
    setPage,
    clearAllFilters: clearAll,
  };
}
