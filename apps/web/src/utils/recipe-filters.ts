import { parsePageParam } from './list-params.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A calendar day in `YYYY-MM-DD` form, the only value the API accepts for `dateFrom`/`dateTo`. */
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Raw recipe-list filter parameters parsed from the URL query string. */
export interface ListFilterParams {
  page: string;
  perPage: string;
  sortBy: string;
  brewMethod?: string;
  drinkType?: string;
  visibility?: string;
  search?: string;
  equipmentId?: string;
  mainBrewer?: string;
  tasteNoteIds?: string;
  coffeeVarietyId?: string;
  author?: string;
  dateFrom?: string;
  dateTo?: string;
  minRating?: string;
  maxRating?: string;
}

/**
 * Extracts sanitised recipe-list query params from the URL: clamps
 * `page` to a positive integer, defaults `perPage`/`sortBy`, drops
 * empty filters, rejects non-UUID equipment/variety ids, and drops
 * `dateFrom`/`dateTo` values that are not `YYYY-MM-DD` (a hand-edited URL
 * never fails the list loader with a 400).
 */
export function extractListParams(sp: URLSearchParams): Record<string, string> {
  const params: Record<string, string> = {
    page: String(parsePageParam(sp.get('page'))),
    perPage: '12',
    sortBy: sp.get('sortBy') ?? 'createdAt',
  };
  const map: Record<string, string | undefined> = {
    brewMethod: sp.get('brewMethod') ?? undefined,
    drinkType: sp.get('drinkType') ?? undefined,
    visibility: sp.get('visibility') ?? undefined,
    search: sp.get('search') ?? undefined,
    equipmentId: sp.get('equipmentId') ?? undefined,
    mainBrewer: sp.get('mainBrewer') ?? undefined,
    tasteNoteIds: sp.get('tasteNoteIds') ?? undefined,
    coffeeVarietyId: sp.get('coffeeVarietyId') ?? undefined,
    author: sp.get('author') ?? undefined,
    dateFrom: sp.get('dateFrom') ?? undefined,
    dateTo: sp.get('dateTo') ?? undefined,
    minRating: sp.get('minRating') ?? undefined,
    maxRating: sp.get('maxRating') ?? undefined,
  };
  for (const [k, v] of Object.entries(map)) {
    if (v && v.length > 0) {
      if ((k === 'equipmentId' || k === 'coffeeVarietyId') && !UUID_RE.test(v)) continue;
      if ((k === 'dateFrom' || k === 'dateTo') && !ISO_DAY_RE.test(v)) continue;
      params[k] = v;
    }
  }
  return params;
}
