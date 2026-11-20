const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 * Parses a raw `page` search-param value: a positive integer is kept (`parseInt` rules, so
 * `"2abc"` is 2), anything else (missing, non-numeric, zero, negative) is page 1.
 */
export function parsePageParam(raw: string | null): number {
  if (raw === null) return 1;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Extracts sanitised recipe-list query params from the URL: clamps
 * `page` to a positive integer, defaults `perPage`/`sortBy`, drops
 * empty filters, and rejects non-UUID equipment/variety ids.
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
      params[k] = v;
    }
  }
  return params;
}
