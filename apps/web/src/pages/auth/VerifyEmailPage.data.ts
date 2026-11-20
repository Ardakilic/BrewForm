import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { isAbortError } from '../../api/errors.ts';
import { authApi } from '../../api/index.ts';
import { type ActionFailure, toActionFailure } from '../../routes/action-result.ts';

const log = createLogger('VerifyEmailPage');

/** Outcome of verifying the `?token=` email token. */
export type VerifyEmailResult =
  | { status: 'success' }
  | { status: 'error'; reason: 'no-token' }
  | { status: 'error'; reason: 'failed'; failure: ActionFailure };

/**
 * `/verify-email` loader: verifies `?token=` exactly once (the route never revalidates, and a
 * loader is not re-run by React StrictMode's double effects). A missing token or a failed
 * verification returns an error result the page renders; the failure is logged as
 * `VerifyEmailPage verifyEmail failed`. An aborted request is rethrown.
 */
export async function loader({ request }: LoaderFunctionArgs): Promise<VerifyEmailResult> {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) {
    log.debug({}, 'VerifyEmailPage verifyEmail skipped: no token');
    return { status: 'error', reason: 'no-token' };
  }
  log.debug({}, 'VerifyEmailPage verifyEmail started');
  try {
    await authApi.verifyEmail(token, { signal: request.signal });
    log.debug({}, 'VerifyEmailPage verifyEmail completed');
    return { status: 'success' };
  } catch (err) {
    if (isAbortError(err)) throw err;
    log.error({ err }, 'VerifyEmailPage verifyEmail failed');
    return { status: 'error', reason: 'failed', failure: toActionFailure(err, []) };
  }
}

/** The verification loader never re-runs: a token is single-use. */
export function shouldRevalidate(): boolean {
  return false;
}
