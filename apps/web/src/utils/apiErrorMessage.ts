import { type ApiError, isApiError } from '@/api/errors.ts';

/** Seconds shown in the rate-limit message when the server sent no usable `Retry-After`. */
export const DEFAULT_RETRY_AFTER_SECONDS = 60;

/**
 * True when `err` is a rate-limited API error (`ApiError` with code `RATE_LIMITED`).
 *
 * @param err - Anything caught from an API call.
 */
export function isRateLimitedError(err: unknown): err is ApiError {
  return isApiError(err) && err.code === 'RATE_LIMITED';
}

/**
 * The message to show for a failed API call:
 *
 * - a rate-limited error → the localised `error.rateLimited` text with
 *   `{seconds}` replaced by `retryAfterSeconds` (60 when unknown);
 * - any other `Error` with a message → that message;
 * - otherwise → `t(fallbackKey)`.
 *
 * @param err - Anything caught from an API call.
 * @param t - The locale-bound translator from `useTranslation()`.
 * @param fallbackKey - i18n key used when there is no better message.
 * @returns The user-visible message.
 */
export function getApiErrorMessage(
  err: unknown,
  t: (key: string) => string,
  fallbackKey: string,
): string {
  if (isRateLimitedError(err)) {
    const seconds = err.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS;
    return t('error.rateLimited').replace('{seconds}', String(seconds));
  }
  if (err instanceof Error && err.message) return err.message;
  return t(fallbackKey);
}
