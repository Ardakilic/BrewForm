import { cors } from 'hono/cors';
import { config } from '../config/index.ts';

/**
 * CORS Configuration
 *
 * credentials: true — Required because the frontend sends requests with
 * credentials: 'include'. Currently the app uses Bearer token auth (not cookies),
 * but this ensures future compatibility when migrating to HTTP-only cookie auth.
 *
 * IMPORTANT: When credentials: true is set, the browser enforces that
 * Access-Control-Allow-Origin must be an explicit origin list — never '*'.
 * Our config provides the list via config.CORS_ALLOWED_ORIGINS.
 * Do not switch to wildcard origin while credentials: true is active.
 *
 * exposeHeaders: the cross-origin SPA can only read response headers listed
 * here, so the rate-limit contract (`Retry-After` on 429, the draft-11
 * `RateLimit` / `RateLimit-Policy` lists and the legacy `X-RateLimit-*`) is
 * exposed for the web client's "try again in N seconds" message.
 */
export const RATE_LIMIT_EXPOSED_HEADERS: readonly string[] = Object.freeze([
  'Retry-After',
  'RateLimit',
  'RateLimit-Policy',
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
]);

/** The API's CORS middleware (allowed origins from `CORS_ALLOWED_ORIGINS`). */
export const corsMiddleware = cors({
  origin: config.CORS_ALLOWED_ORIGINS.split(','),
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: [...RATE_LIMIT_EXPOSED_HEADERS],
  credentials: true,
  maxAge: 600,
});
