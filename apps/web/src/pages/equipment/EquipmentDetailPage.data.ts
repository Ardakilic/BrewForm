import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { ApiError } from '../../api/errors.ts';
import { equipmentApi } from '../../api/index.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('EquipmentDetailPage');

/** Recipes shown under "Recipes using this equipment". */
export const EQUIPMENT_RECIPES_PER_PAGE = 6;

/**
 * `/equipment/:id` loader: the equipment item and the first recipes that use it, fetched in
 * parallel with `request.signal`. A missing item (API 404) throws a 404 `Response`, so the
 * route renders the not-found page (no error log); any other failure is logged and renders
 * the route error state.
 */
export function loader({ params, request }: LoaderFunctionArgs) {
  const id = params.id ?? '';
  return withDataLog(log, 'EquipmentDetailPage loadData', { equipmentId: id }, async () => {
    const opts = { signal: request.signal };
    try {
      const [equipment, recipes] = await Promise.all([
        equipmentApi.get(id, opts),
        equipmentApi.recipes(id, { perPage: String(EQUIPMENT_RECIPES_PER_PAGE) }, opts),
      ]);
      return { equipment, recipes };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        throw new Response('Not Found', { status: 404 });
      }
      throw err;
    }
  });
}
