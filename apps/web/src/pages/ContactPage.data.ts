import type { ActionFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { contactApi } from '../api/index.ts';
import { type ActionFailure, formString, toActionFailure } from '../routes/action-result.ts';
import { withDataLog } from '../routes/data-logging.ts';

const log = createLogger('ContactPage');

/** Result of the `/contact` action. */
export type ContactActionResult = { ok: true } | ActionFailure;

/**
 * `/contact` action: sends the submitted `name`, `email`, `subject` and `message` through
 * `contactApi.send`. Returns `{ ok: true }` or `{ ok: false, error, code }` (a rate limit keeps
 * its `retryAfterSeconds`). The message text and address are never logged.
 */
export async function action({ request }: ActionFunctionArgs): Promise<ContactActionResult> {
  const form = await request.formData();
  const message = {
    name: formString(form, 'name'),
    email: formString(form, 'email'),
    subject: formString(form, 'subject'),
    message: formString(form, 'message'),
  };
  try {
    await withDataLog(log, 'ContactPage sendMessage', {}, () =>
      contactApi.send(message, { signal: request.signal }),
    );
    return { ok: true };
  } catch (err) {
    return toActionFailure(err, []);
  }
}
