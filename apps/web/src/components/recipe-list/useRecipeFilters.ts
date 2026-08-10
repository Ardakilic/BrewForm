import { useSearchParams } from 'react-router';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parsed URL filter state plus mutation helpers returned by
 * {@link useRecipeFilters}.
 */
export interface UseRecipeFiltersResult {
  searchParams: URLSearchParams;
  setSearchParams: (
    next: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams),
  ) => void;
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
  clearAllFilters: () => void;
}

/**
 * Reads and writes recipe-list filter state from the URL search params.
 *
 * - Parses scalar filters (page, brewMethod, drinkType, etc.) with safe
 *   defaults.
 * - Parses `tasteNoteIds` as a comma-separated UUID list, dropping any
 *   non-UUID entry.
 * - Exposes `updateFilter(key, value)` which sets the param (joining
 *   arrays with `,`) or deletes it when empty, and always resets the
 *   `page` param so the user lands on page 1 after any filter change.
 * - Exposes `clearAllFilters()` which removes every URL search param.
 *
 * The hook keeps a self-contained UUID regex (not re-imported from
 * `apps/web/src/utils/recipe-filters.ts`) so it stays independent of
 * the loader's parameter-extraction layer.
 */
export function useRecipeFilters(): UseRecipeFiltersResult {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page')) || 1;
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
   * empty values delete the key. The `page` param is always cleared
   * so the user is returned to page 1 on any filter change.
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
    params.delete('page');
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
    clearAllFilters,
  };
}
