const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export function extractListParams(sp: URLSearchParams): Record<string, string> {
  const params: Record<string, string> = {
    page: sp.get('page') ?? '1',
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
