import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifyJwt } from '../modules/auth/jwt.ts';
import { db } from '@brewform/db';
import { users } from '@brewform/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { forbidden, unauthorized } from '../utils/response/index.ts';

function extractAccessToken(c: Context): string | undefined {
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return getCookie(c, 'brewform_access_token');
}

export async function authMiddleware(c: Context, next: Next) {
  const token = extractAccessToken(c);

  if (!token) {
    return unauthorized(c, 'Missing or invalid Authorization header');
  }

  try {
    const payload = await verifyJwt(token);
    if (!payload.sub || payload.type !== 'access') {
      return unauthorized(c, 'Invalid token payload');
    }

    const result = await db.select().from(users)
      .where(and(eq(users.id, payload.sub), isNull(users.deletedAt)))
      .limit(1);
    const user = result[0];

    if (!user) {
      return unauthorized(c, 'User not found');
    }
    if (user.isBanned) {
      return unauthorized(c, 'User account is banned');
    }

    c.set('userId', user.id);
    c.set('user', user);
    await next();
  } catch {
    return unauthorized(c, 'Invalid or expired token');
  }
}

export async function optionalAuthMiddleware(c: Context, next: Next) {
  const token = extractAccessToken(c);

  if (!token) {
    c.set('userId', null);
    c.set('user', null);
    await next();
    return;
  }

  try {
    const payload = await verifyJwt(token);
    if (payload.sub && payload.type === 'access') {
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
      c.set('userId', null);
      c.set('user', null);
    }
  } catch {
    c.set('userId', null);
    c.set('user', null);
  }
  await next();
}

export async function adminMiddleware(c: Context, next: Next) {
  const user = c.get('user') as { isAdmin: boolean } | null;
  if (!user || !user.isAdmin) {
    return forbidden(c, 'Admin access required');
  }
  await next();
}
