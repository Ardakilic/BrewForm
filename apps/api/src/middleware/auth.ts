import type { Context, Next } from 'hono';
import { verifyJwt } from '../modules/auth/jwt.ts';
import { prisma } from '@brewform/db';
import { unauthorized, forbidden } from '../utils/response/index.ts';

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized(c, 'Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyJwt(token);
    if (!payload.sub || payload.type !== 'access') {
      return unauthorized(c, 'Invalid token payload');
    }

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
    });

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
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    c.set('userId', null);
    c.set('user', null);
    await next();
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyJwt(token);
    if (payload.sub && payload.type === 'access') {
      const user = await prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null },
      });
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