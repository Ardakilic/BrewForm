import type { ActionFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { adminApi } from '../../api/index.ts';
import { toActionFailure } from '../../routes/action-result.ts';
import { requireAdmin } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('AdminCachePage');

/** Result of the `/admin/cache` action. */
export type AdminCacheActionResult = { ok: true } | { ok: false; error: string; code?: string };

/**
 * `/admin/cache` action: flushes every server-side cache. Returns `{ ok: true }` or
 * `{ ok: false, error }`; 401/403 still redirect through `requireAdmin`.
 */
export const action = requireAdmin(
  async ({ request }: ActionFunctionArgs): Promise<AdminCacheActionResult> => {
    try {
      await withDataLog(log, 'AdminCachePage flushAll', {}, () =>
        adminApi.flushCache({ signal: request.signal }),
      );
      return { ok: true };
    } catch (err) {
      return toActionFailure(err, [401, 403]);
    }
  },
);
