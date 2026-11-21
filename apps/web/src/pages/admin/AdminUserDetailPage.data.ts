import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { ApiError, isAbortError } from '../../api/errors.ts';
import { adminApi } from '../../api/index.ts';
import { formString, toActionFailure } from '../../routes/action-result.ts';
import { requireAdmin } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('AdminUserDetailPage');

/**
 * `/admin/users/:id` loader: the user's admin detail. A missing user (API 404) throws a 404
 * `Response` so the route renders the not-found page, without an error log; any other
 * failure logs `AdminUserDetailPage loadData failed` before rethrowing to the route error
 * state. Admin only: 401 → login, 403 → home.
 */
export const loader = requireAdmin(async ({ params, request }: LoaderFunctionArgs) => {
  const id = params.id;
  if (!id) throw new Response('Not Found', { status: 404 });
  log.debug({ userId: id }, 'AdminUserDetailPage loadData started');
  try {
    const user = await adminApi.getUserDetail(id, { signal: request.signal });
    log.debug({ userId: id }, 'AdminUserDetailPage loadData completed');
    return { user };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      throw new Response('Not Found', { status: 404 });
    }
    if (!isAbortError(err)) log.error({ err }, 'AdminUserDetailPage loadData failed');
    throw err;
  }
});

/** The intents the `/admin/users/:id` action accepts. */
export type AdminUserIntent = 'delete' | 'ban' | 'unban';

/** Result of the `/admin/users/:id` action. */
export type AdminUserActionResult =
  | { ok: true; intent: AdminUserIntent }
  | { ok: false; intent: string; error: string; code?: string };

/**
 * `/admin/users/:id` action, keyed by `intent`: `delete` soft-deletes the user, `ban` bans
 * them with `reason`, `unban` lifts the ban. Every call passes `request.signal` and returns
 * `{ ok: true, intent }` or `{ ok: false, intent, error }`; 401/403 still redirect through
 * `requireAdmin`. Logs carry the user id only, never the ban reason.
 */
export const action = requireAdmin(
  async ({ params, request }: ActionFunctionArgs): Promise<AdminUserActionResult> => {
    const userId = params.id ?? '';
    const form = await request.formData();
    const intent = formString(form, 'intent');
    const opts = { signal: request.signal };
    try {
      if (intent === 'delete') {
        await withDataLog(log, 'AdminUserDetailPage deleteUser', { userId }, () =>
          adminApi.deleteUser(userId, opts),
        );
        return { ok: true, intent };
      }
      if (intent === 'ban') {
        const reason = formString(form, 'reason');
        await withDataLog(log, 'AdminUserDetailPage banUser', { userId }, () =>
          adminApi.banUser(userId, reason, opts),
        );
        return { ok: true, intent };
      }
      if (intent === 'unban') {
        await withDataLog(log, 'AdminUserDetailPage unbanUser', { userId }, () =>
          adminApi.unbanUser(userId, opts),
        );
        return { ok: true, intent };
      }
      return { ok: false, intent, error: 'Unknown intent' };
    } catch (err) {
      return { ...toActionFailure(err, [401, 403]), intent };
    }
  },
);
