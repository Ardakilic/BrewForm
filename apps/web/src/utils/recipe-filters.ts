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
}

/**
 * Extracts sanitised recipe-list query params from the URL: clamps
 * `page` to a positive integer, defaults `perPage`/`sortBy`, drops
 * empty filters, and rejects non-UUID equipment/variety ids.
 */
export function extractListParams(sp: URLSearchParams): Record<string, string> {
  const rawPage = sp.get('page');
  let page = '1';
  if (rawPage !== null) {
    const parsed = Number.parseInt(rawPage, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      page = String(parsed);
    }
  }
  const params: Record<string, string> = {
    page,
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
  };
  for (const [k, v] of Object.entries(map)) {
    if (v && v.length > 0) {
      if ((k === 'equipmentId' || k === 'coffeeVarietyId') && !UUID_RE.test(v)) continue;
      params[k] = v;
    }
  }
  return params;
}
