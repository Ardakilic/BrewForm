import { createHash } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { type RateLimiterAbstract, RateLimiterRes } from 'rate-limiter-flexible';
import { config } from '../config/index.ts';
import { getClientIp, rateLimitIpKey } from '../utils/client-ip/index.ts';
import { createLogger } from '../utils/logger/index.ts';
import { appendRateLimitHeaders, setRetryAfter } from '../utils/rate-limit/headers.ts';
import type { RateLimitPolicy } from '../utils/rate-limit/policies.ts';
import { getRateLimitBackend } from '../utils/rate-limit/registry.ts';

/**
 * Rate limiting middleware: the Hono adapter over `rate-limiter-flexible`
 * (api-rate-limiting spec, ADR-016).
 *
 * - {@link rateLimit} counts every request against a named policy;
 * - {@link rateLimitFailures} counts only failed attempts (OWASP login
 *   pattern): an atomic `consume` reserves a point before the handler (so
 *   parallel attempts cannot pass the limit together), the point stays after a
 *   failure status, the counter is deleted after a 2xx when `resetOnSuccess`,
 *   and the point is given back with `reward` otherwise.
 *
 * Keys are `<policy-id>:<dimension>`: the normalised client IP (IPv6 by /64)
 * from `getClientIp`, the user id, or {@link emailKey}. State lives in the
 * rate-limit backend resolved from the registry on every request (never the
 * cache). A 429 uses the standard error envelope with the policy message, plus
 * `Retry-After` and the draft-11 / legacy rate-limit headers. If the limiter
 * itself throws an `Error`, the request is allowed (fail-open) and logged.
 * Logs carry only `policy`, `limit`, `userId` and `err`: never an IP, email or
 * store key. `RATE_LIMIT_ENABLED=false` makes every limiter a pass-through.
 */

export const log = createLogger('rate-limit-middleware');

/** Derives the policy key for a request, or `null` to skip limiting it. */
export type RateLimitKeyFn = (c: Context) => string | null;

/** Options for {@link rateLimit}. */
export interface RateLimitOptions {
  /** Key derivation; defaults by the policy dimension (see {@link defaultKey}). */
  key?: RateLimitKeyFn;
  /** Requests for which the policy is not evaluated at all. */
  skip?: (c: Context) => boolean;
}

/** Options for {@link rateLimitFailures}. */
export interface RateLimitFailuresOptions {
  /** Key derivation; defaults by the policy dimension (see {@link defaultKey}). */
  key?: RateLimitKeyFn;
  /** Which response statuses count as a failure (default: only 401). */
  isFailure?: (status: number) => boolean;
  /** Delete the counter after a 2xx response (consecutive-failure policies). */
  resetOnSuccess?: boolean;
}

/**
 * Hash an email for use in a rate-limit key: trim, lower-case, SHA-256, first
 * 32 hex characters (bounded length, no raw address in the store).
 *
 * @param email - The submitted email address.
 * @returns A 32-character hex digest.
 */
export function emailKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32);
}

/**
 * The email from the request's validated JSON body (`c.req.valid('json')`),
 * available once `zValidator('json', ...)` has run.
 *
 * @param c - The Hono request context.
 * @returns The email string, or `null` when there is none.
 */
