import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { adminApi } from '../../api/index.ts';
import type { AdminVendorInput } from '../../api/types.ts';
import { formString, toActionFailure } from '../../routes/action-result.ts';
import { requireAdmin } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('AdminVendorsPage');

/** Vendors loaded on the admin page (the API's per-page maximum). */
export const ADMIN_VENDORS_PER_PAGE = 100;

/** `/admin/vendors` loader: the vendor list (admin only). */
export const loader = requireAdmin(({ request }: LoaderFunctionArgs) =>
  withDataLog(log, 'AdminVendorsPage loadData', {}, async () => {
    const res = await adminApi.getVendors(
      { perPage: String(ADMIN_VENDORS_PER_PAGE) },
      { signal: request.signal },
    );
    return { vendors: res.data };
  }),
);

/** Result of the `/admin/vendors` action. */
export type AdminVendorsActionResult =
  | { ok: true; intent: 'create' | 'update' | 'delete' }
  | { ok: false; intent: string; error: string; code?: string };

/** Reads the vendor fields from the submitted form (empty optional fields are omitted). */
function vendorInput(form: FormData): AdminVendorInput {
  return {
    name: formString(form, 'name').trim(),
    website: formString(form, 'website') || undefined,
    description: formString(form, 'description') || undefined,
  };
}

/**
 * `/admin/vendors` action, keyed by `intent`: `create` (`name`, `website`, `description`),
 * `update` (same plus `id`) and `delete` (`id`). Returns `{ ok: true, intent }` or
 * `{ ok: false, intent, error }`; 401/403 still redirect through `requireAdmin`.
 */
export const action = requireAdmin(
  async ({ request }: ActionFunctionArgs): Promise<AdminVendorsActionResult> => {
    const form = await request.formData();
    const intent = formString(form, 'intent');
    const id = formString(form, 'id');
    const opts = { signal: request.signal };
    try {
      if (intent === 'create') {
        await withDataLog(log, 'AdminVendorsPage createVendor', {}, () =>
          adminApi.createVendor(vendorInput(form), opts),
        );
        return { ok: true, intent };
      }
      if (intent === 'update') {
        await withDataLog(log, 'AdminVendorsPage updateVendor', { vendorId: id }, () =>
          adminApi.updateVendor(id, vendorInput(form), opts),
        );
        return { ok: true, intent };
      }
      if (intent === 'delete') {
        await withDataLog(log, 'AdminVendorsPage deleteVendor', { vendorId: id }, () =>
          adminApi.deleteVendor(id, opts),
        );
        return { ok: true, intent };
      }
      return { ok: false, intent, error: 'Unknown intent' };
    } catch (err) {
      return { ...toActionFailure(err, [401, 403]), intent };
    }
  },
);
