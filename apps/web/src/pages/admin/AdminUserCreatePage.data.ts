import type { AdminCreateUser } from '@brewform/shared/schemas';
import { type ActionFunctionArgs, redirect } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { adminApi } from '../../api/index.ts';
import { type ActionFailure, formString, toActionFailure } from '../../routes/action-result.ts';
import { requireAdmin } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('AdminUserCreatePage');

/** Builds the create payload from the submitted form (optional fields only when set). */
function toCreatePayload(form: FormData): AdminCreateUser {
  const data: AdminCreateUser = {
    email: formString(form, 'email'),
    username: formString(form, 'username'),
    password: formString(form, 'password'),
  };
  const displayName = formString(form, 'displayName');
  const bio = formString(form, 'bio');
  if (displayName) data.displayName = displayName;
  if (bio) data.bio = bio;
  if (formString(form, 'isAdmin') === 'true') data.isAdmin = true;
  if (formString(form, 'isBanned') === 'true') data.isBanned = true;
  return data;
}

/**
 * `/admin/users/new` action: creates the user and redirects to `/admin/users`, or returns
 * `{ ok: false, error, code }` (a `CONFLICT` code means the email or username is taken).
 * Logs carry no PII (no email, username or password). 401/403 redirect through `requireAdmin`.
 */
export const action = requireAdmin(
  async ({ request }: ActionFunctionArgs): Promise<ActionFailure | Response> => {
    const form = await request.formData();
    try {
      await withDataLog(log, 'AdminUserCreatePage createUser', {}, () =>
        adminApi.createUser(toCreatePayload(form), { signal: request.signal }),
      );
      return redirect('/admin/users');
    } catch (err) {
      return toActionFailure(err, [401, 403]);
    }
  },
);
