import { ApiError, isAbortError } from '../api/errors.ts';

/**
 * An action's expected-failure result: the error message and, for API errors, its code and
 * (for a rate limit) the `Retry-After` seconds.
 */
export interface ActionFailure {
  ok: false;
  error: string;
  code?: string;
  retryAfterSeconds?: number;
}

/**
 * Rebuilds an error from an action failure so components can reuse the error-message helpers
 * (`getApiErrorMessage`): an `ApiError` (with code and `retryAfterSeconds`) when the failure
 * carried an API code, otherwise a plain `Error`.
 */
export function failureToError(
  failure: Pick<ActionFailure, 'error' | 'code' | 'retryAfterSeconds'>,
): Error {
  if (failure.code) {
    return new ApiError(failure.code, failure.error, undefined, 0, failure.retryAfterSeconds);
  }
  return new Error(failure.error);
}

/**
 * Converts an error caught in a route action into `{ ok: false, error, code }` (the
 * web-data-loading action contract), so the page stays rendered and can toast or roll back.
 * Errors the router must handle are rethrown instead: an aborted request, and API errors whose
 * status is in `rethrowStatuses` (by default 401, so `requireAuth`/`requireAdmin` can redirect
 * to the login page; admin actions also pass 403).
 */
export function toActionFailure(
  err: unknown,
  rethrowStatuses: readonly number[] = [401],
): ActionFailure {
  if (isAbortError(err)) throw err;
  if (err instanceof ApiError) {
    if (rethrowStatuses.includes(err.status)) throw err;
    return err.retryAfterSeconds === undefined
      ? { ok: false, error: err.message, code: err.code }
      : { ok: false, error: err.message, code: err.code, retryAfterSeconds: err.retryAfterSeconds };
  }
  return { ok: false, error: err instanceof Error ? err.message : 'Request failed' };
}

/** Reads a required string field from submitted form data (`''` when absent). */
export function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}
