/**
 * Rate-limit response headers (api-rate-limiting spec, "Rate-limited responses
 * follow one contract"):
 *
 * - IETF `draft-ietf-httpapi-ratelimit-headers-11` Structured-Field lists, one
 *   item appended per evaluated policy: `RateLimit-Policy: "<id>";q=<limit>;w=<window>`
 *   and `RateLimit: "<id>";r=<remaining>;t=<seconds-to-reset>`;
 * - the legacy `X-RateLimit-Limit` / `-Remaining` / `-Reset` (epoch seconds),
 *   overwritten so they describe the last evaluated policy;
 * - `Retry-After` (delta-seconds, minimum 1) on every 429.
 *
 * Headers are written to `c.res.headers` (not `c.header()`), which makes Hono
 * create the response object early, so they are merged into whatever the
 * handler returns: `c.json()`, the error handler's response, or a raw
 * `new Response(...)` (prepared `c.header()` values are lost on raw responses).
 */
import type { Context } from 'hono';
import type { RateLimitPolicy } from './policies.ts';

/** The limiter state a header set describes. */
export interface RateLimitState {
  /** Points left in the current window (never negative). */
  remaining: number;
  /** Milliseconds until the key's window resets. */
  msBeforeNext: number;
}

/**
 * Whole seconds until reset, rounded up and never negative.
 *
 * @param msBeforeNext - Milliseconds until the window resets.
 */
function secondsUntil(msBeforeNext: number): number {
  return Math.max(0, Math.ceil(msBeforeNext / 1000));
}

/**
 * Append this policy's items to `RateLimit-Policy` and `RateLimit`, and
 * overwrite the legacy `X-RateLimit-*` headers with its values.
 *
 * @param c - The Hono request context.
 * @param policy - The evaluated policy.
 * @param state - Remaining points and time to reset from the limiter.
 */
export function appendRateLimitHeaders(
  c: Context,
  policy: RateLimitPolicy,
  state: RateLimitState,
): void {
  const headers = c.res.headers;
  const remaining = Math.max(0, state.remaining);
  const seconds = secondsUntil(state.msBeforeNext);
  headers.append('RateLimit-Policy', `"${policy.id}";q=${policy.points};w=${policy.durationSec}`);
  headers.append('RateLimit', `"${policy.id}";r=${remaining};t=${seconds}`);
  headers.set('X-RateLimit-Limit', String(policy.points));
  headers.set('X-RateLimit-Remaining', String(remaining));
  headers.set(
    'X-RateLimit-Reset',
    String(Math.ceil((Date.now() + Math.max(0, state.msBeforeNext)) / 1000)),
  );
}

/**
 * Set `Retry-After` to the whole seconds until the window resets (minimum 1).
 *
 * @param c - The Hono request context.
 * @param msBeforeNext - Milliseconds until the key's window resets.
 */
export function setRetryAfter(c: Context, msBeforeNext: number): void {
  c.res.headers.set('Retry-After', String(Math.max(1, secondsUntil(msBeforeNext))));
}
