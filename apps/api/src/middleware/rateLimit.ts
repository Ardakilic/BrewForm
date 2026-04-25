import type { Context, Next } from 'hono';
import type { CacheProvider } from '../utils/cache/index.ts';

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

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

    const cache = c.get('cache') as CacheProvider | undefined;
    const now = Date.now();

    const entry = cache
      ? await cache.get<{ count: number; resetAt: number }>(['ratelimit', key])
      : null;

    const current = entry || { count: 0, resetAt: now + windowMs };

    if (now > current.resetAt) {
      current.count = 0;
      current.resetAt = now + windowMs;
    }

    current.count++;

    if (cache) {
      await cache.set(['ratelimit', key], current, { ttlMs: windowMs });
    }

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

export function authRateLimitMiddleware() {
  const windowMs = 15 * 60_000;
  const maxAttempts = 5;

  return async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    const key = `auth:${ip}`;
    const now = Date.now();

    const entry = loginAttempts.get(key);
    if (entry && now > entry.resetAt) {
      loginAttempts.delete(key);
    }

    const current = loginAttempts.get(key) || { count: 0, resetAt: now + windowMs };
    current.count++;

    if (current.count > maxAttempts) {
      return c.json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many login attempts, please try again later',
        },
      }, 429);
    }

    loginAttempts.set(key, current);
    await next();
  };
}