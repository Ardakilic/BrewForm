import type { ActionFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { authApi } from '../../api/index.ts';
import { type ActionFailure, toActionFailure } from '../action-result.ts';
import { requireAuth } from '../auth-guards.ts';
import { withDataLog } from '../data-logging.ts';

const log = createLogger('resources/auth');

/** The resource-route path of {@link sendVerificationAction}. */
export const SEND_VERIFICATION_PATH = '/resources/auth/send-verification';

/** Result of {@link sendVerificationAction}. */
export type SendVerificationResult = { ok: true } | ActionFailure;

/**
 * `resources/auth/send-verification` action: re-sends the signed-in user's verification email
 * (submitted by `EmailVerificationBanner` through a fetcher). Returns `{ ok: true }` or
 * `{ ok: false, error, code }` (a rate limit keeps its `retryAfterSeconds`); a final 401
 * redirects to the login page through `requireAuth`.
 */
export const sendVerificationAction = requireAuth(
  async ({ request }: ActionFunctionArgs): Promise<SendVerificationResult> => {
    try {
      await withDataLog(log, 'sendVerification', {}, () =>
        authApi.sendVerification({ signal: request.signal }),
      );
      return { ok: true };
    } catch (err) {
      return toActionFailure(err);
    }
  },
);
