/**
 * BrewForm Rate Limiting Middleware
 * Protects endpoints from abuse
 */

import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';
import { checkRateLimit } from '../utils/redis/index.js';
import { getConfig } from '../config/index.js';
import { logSecurity } from '../utils/logger/index.js';

// ============================================
// Types
// ============================================

export interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (c: Context) => string;
  action?: string;
  skipIfAuthenticated?: boolean;
}

// ============================================
// Middleware
// ============================================

/**
 * Get client identifier for rate limiting
 */
function getClientIdentifier(c: Context): string {
  // Use user ID if authenticated
  const user = c.get('user');
  if (user) {
    return `user:${user.id}`;
  }

  // Otherwise use IP
  const forwarded = c.req.header('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 
    c.req.header('x-real-ip') ||
    'unknown';
  
  return `ip:${ip}`;
}

/**
 * Create rate limiting middleware
 */
export function createRateLimiter(options: RateLimitOptions = {}) {
  const config = getConfig();
  
  const windowMs = options.windowMs ?? config.rateLimitWindowMs;
  const maxRequests = options.maxRequests ?? config.rateLimitMaxRequests;
  const action = options.action ?? 'default';
  const keyGenerator = options.keyGenerator ?? getClientIdentifier;
  const skipIfAuthenticated = options.skipIfAuthenticated ?? false;

  return createMiddleware(async (c: Context, next: Next) => {
    // Skip if authenticated and configured to do so
    if (skipIfAuthenticated && c.get('user')) {
      return next();
    }

    const identifier = keyGenerator(c);
    const result = await checkRateLimit(identifier, action, maxRequests, windowMs);

    // Set rate limit headers
    c.header('X-RateLimit-Limit', maxRequests.toString());
    c.header('X-RateLimit-Remaining', result.remaining.toString());
    c.header('X-RateLimit-Reset', new Date(result.resetAt).toISOString());

    if (!result.allowed) {
      logSecurity('rate_limit_exceeded', {
        identifier,
        action,
        path: c.req.path,
      });

      return c.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please try again later.',
            retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
          },
        },
        429
      );
    }

    return next();
  });
}

/**
 * Default rate limiter
 */
export const rateLimitMiddleware = createRateLimiter();

/**
 * Strict rate limiter for auth endpoints
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
  action: 'auth',
});

/**
 * API rate limiter
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  action: 'api',
  skipIfAuthenticated: true,
});

/**
 * Write operations rate limiter
 */
export const writeRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  action: 'write',
});

export default {
  create: createRateLimiter,
  default: rateLimitMiddleware,
  auth: authRateLimiter,
  api: apiRateLimiter,
  write: writeRateLimiter,
};
