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
 */
export const corsMiddleware = cors({
  origin: config.CORS_ALLOWED_ORIGINS.split(','),
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  maxAge: 600,
});
