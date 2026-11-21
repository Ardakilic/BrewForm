import type {
  EquipmentOutput,
  PaginatedResponse,
  RecipeListItemOutput,
  TasteNoteOutput,
} from '@brewform/shared/schemas';
import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { isAbortError } from '../../api/errors.ts';
import { coffeeVarietyApi, type RequestOptions, recipeApi } from '../../api/index.ts';
import { getEquipmentCached, getTasteNotesCached } from '../../api/static-cache.ts';
import { withDataLog } from '../../routes/data-logging.ts';
import { extractListParams } from '../../utils/recipe-filters.ts';

const log = createLogger('RecipeListPage');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Loader payload for `RecipeListPage`. */
export interface RecipeListLoaderData {
  recipesResponse: PaginatedResponse<RecipeListItemOutput>;
  equipment: EquipmentOutput[];
  tasteNotes: TasteNoteOutput[];
  /** Name of the `?coffeeVarietyId` filter's variety, or `null` when unset or unresolved. */
  coffeeVarietyName: string | null;
}

/**
 * Resolves the display name of the `?coffeeVarietyId` filter for the active-filter badge.
 * Returns `null` without a request when the id is missing or not a UUID, and `null` (logged)
 * when the lookup fails: a missing name must not fail the recipe list. An aborted request
 * rethrows.
 */
async function resolveCoffeeVarietyName(
  coffeeVarietyId: string | null,
  opts: RequestOptions,
): Promise<string | null> {
  if (!coffeeVarietyId || !UUID_RE.test(coffeeVarietyId)) return null;
  try {
    const variety = await coffeeVarietyApi.get(coffeeVarietyId, opts);
    return variety.name;
  } catch (err) {
    if (isAbortError(err)) throw err;
    log.error({ err, coffeeVarietyId }, 'RecipeListPage resolveCoffeeVariety failed');
    return null;
  }
}

/**
 * `/recipes` loader: the paginated recipe list for the URL's filters, the cached equipment and
 * taste-note lookups, and (when `?coffeeVarietyId` is set) the selected variety's name, in
 * parallel. Every request carries `request.signal`, so a superseded navigation aborts it.
 */
export function loader({
  request,
}: Pick<LoaderFunctionArgs, 'request'>): Promise<RecipeListLoaderData> {
  return withDataLog(log, 'RecipeListPage loadRecipes', {}, async () => {
    const url = new URL(request.url);
    const params = extractListParams(url.searchParams);
    const opts = { signal: request.signal };
    const [recipesResponse, equipment, tasteNotes, coffeeVarietyName] = await Promise.all([
      recipeApi.list(params, opts),
      getEquipmentCached(opts),
      getTasteNotesCached(opts),
      resolveCoffeeVarietyName(url.searchParams.get('coffeeVarietyId'), opts),
    ]);
    return { recipesResponse, equipment, tasteNotes, coffeeVarietyName };
  });
}
