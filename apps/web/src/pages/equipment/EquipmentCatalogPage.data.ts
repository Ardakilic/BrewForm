import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { equipmentApi } from '../../api/index.ts';
import { withDataLog } from '../../routes/data-logging.ts';
import { parseEquipmentCatalogParams } from '../../utils/list-parsers.ts';

const log = createLogger('EquipmentCatalogPage');

/** Equipment cards per catalogue page. */
export const EQUIPMENT_CATALOG_PER_PAGE = 12;

/**
 * `/equipments` loader: one page of the public equipment catalogue for the URL state
 * (`page`, `type`, `q`; a legacy `search` link is still read), parsed with the same
 * `parseEquipmentCatalogParams` the page's controls use. Passes `request.signal`, so a
 * superseded navigation aborts the request; a failure renders the route error state.
 */
export function loader({ request }: LoaderFunctionArgs) {
  const { page, type, q } = parseEquipmentCatalogParams(new URL(request.url).searchParams);
  return withDataLog(log, 'EquipmentCatalogPage loadData', { page, type }, async () => {
    const params: Record<string, string> = {
      page: String(page),
      perPage: String(EQUIPMENT_CATALOG_PER_PAGE),
    };
    if (type) params.type = type;
    if (q) params.search = q;
    const res = await equipmentApi.catalog(params, { signal: request.signal });
    return { equipment: res.data, totalPages: Math.max(1, res.meta.pagination.totalPages) };
  });
}