function validatedEmail(c: Context): string | null {
  const body = (c.req as unknown as { valid(target: 'json'): unknown }).valid('json');
  const email = (body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email : null;
}

/**
 * Key for email-keyed policies: {@link emailKey} of the validated body email.
 * Mount after `zValidator('json', ...)`.
 *
 * @param c - The Hono request context.
 * @returns The hashed email, or `null` when the body has no email.
 */
export function validatedEmailKey(c: Context): string | null {
  const email = validatedEmail(c);
  return email === null ? null : emailKey(email);
}

/**
 * The (email, IP) key `<emailKey>:<rateLimitIpKey>` for an email and the
 * requesting client (used by `auth-login-fail-account-ip`).
 *
 * @param c - The Hono request context (for the client IP).
 * @param email - The account email (hashed by {@link emailKey}).
 * @returns The combined key.
 */
export function emailIpKey(c: Context, email: string): string {
  return `${emailKey(email)}:${rateLimitIpKey(getClientIp(c))}`;
}

/**
 * Key for (email, IP) policies: {@link emailIpKey} of the validated body email.
 * Mount after `zValidator('json', ...)`.
 *
 * @param c - The Hono request context.
 * @returns The combined key, or `null` when the body has no email.
 */
export function validatedEmailIpKey(c: Context): string | null {
  const email = validatedEmail(c);
  return email === null ? null : emailIpKey(c, email);
}

/**
 * The key function implied by a policy's dimension: the client IP key for
 * `ip`, the authenticated `userId` for `user`, and the validated body email
 * (hashed) for `email` / `email-ip`.
 *
 * @param policy - The policy being mounted.
 * @returns The default key function.
 */
function defaultKey(policy: RateLimitPolicy): RateLimitKeyFn {
  switch (policy.dimension) {
    case 'user':
      return (c) => {
        const userId: unknown = c.get('userId');
        return typeof userId === 'string' && userId !== '' ? userId : null;
      };
    case 'email':
      return validatedEmailKey;
    case 'email-ip':
      return validatedEmailIpKey;
    default:
      return (c) => rateLimitIpKey(getClientIp(c));
  }
}

/**
 * Build the 429 response for a policy: headers (remaining 0), `Retry-After`,
 * the exceeded warn log and the standard error envelope.
 *
 * @param c - The Hono request context.
 * @param policy - The policy that rejected the request.
 * @param res - The limiter state (for the time until reset).
 * @returns The 429 response.
 */
function rejectRequest(c: Context, policy: RateLimitPolicy, res: RateLimiterRes): Response {
  appendRateLimitHeaders(c, policy, { remaining: 0, msBeforeNext: res.msBeforeNext });
  setRetryAfter(c, res.msBeforeNext);
  const userId: unknown = c.get('userId');
  log.warn(
    {
      policy: policy.id,
      limit: policy.points,
      ...(typeof userId === 'string' && userId !== '' ? { userId } : {}),
    },
    'rateLimitMiddleware rate limit exceeded',
  );
  return c.json(
    {
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: policy.message,
        requestId: c.get('requestId'),
      },
    },
    429,
  );
}

/**
 * Count every request against `policy`. Over the limit it answers 429; under
 * it, it appends the policy's rate-limit headers and calls `next()`.
 *
 * @param policy - The policy to enforce.
 * @param opts - Optional key derivation and skip predicate.
 * @returns Hono middleware.
 */
export function rateLimit(policy: RateLimitPolicy, opts: RateLimitOptions = {}): MiddlewareHandler {
  const keyOf = opts.key ?? defaultKey(policy);
  return async (c, next) => {
    if (!config.RATE_LIMIT_ENABLED || opts.skip?.(c)) return next();
    const key = keyOf(c);
    if (key === null) return next();

    let res: RateLimiterRes;
    try {
      res = await getRateLimitBackend().limiter(policy).consume(key);
    } catch (err) {
      if (err instanceof RateLimiterRes) return rejectRequest(c, policy, err);
      log.error({ err, policy: policy.id }, 'rateLimit limiter failed; allowing request');
      return next();
    }
    appendRateLimitHeaders(c, policy, {
      remaining: res.remainingPoints,
      msBeforeNext: res.msBeforeNext,
    });
    return next();
  };
}

/**
 * Count only failed attempts against `policy`, consume first: before the
 * handler it reserves one point with an atomic `consume` and answers 429 when
 * that is rejected (a rejected `RateLimiterRes`), so concurrent attempts can
 * never pass the limit together; any other limiter error fails open with an
 * error log. After the handler the reserved point stays only when
 * `isFailure(status)` (default: 401); after a 2xx with `resetOnSuccess` the
 * counter is deleted; for every other status the point is given back with
 * `reward`. A failed counter update is logged at error. The threshold is
 * unchanged: `points` failures pass, the next attempt is refused. Headers are
 * set only on its own 429.
 *
 * @param policy - The failure-only policy to enforce.
 * @param opts - Key derivation, failure predicate and reset-on-success flag.
 * @returns Hono middleware.
 */
export function rateLimitFailures(
  policy: RateLimitPolicy,
  opts: RateLimitFailuresOptions = {},
): MiddlewareHandler {
  const keyOf = opts.key ?? defaultKey(policy);
  const isFailure = opts.isFailure ?? ((status: number) => status === 401);
  return async (c, next) => {
    if (!config.RATE_LIMIT_ENABLED) return next();
    const key = keyOf(c);
    if (key === null) return next();

    let limiter: RateLimiterAbstract;
    try {
      limiter = getRateLimitBackend().limiter(policy);
      await limiter.consume(key);
    } catch (err) {
      if (err instanceof RateLimiterRes) return rejectRequest(c, policy, err);
      log.error({ err, policy: policy.id }, 'rateLimitFailures limiter failed; allowing request');
      return next();
    }

    await next();

    const status = c.res.status;
    // The reserved point is the failure.
    if (isFailure(status)) return;
    try {
      if (opts.resetOnSuccess && status >= 200 && status < 300) {
        await limiter.delete(key);
      } else {
        await limiter.reward(key);
      }
    } catch (err) {
      log.error({ err, policy: policy.id }, 'rateLimitFailures counter update failed');
    }
  };
}
