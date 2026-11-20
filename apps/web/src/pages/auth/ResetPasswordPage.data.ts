import type { ActionFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { authApi } from '../../api/index.ts';
import { type ActionFailure, formString, toActionFailure } from '../../routes/action-result.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('ResetPasswordPage');

/** Result of the `/reset-password` action. */
export type ResetPasswordActionResult = { ok: true } | ActionFailure;

/**
 * `/reset-password` action: sets `newPassword` using the emailed `token`. Returns `{ ok: true }`
 * or `{ ok: false, error, code }`; the failure is logged as `ResetPasswordPage resetPassword
 * failed` (neither the token nor the password is logged).
 */
export async function action({ request }: ActionFunctionArgs): Promise<ResetPasswordActionResult> {
  const form = await request.formData();
  try {
    await withDataLog(log, 'ResetPasswordPage resetPassword', {}, () =>
      authApi.resetPassword(
        { token: formString(form, 'token'), newPassword: formString(form, 'newPassword') },
        { signal: request.signal },
      ),
    );
    return { ok: true };
  } catch (err) {
    return toActionFailure(err, []);
  }
}
