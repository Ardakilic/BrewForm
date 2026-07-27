/**
 * Auth middleware — Hono route middleware for JWT-based authentication.
 *
 * Three middlewares are provided:
 *   - `authMiddleware` — mandatory auth, returns 401 on failure
 *   - `optionalAuthMiddleware` — best-effort auth, continues regardless
 *   - `adminMiddleware` — must follow authMiddleware, returns 403 if not admin
 *
 * Tokens are accepted from a cookie (`brewform_access_token`) or an
 * `Authorization: Bearer <token>` header, checked in that order.
 *
 * On success both `authMiddleware` and `optionalAuthMiddleware` set:
 *   - `c.set('userId', user.id)`
 *   - `c.set('user', user)` (the full user row, which includes `.isAdmin`)
 */
import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifyJwt } from '../modules/auth/jwt.ts';
import { db } from '@brewform/db';
import { users } from '@brewform/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { forbidden, unauthorized } from '../utils/response/index.ts';
import { createLogger } from '../utils/logger/index.ts';

/** Module-scoped structured logger for the JWT auth middleware. */
export const log = createLogger('auth-middleware');

/** Extract a JWT from the `brewform_access_token` cookie, falling back to
 *  the `Authorization: Bearer <token>` header. Returns null if neither is present. */
function extractToken(c: Context): string | null {
  const cookie = getCookie(c, 'brewform_access_token');
  if (cookie) return cookie;

  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);

  return null;
}

/**
 * Mandatory authentication middleware.
 *
 * **Token sources** (checked in order):
 *   1. Cookie `brewform_access_token`
 *   2. Header `Authorization: Bearer <token>`
 *
 * **Side effects on success**:
 *   - `c.set('userId', user.id)`
 *   - `c.set('user', user)` — full user row, `.isAdmin` is available
 *
 * **On failure** returns `401 Unauthorized` with JSON body:
 *   `{ error: 'Missing or invalid authentication' }`
 *   `{ error: 'Invalid token payload' }`
 *   `{ error: 'User not found' }`
 *   `{ error: 'User account is banned' }`
 *   `{ error: 'Invalid or expired token' }`
 */
export async function authMiddleware(c: Context, next: Next) {
  const token = extractToken(c);

  if (!token) {
    log.debug({}, 'authMiddleware no token found in Authorization header');
    return unauthorized(c, 'Missing or invalid authentication');
  }

  try {
    const payload = await verifyJwt(token);
    if (!payload.sub || payload.type !== 'access') {
      log.warn(
        { hasSub: !!payload.sub, type: payload.type },
        'authMiddleware invalid token payload',
      );
      return unauthorized(c, 'Invalid token payload');
    }

    const result = await db.select().from(users)
      .where(and(eq(users.id, payload.sub), isNull(users.deletedAt)))
      .limit(1);
    const user = result[0];

    if (!user) {
      log.warn({ userId: payload.sub }, 'authMiddleware user not found for valid token');
      return unauthorized(c, 'User not found');
    }
    if (user.isBanned) {
      const userId = user.id;
      log.warn({ userId }, 'authMiddleware access denied: user is banned');
      return unauthorized(c, 'User account is banned');
    }

    const userId = user.id;
    c.set('userId', userId);
    c.set('user', user);
    log.debug({ userId }, 'authMiddleware authentication successful');
    await next();
  } catch (err) {
    log.error({ err }, 'authMiddleware token verification failed');
    return unauthorized(c, 'Invalid or expired token');
  }
}

/**
 * Optional authentication middleware — best-effort auth, never blocks.
 *
 * **Token sources** (checked in order):
 *   1. Cookie `brewform_access_token`
 *   2. Header `Authorization: Bearer <token>`
 *
 * **Side effects**:
 *   - On success: `c.set('userId', user.id)`, `c.set('user', user)`
 *   - On failure / missing token / banned user: `c.set('userId', null)`,
 *     `c.set('user', null)`
 *
 * Always calls `await next()` — downstream handlers should check whether
 * `c.get('userId')` is null to determine if a user is authenticated.
 */
export async function optionalAuthMiddleware(c: Context, next: Next) {
  const token = extractToken(c);

  if (!token) {
    log.debug({}, 'optionalAuthMiddleware no auth token supplied (proceeding unauthenticated)');
    c.set('userId', null);
    c.set('user', null);
    await next();
    return;
  }

  try {
    const payload = await verifyJwt(token);
    if (payload.sub && payload.type === 'access') {
      log.debug({ userId: payload.sub }, 'optionalAuthMiddleware authenticated user');
      const result = await db.select().from(users)
        .where(and(eq(users.id, payload.sub), isNull(users.deletedAt)))
        .limit(1);
      const user = result[0];
      if (user && !user.isBanned) {
        c.set('userId', user.id);
        c.set('user', user);
      } else {
        c.set('userId', null);
        c.set('user', null);
      }
    } else {
      log.debug({}, 'optionalAuthMiddleware invalid token payload (proceeding unauthenticated)');
      c.set('userId', null);
      c.set('user', null);
    }
  } catch {
    log.debug({}, 'optionalAuthMiddleware token verification failed (proceeding unauthenticated)');
    c.set('userId', null);
    c.set('user', null);
  }
  await next();
}

/**
 * Admin-only guard middleware. Must be registered **after** `authMiddleware`.
 *
 * Reads `c.get('user')` (set by `authMiddleware`) and checks `.isAdmin`.
 * Returns `403 Forbidden` with `{ error: 'Admin access required' }` if the
 * user is missing or not an admin.
 */
export async function adminMiddleware(c: Context, next: Next) {
  const user = c.get('user') as { isAdmin: boolean } | null;
  const userId = c.get('userId') as string | null;
  const role = user?.isAdmin ? 'admin' : 'user';

  if (!user || !user.isAdmin) {
    log.warn({ userId, role }, 'adminMiddleware access denied: non-admin user');
    return forbidden(c, 'Admin access required');
  }

  log.debug({ userId }, 'adminMiddleware admin access granted');
  await next();
}
