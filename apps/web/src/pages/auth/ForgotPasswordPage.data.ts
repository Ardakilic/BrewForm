import type { ActionFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { authApi } from '../../api/index.ts';
import { type ActionFailure, formString, toActionFailure } from '../../routes/action-result.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('ForgotPasswordPage');

/** Result of the `/forgot-password` action. */
export type ForgotPasswordActionResult = { ok: true } | ActionFailure;

/**
 * `/forgot-password` action: requests a reset link for the submitted `email`. Returns
 * `{ ok: true }` or `{ ok: false, error, code }`; the failure is logged as
 * `ForgotPasswordPage sendResetEmail failed` (the address is never logged).
 */
export async function action({ request }: ActionFunctionArgs): Promise<ForgotPasswordActionResult> {
  const form = await request.formData();
  try {
    await withDataLog(log, 'ForgotPasswordPage sendResetEmail', {}, () =>
      authApi.forgotPassword({ email: formString(form, 'email') }, { signal: request.signal }),
    );
    return { ok: true };
  } catch (err) {
    return toActionFailure(err, []);
  }
}
