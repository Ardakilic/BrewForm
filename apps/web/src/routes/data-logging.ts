import type { ChildLogger } from '@brewform/shared/logger';
import { isAbortError } from '../api/errors.ts';

/**
 * Runs a loader/action body with the standard structured logs: `debug` `<label> started` and
 * `<label> completed` with the given ids, and `error` `<label> failed` with `{ err, ...ids }`
 * before rethrowing. Aborted requests and thrown `Response`s (404s, redirects) are rethrown
 * without an error log: they are routing outcomes, not failures. Ids only, never payloads.
 */
export async function withDataLog<T>(
  log: ChildLogger,
  label: string,
  ids: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  log.debug(ids, `${label} started`);
  try {
    const result = await fn();
    log.debug(ids, `${label} completed`);
    return result;
  } catch (err) {
    if (!isAbortError(err) && !(err instanceof Response)) {
      log.error({ err, ...ids }, `${label} failed`);
    }
    throw err;
  }
}
