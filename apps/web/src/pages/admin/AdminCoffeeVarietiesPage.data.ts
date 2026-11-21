import type { CoffeeVarietyCreate, CoffeeVarietyUpdate } from '@brewform/shared/schemas';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { adminApi } from '../../api/index.ts';
import { toActionFailure } from '../../routes/action-result.ts';
import { requireAdmin } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';
import { parseCoffeeVarietyCatalogParams } from '../../utils/list-parsers.ts';

const log = createLogger('AdminCoffeeVarietiesPage');

/** Coffee varieties per admin page. */
export const ADMIN_COFFEE_VARIETIES_PER_PAGE = 20;

/**
 * `/admin/coffee-varieties` loader: the requested `?page` of varieties filtered by
 * `?category` and `?q` (sent to the API as `search`), parsed with the same shared parser the
 * page's controls use.
 */
export const loader = requireAdmin(({ request }: LoaderFunctionArgs) => {
  const { page, category, q } = parseCoffeeVarietyCatalogParams(new URL(request.url).searchParams);
  return withDataLog(log, 'AdminCoffeeVarietiesPage loadData', { page, category }, async () => {
    const params: Record<string, string> = {
      page: String(page),
      perPage: String(ADMIN_COFFEE_VARIETIES_PER_PAGE),
    };
    if (category) params.category = category;
    if (q) params.search = q;
    const res = await adminApi.getCoffeeVarieties(params, { signal: request.signal });
    return { items: res.data, pagination: res.meta.pagination };
  });
});

/** JSON body submitted to the `/admin/coffee-varieties` action. */
export type AdminCoffeeVarietySubmission =
  | { intent: 'create'; body: CoffeeVarietyCreate }
  | { intent: 'update'; id: string; body: CoffeeVarietyUpdate }
  | { intent: 'delete'; id: string };

/** Result of the `/admin/coffee-varieties` action. */
export type AdminCoffeeVarietiesActionResult =
  | { ok: true; intent: 'create' | 'update' | 'delete' }
  | { ok: false; intent: string; error: string; code?: string };

/**
 * `/admin/coffee-varieties` action. Receives a JSON {@link AdminCoffeeVarietySubmission}
 * (`encType: 'application/json'`, since the form has many dynamic fields) keyed by `intent`:
 * `create`, `update` and `delete`. Returns `{ ok: true, intent }` or
 * `{ ok: false, intent, error }`; 401/403 still redirect through `requireAdmin`.
 */
export const action = requireAdmin(
  async ({ request }: ActionFunctionArgs): Promise<AdminCoffeeVarietiesActionResult> => {
    const submission = (await request.json()) as AdminCoffeeVarietySubmission;
    const intent = submission.intent;
    const opts = { signal: request.signal };
    try {
      if (submission.intent === 'create') {
        await withDataLog(log, 'AdminCoffeeVarietiesPage createVariety', {}, () =>
          adminApi.createCoffeeVariety(submission.body, opts),
        );
        return { ok: true, intent: 'create' };
      }
      if (submission.intent === 'update') {
        const { id, body } = submission;
        await withDataLog(log, 'AdminCoffeeVarietiesPage updateVariety', { varietyId: id }, () =>
          adminApi.updateCoffeeVariety(id, body, opts),
        );
        return { ok: true, intent: 'update' };
      }
      if (submission.intent === 'delete') {
        const { id } = submission;
        await withDataLog(log, 'AdminCoffeeVarietiesPage deleteVariety', { varietyId: id }, () =>
          adminApi.deleteCoffeeVariety(id, opts),
        );
        return { ok: true, intent: 'delete' };
      }
      return { ok: false, intent: String(intent), error: 'Unknown intent' };
    } catch (err) {
      return { ...toActionFailure(err, [401, 403]), intent: String(intent) };
    }
  },
);
