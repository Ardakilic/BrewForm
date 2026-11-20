import { ApiError, isAbortError } from '../api/errors.ts';

/** An action's expected-failure result: the error message and, for API errors, its code. */
export interface ActionFailure {
  ok: false;
  error: string;
  code?: string;
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
    return { ok: false, error: err.message, code: err.code };
  }
  return { ok: false, error: err instanceof Error ? err.message : 'Request failed' };
}

/** Reads a required string field from submitted form data (`''` when absent). */
export function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}
