/**
 * BrewForm Authentication Middleware
 * Handles JWT token verification and user context
 */

import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';
import { verifyAccessToken, } from '../utils/auth/index.js';
import { getPrisma } from '../utils/database/index.js';
import { getLogger, logSecurity } from '../utils/logger/index.js';

// ============================================
// Types
// ============================================

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  isAdmin: boolean;
  isBanned: boolean;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser | null;
    requestId: string;
  }
}

// ============================================
// Middleware
// ============================================

/**
 * Extract bearer token from authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Authentication middleware - sets user context if valid token
 * Does NOT require authentication - use requireAuth for protected routes
 */
export const authMiddleware = createMiddleware(async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    c.set('user', null);
    return next();
  }

  try {
    const payload = await verifyAccessToken(token);
    
    if (!payload) {
      c.set('user', null);
      return next();
    }

    // Fetch user from database to ensure they still exist and aren't banned
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        username: true,
        isAdmin: true,
        isBanned: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt) {
      c.set('user', null);
      return next();
    }

    if (user.isBanned) {
      logSecurity('banned_user_access_attempt', {
        userId: user.id,
        email: user.email,
      });
      c.set('user', null);
      return next();
    }

    c.set('user', {
      id: user.id,
      email: user.email,
      username: user.username,
      isAdmin: user.isAdmin,
      isBanned: user.isBanned,
    });
  } catch (error) {
    getLogger().error({
      type: 'auth',
      operation: 'verify',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    c.set('user', null);
  }

  return next();
});

/**
 * Require authentication middleware
 * Returns 401 if user is not authenticated
 */
export const requireAuth = createMiddleware(async (c: Context, next: Next) => {
  const user = c.get('user');

  if (!user) {
    return c.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      },
      401
    );
  }

  return next();
});

/**
 * Require admin middleware
 * Returns 403 if user is not an admin
 */
export const requireAdmin = createMiddleware(async (c: Context, next: Next) => {
  const user = c.get('user');

  if (!user) {
    return c.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      },
      401
    );
  }

  if (!user.isAdmin) {
    logSecurity('admin_access_denied', {
      userId: user.id,
      path: c.req.path,
    });
    
    return c.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
      },
      403
    );
  }

  return next();
});

/**
 * Optional auth middleware - same as authMiddleware but explicit about optionality
 */
export const optionalAuth = authMiddleware;

export default {
  auth: authMiddleware,
  requireAuth,
  requireAdmin,
  optionalAuth,
};
