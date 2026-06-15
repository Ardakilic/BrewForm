import type { Context, Next } from 'hono';
import { cacheProvider } from '../utils/cache/singleton.ts';
import { createLogger } from '../utils/logger/index.ts';

/**
 * Rate limiting middleware.
 *
 * Provides IP-based and authentication-based rate limiters backed by the
 * shared cache provider. Tracks request counts per sliding window and returns
 * 429 responses when limits are exceeded.
 */

export const log = createLogger('rate-limit-middleware');

/** In-memory rate limit tracking entry. */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * IP-based rate limiter.
 *
 * @param options.maxRequests - Maximum allowed requests per window (defaults to 100).
 * @param options.windowMs - Sliding window duration in milliseconds (defaults to 60_000).
 * @param options.keyPrefix - Optional prefix for the cache key.
 * @returns Hono middleware that returns 429 when the limit is exceeded.
 */
export function rateLimitMiddleware(options: {
  windowMs?: number;
  maxRequests?: number;
  keyPrefix?: string;
} = {}) {
  const windowMs = options.windowMs || 60_000;
  const maxRequests = options.maxRequests || 100;
  const keyPrefix = options.keyPrefix || 'rate-limit';

  return async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    const entry = await cacheProvider.get<RateLimitEntry>(['ratelimit', key]);
    const current = entry || { count: 0, resetAt: now + windowMs };

    if (now > current.resetAt) {
      current.count = 0;
      current.resetAt = now + windowMs;
    }

    current.count++;

    await cacheProvider.set(['ratelimit', key], current, { ttlMs: windowMs });

    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - current.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(current.resetAt / 1000)));

    if (current.count > maxRequests) {
      log.warn({ ip, limit: maxRequests }, 'rateLimitMiddleware rate limit exceeded');
      return c.json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, please try again later',
        },
      }, 429);
    }

    await next();
  };
}

/**
 * Authentication endpoint rate limiter.
 *
 * @param options.maxAttempts - Maximum allowed attempts per window (defaults to 5).
 * @param options.windowMs - Sliding window duration in milliseconds (defaults to 15 * 60_000).
 * @param options.keyPrefix - Optional prefix for the cache key.
 * @returns Hono middleware that returns 429 when the attempt limit is exceeded.
 */
export function authRateLimitMiddleware(options: {
  windowMs?: number;
  maxAttempts?: number;
} = {}) {
  const windowMs = options.windowMs || 15 * 60_000;
  const maxAttempts = options.maxAttempts || 5;

  return async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    const key = `auth-ratelimit:${ip}`;
    const now = Date.now();

    const entry = await cacheProvider.get<RateLimitEntry>(['ratelimit', key]);
    const current = entry || { count: 0, resetAt: now + windowMs };

    if (now > current.resetAt) {
      current.count = 0;
      current.resetAt = now + windowMs;
    }

    current.count++;

    await cacheProvider.set(['ratelimit', key], current, { ttlMs: windowMs });

    c.header('X-RateLimit-Limit', String(maxAttempts));
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxAttempts - current.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(current.resetAt / 1000)));

    if (current.count > maxAttempts) {
      const userId = c.get('userId');
      log.warn({ userId, ip, limit: maxAttempts }, 'authRateLimitMiddleware rate limit exceeded');
      return c.json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many login attempts, please try again later',
        },
      }, 429);
    }

    await next();
  };
}
