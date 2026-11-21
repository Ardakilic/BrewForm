import type { EquipmentCreate } from '@brewform/shared/schemas';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { adminApi } from '../../api/index.ts';
import { invalidateStaticCache } from '../../api/static-cache.ts';
import { formString, toActionFailure } from '../../routes/action-result.ts';
import { requireAdmin } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('AdminEquipmentPage');

/** Equipment items loaded on the admin page (the API's per-page maximum). */
export const ADMIN_EQUIPMENT_PER_PAGE = 100;

/** `/admin/equipment` loader: the shared equipment catalogue (admin only). */
export const loader = requireAdmin(({ request }: LoaderFunctionArgs) =>
  withDataLog(log, 'AdminEquipmentPage loadData', {}, async () => {
    const res = await adminApi.getEquipment(
      { perPage: String(ADMIN_EQUIPMENT_PER_PAGE) },
      { signal: request.signal },
    );
    return { equipment: res.data };
  }),
);

/** Result of the `/admin/equipment` action. */
export type AdminEquipmentActionResult =
  | { ok: true; intent: 'create' | 'update' | 'delete' }
  | { ok: false; intent: string; error: string; code?: string };

/** Reads the equipment fields from the submitted form (empty brand/model are omitted). */
function equipmentInput(form: FormData): EquipmentCreate {
  // The type is free text in the admin form and validated server-side.
  return {
    name: formString(form, 'name').trim(),
    type: formString(form, 'type').trim(),
    brand: formString(form, 'brand') || undefined,
    model: formString(form, 'model') || undefined,
  } as EquipmentCreate;
}

/**
 * `/admin/equipment` action, keyed by `intent`: `create` (`name`, `type`, `brand`, `model`),
 * `update` (same plus `id`) and `delete` (`id`). Every success calls
 * `invalidateStaticCache()` so the equipment lookups (this tab and others) re-fetch. Returns
 * `{ ok: true, intent }` or `{ ok: false, intent, error }`; 401/403 still redirect.
 */
export const action = requireAdmin(
  async ({ request }: ActionFunctionArgs): Promise<AdminEquipmentActionResult> => {
    const form = await request.formData();
    const intent = formString(form, 'intent');
    const id = formString(form, 'id');
    const opts = { signal: request.signal };
    try {
      if (intent === 'create') {
        await withDataLog(log, 'AdminEquipmentPage createEquipment', {}, () =>
          adminApi.createEquipment(equipmentInput(form), opts),
        );
      } else if (intent === 'update') {
        await withDataLog(log, 'AdminEquipmentPage updateEquipment', { equipmentId: id }, () =>
          adminApi.updateEquipment(id, equipmentInput(form), opts),
        );
      } else if (intent === 'delete') {
        await withDataLog(log, 'AdminEquipmentPage deleteEquipment', { equipmentId: id }, () =>
          adminApi.deleteEquipment(id, opts),
        );
      } else {
        return { ok: false, intent, error: 'Unknown intent' };
      }
      invalidateStaticCache();
      return { ok: true, intent };
    } catch (err) {
      return { ...toActionFailure(err, [401, 403]), intent };
    }
  },
);
