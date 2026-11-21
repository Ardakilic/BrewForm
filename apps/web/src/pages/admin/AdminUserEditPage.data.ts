import type { AdminUpdateUser } from '@brewform/shared/schemas';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { ApiError, isAbortError } from '../../api/errors.ts';
import { adminApi } from '../../api/index.ts';
import { toActionFailure } from '../../routes/action-result.ts';
import { requireAdmin } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('AdminUserEditPage');

/**
 * `/admin/users/:id/edit` loader: the user being edited. A missing user (API 404) throws a
 * 404 `Response` (the not-found page); other failures log `AdminUserEditPage loadData failed`
 * and rethrow to the route error state. Admin only.
 */
export const loader = requireAdmin(async ({ params, request }: LoaderFunctionArgs) => {
  const id = params.id;
  if (!id) throw new Response('Not Found', { status: 404 });
  log.debug({ userId: id }, 'AdminUserEditPage loadData started');
  try {
    const user = await adminApi.getUserDetail(id, { signal: request.signal });
    log.debug({ userId: id }, 'AdminUserEditPage loadData completed');
    return { user };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      throw new Response('Not Found', { status: 404 });
    }
    if (!isAbortError(err)) log.error({ err, userId: id }, 'AdminUserEditPage loadData failed');
    throw err;
  }
});

/** JSON body the edit page submits: the `update` intent with only the changed fields. */
export interface AdminUserEditSubmission {
  intent: 'update';
  data: AdminUpdateUser;
}

/** Result of the `/admin/users/:id/edit` action. */
export type AdminUserEditActionResult =
  | { ok: true; intent: 'update' }
  | { ok: false; intent: string; error: string; code?: string };

/**
 * `/admin/users/:id/edit` action: the `update` intent (a JSON submission) patches the user
 * with the changed fields only and returns `{ ok: true }` or `{ ok: false, error, code }`
 * (a `CONFLICT` code means the email or username is taken). 401/403 redirect through
 * `requireAdmin`.
 */
export const action = requireAdmin(
  async ({ params, request }: ActionFunctionArgs): Promise<AdminUserEditActionResult> => {
    const userId = params.id ?? '';
    const body = (await request.json()) as Partial<AdminUserEditSubmission>;
    const intent = body.intent ?? '';
    try {
      if (intent === 'update' && body.data) {
        const data = body.data;
        await withDataLog(log, 'AdminUserEditPage updateUser', { userId }, () =>
          adminApi.updateUser(userId, data, { signal: request.signal }),
        );
        return { ok: true, intent: 'update' };
      }
      return { ok: false, intent, error: 'Unknown intent' };
    } catch (err) {
      return { ...toActionFailure(err, [401, 403]), intent };
    }
  },
);
