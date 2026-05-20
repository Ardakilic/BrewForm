import type { Context, Next } from 'hono';
import { cacheProvider } from '../utils/cache/singleton.ts';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

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
