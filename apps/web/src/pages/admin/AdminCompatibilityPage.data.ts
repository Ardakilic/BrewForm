import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { adminApi } from '../../api/index.ts';
import type { CompatibilityRule } from '../../api/types.ts';
import { formString, toActionFailure } from '../../routes/action-result.ts';
import { requireAdmin } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('AdminCompatibilityPage');

/** `/admin/compatibility` loader: every brew-method × equipment-type rule (admin only). */
export const loader = requireAdmin(({ request }: LoaderFunctionArgs) =>
  withDataLog(log, 'AdminCompatibilityPage loadRules', {}, async () => ({
    rules: await adminApi.getCompatibility({ signal: request.signal }),
  })),
);

/** Result of the `/admin/compatibility` action. */
export type CompatibilityActionResult =
  | { ok: true; intent: 'toggle'; rule: CompatibilityRule }
  | { ok: true; intent: 'flush' }
  | { ok: false; intent: string; error: string; code?: string };

/**
 * `/admin/compatibility` action, keyed by `intent`: `toggle` sets one rule's `isCompatible`
 * (`id`, `isCompatible`), `flush` flushes the API cache. Returns `{ ok: true, … }` or
 * `{ ok: false, error }`; 401/403 still redirect through `requireAdmin`.
 */
export const action = requireAdmin(
  async ({ request }: ActionFunctionArgs): Promise<CompatibilityActionResult> => {
    const form = await request.formData();
    const intent = formString(form, 'intent');
    const opts = { signal: request.signal };
    try {
      if (intent === 'toggle') {
        const id = formString(form, 'id');
        return await withDataLog(
          log,
          'AdminCompatibilityPage toggleRule',
          { ruleId: id },
          async () => ({
            ok: true as const,
            intent: 'toggle' as const,
            rule: await adminApi.setCompatibility(
              id,
              formString(form, 'isCompatible') === 'true',
              opts,
            ),
          }),
        );
      }
      if (intent === 'flush') {
        await withDataLog(log, 'AdminCompatibilityPage flushCache', {}, () =>
          adminApi.flushCache(opts),
        );
        return { ok: true, intent: 'flush' };
      }
      return { ok: false, intent, error: 'Unknown intent' };
    } catch (err) {
      return { ...toActionFailure(err, [401, 403]), intent };
    }
  },
);
