import type { EquipmentCreate } from '@brewform/shared/schemas';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { equipmentApi } from '../../api/index.ts';
import { getEquipmentCached, invalidateStaticCache } from '../../api/static-cache.ts';
import { type ActionFailure, formString, toActionFailure } from '../../routes/action-result.ts';
import { requireAuth } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('EquipmentListPage');

/**
 * `/equipment` loader: the equipment lookup list, read through the single-flight static cache
 * (`getEquipmentCached`) with `request.signal`. Wrapped in `requireAuth` (a final 401
 * redirects to `/login?next=%2Fequipment`); any other failure renders the route error state.
 */
export const loader = requireAuth(({ request }: LoaderFunctionArgs) =>
  withDataLog(log, 'EquipmentListPage loadEquipment', {}, async () => ({
    equipment: await getEquipmentCached({ signal: request.signal }),
  })),
);

/** The intents the `/equipment` action accepts. */
export type EquipmentListIntent = 'create' | 'delete';

/** Result of the `/equipment` action. */
export type EquipmentListActionResult =
  | { ok: true; intent: EquipmentListIntent }
  | (ActionFailure & { intent: string });

/** Reads the equipment fields from the submitted form (empty brand/model are omitted). */
function equipmentInput(form: FormData): EquipmentCreate {
  // The type is free text in this form and validated server-side.
  return {
    name: formString(form, 'name').trim(),
    type: formString(form, 'type').trim(),
    brand: formString(form, 'brand') || undefined,
    model: formString(form, 'model') || undefined,
  } as EquipmentCreate;
}

/**
 * `/equipment` action, keyed by `intent`: `create` (`name`, `type`, `brand`, `model`) and
 * `delete` (`id`). Every success calls `invalidateStaticCache()` so the equipment lookups (this
 * tab, through the post-action revalidation, and other tabs) re-fetch; a failure leaves the
 * cache alone. Returns `{ ok: true, intent }` or `{ ok: false, intent, error }`; a final 401
 * redirects through `requireAuth`.
 */
export const action = requireAuth(
  async ({ request }: ActionFunctionArgs): Promise<EquipmentListActionResult> => {
    const form = await request.formData();
    const intent = formString(form, 'intent');
    const opts = { signal: request.signal };
    try {
      if (intent === 'create') {
        await withDataLog(log, 'EquipmentListPage createEquipment', {}, () =>
          equipmentApi.create(equipmentInput(form), opts),
        );
        invalidateStaticCache();
        return { ok: true, intent };
      }
      if (intent === 'delete') {
        const id = formString(form, 'id');
        await withDataLog(log, 'EquipmentListPage deleteEquipment', { equipmentId: id }, () =>
          equipmentApi.delete(id, opts),
        );
        invalidateStaticCache();
        return { ok: true, intent };
      }
      return { ok: false, intent, error: 'Unknown intent' };
    } catch (err) {
      return { ...toActionFailure(err), intent };
    }
  },
);
