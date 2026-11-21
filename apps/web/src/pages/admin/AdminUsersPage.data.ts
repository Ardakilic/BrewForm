import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { adminApi } from '../../api/index.ts';
import type { AdminUserDetail } from '../../api/types.ts';
import { formString, toActionFailure } from '../../routes/action-result.ts';
import { requireAdmin } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';
import { parseAdminUsersParams } from '../../utils/list-parsers.ts';

const log = createLogger('AdminUsersPage');

/** Users shown per page on `/admin/users`. */
export const ADMIN_USERS_PER_PAGE = 20;

/**
 * `/admin/users` loader: the requested `?page` of users matching `?q` (both read with the
 * shared parser the page's controls use). Admin only: 401 → login, 403 → home.
 */
export const loader = requireAdmin(({ request }: LoaderFunctionArgs) => {
  const { page, q } = parseAdminUsersParams(new URL(request.url).searchParams);
  return withDataLog(log, 'AdminUsersPage loadUsers', { page }, async () => {
    const params: Record<string, string> = {
      page: String(page),
      perPage: String(ADMIN_USERS_PER_PAGE),
    };
    if (q) params.q = q;
    const res = await adminApi.getUsers(params, { signal: request.signal });
    return { users: res.data, pagination: res.meta.pagination };
  });
});

/** Result of the `/admin/users` action (`isAdmin` echoes the requested role). */
export type AdminUsersActionResult =
  | { ok: true; intent: 'toggleAdmin'; isAdmin: boolean; user: AdminUserDetail }
  | { ok: false; intent: string; isAdmin: boolean; error: string; code?: string };

/**
 * `/admin/users` action, keyed by `intent`: `toggleAdmin` grants or removes admin rights
 * (`userId`, `isAdmin`). Returns `{ ok: true, … }` or `{ ok: false, error }`; 401/403 still
 * redirect through `requireAdmin`. Ban and unban submit to the `/admin/users/:id` action.
 */
export const action = requireAdmin(
  async ({ request }: ActionFunctionArgs): Promise<AdminUsersActionResult> => {
    const form = await request.formData();
    const intent = formString(form, 'intent');
    const isAdmin = formString(form, 'isAdmin') === 'true';
    try {
      if (intent === 'toggleAdmin') {
        const userId = formString(form, 'userId');
        const user = await withDataLog(log, 'AdminUsersPage toggleAdmin', { userId }, () =>
          adminApi.toggleAdmin(userId, isAdmin, { signal: request.signal }),
        );
        return { ok: true, intent: 'toggleAdmin', isAdmin, user };
      }
      return { ok: false, intent, isAdmin, error: 'Unknown intent' };
    } catch (err) {
      return { ...toActionFailure(err, [401, 403]), intent, isAdmin };
    }
  },
);
