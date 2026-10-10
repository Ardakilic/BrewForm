import '../test-setup.ts';
import { db } from '@brewform/db';
import { users } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken, signRefreshToken } from '../modules/auth/jwt.ts';
import { adminMiddleware, authMiddleware, log, optionalAuthMiddleware } from './auth.ts';

describe('Auth Middleware', () => {
  let createdUserIds: string[] = [];

  function setupSpies() {
    return {
      debug: vi.spyOn(log, 'debug'),
      warn: vi.spyOn(log, 'warn'),
      error: vi.spyOn(log, 'error'),
    };
  }

  function restoreSpies(spies: ReturnType<typeof setupSpies>) {
    spies.debug.mockRestore();
    spies.warn.mockRestore();
    spies.error.mockRestore();
  }

  async function createUser(options: { isAdmin?: boolean; isBanned?: boolean } = {}) {
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      email: `auth-test-${id}@example.com`,
      username: `auth-test-${id}`,
      passwordHash: 'hash',
      isAdmin: options.isAdmin ?? false,
      isBanned: options.isBanned ?? false,
    });
    createdUserIds.push(id);
    return id;
  }

  function makeToken(userId: string, isAdmin = false) {
    return signAccessToken({
      id: userId,
      email: `auth-test-${userId}@example.com`,
      username: `auth-test-${userId}`,
      isAdmin,
    });
  }

  beforeEach(() => {
    createdUserIds = [];
  });

  afterEach(async () => {
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
  });

  describe('authMiddleware', () => {
    function buildApp() {
      const app = new Hono<{ Variables: { userId: string; user: unknown } }>();
      app.use('/auth', authMiddleware);
      app.get('/auth', (c) => c.json({ userId: c.get('userId') }));
      return app;
    }

    it('missing token logs debug and returns 401', async () => {
      const spies = setupSpies();
      try {
        const res = await buildApp().request('/auth');
        const body = await res.json();

        expect(res.status).toBe(401);
        expect(body.success).toBe(false);
        expect(spies.debug).toHaveBeenCalledTimes(1);
        expect(spies.debug).toHaveBeenNthCalledWith(
          1,
          {},
          'authMiddleware no token found in Authorization header',
        );
        expect(spies.error).toHaveBeenCalledTimes(0);
        expect(spies.warn).toHaveBeenCalledTimes(0);
      } finally {
        restoreSpies(spies);
      }
    });

    it('invalid token logs error and returns 401', async () => {
      const spies = setupSpies();
      try {
        const res = await buildApp().request('/auth', {
          headers: { Authorization: 'Bearer invalid-token' },
        });

        expect(res.status).toBe(401);
        expect(spies.error).toHaveBeenCalledTimes(1);
        expect(spies.error.mock.calls[0][0].err).toBeInstanceOf(Error);
        expect(spies.error.mock.calls[0][1]).toContain('token verification failed');
      } finally {
        restoreSpies(spies);
      }
    });

    it('refresh token used as access token logs warn and returns 401', async () => {
      const userId = crypto.randomUUID();
      const refreshToken = await signRefreshToken(userId);
      const spies = setupSpies();
      try {
        const res = await buildApp().request('/auth', {
          headers: { Authorization: `Bearer ${refreshToken}` },
        });

        expect(res.status).toBe(401);
        expect(spies.warn).toHaveBeenCalledTimes(1);
        const warnArg = spies.warn.mock.calls[0][0] as { hasSub: boolean; type: string };
        expect(warnArg.hasSub).toBe(true);
        expect(warnArg.type).toBe('refresh');
        expect(spies.warn.mock.calls[0][1]).toBe('authMiddleware invalid token payload');
      } finally {
        restoreSpies(spies);
      }
    });

    it('valid token for missing user logs warn and returns 401', async () => {
      const missingUserId = crypto.randomUUID();
      const token = await makeToken(missingUserId);
      const spies = setupSpies();
      try {
        const res = await buildApp().request('/auth', {
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(res.status).toBe(401);
        expect(spies.warn).toHaveBeenCalledTimes(1);
        expect(spies.warn).toHaveBeenNthCalledWith(
          1,
          { userId: missingUserId },
          'authMiddleware user not found for valid token',
        );
      } finally {
        restoreSpies(spies);
      }
    });

    it('banned user logs warn and returns 401', async () => {
      const userId = await createUser({ isBanned: true });
      const token = await makeToken(userId);
      const spies = setupSpies();
      try {
        const res = await buildApp().request('/auth', {
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(res.status).toBe(401);
        expect(spies.warn).toHaveBeenCalledTimes(1);
        expect(spies.warn).toHaveBeenNthCalledWith(
          1,
          { userId },
          'authMiddleware access denied: user is banned',
        );
      } finally {
        restoreSpies(spies);
      }
    });

    it('valid user logs debug and calls next', async () => {
      const userId = await createUser();
      const token = await makeToken(userId);
      const spies = setupSpies();
      try {
        const res = await buildApp().request('/auth', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.userId).toBe(userId);
        expect(spies.debug).toHaveBeenCalledTimes(1);
        expect(spies.debug).toHaveBeenNthCalledWith(
          1,
          { userId },
          'authMiddleware authentication successful',
        );
      } finally {
        restoreSpies(spies);
      }
    });
  });

  describe('optionalAuthMiddleware', () => {
    function buildApp() {
      const app = new Hono<{ Variables: { userId: string | null; user: unknown } }>();
      app.use('/optional', optionalAuthMiddleware);
      app.get('/optional', (c) => c.json({ userId: c.get('userId') }));
      return app;
    }

    it('no token logs debug only and proceeds unauthenticated', async () => {
      const spies = setupSpies();
      try {
        const res = await buildApp().request('/optional');
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.userId).toBeNull();
        expect(spies.debug).toHaveBeenCalledTimes(1);
        expect(spies.debug).toHaveBeenNthCalledWith(
          1,
          {},
          'optionalAuthMiddleware no auth token supplied (proceeding unauthenticated)',
        );
        expect(spies.error).toHaveBeenCalledTimes(0);
        expect(spies.warn).toHaveBeenCalledTimes(0);
      } finally {
        restoreSpies(spies);
      }
    });

    it('valid token logs debug and sets context', async () => {
      const userId = await createUser();
      const token = await makeToken(userId);
      const spies = setupSpies();
      try {
        const res = await buildApp().request('/optional', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.userId).toBe(userId);
        expect(spies.debug).toHaveBeenCalledTimes(1);
        expect(spies.debug).toHaveBeenNthCalledWith(
          1,
          { userId },
          'optionalAuthMiddleware authenticated user',
        );
      } finally {
        restoreSpies(spies);
      }
    });

    it('invalid token logs debug only and proceeds unauthenticated', async () => {
      const spies = setupSpies();
      try {
        const res = await buildApp().request('/optional', {
          headers: { Authorization: 'Bearer invalid-token' },
        });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.userId).toBeNull();
        expect(spies.debug).toHaveBeenCalledTimes(1);
        expect(spies.debug).toHaveBeenNthCalledWith(
          1,
          {},
          'optionalAuthMiddleware token verification failed (proceeding unauthenticated)',
        );
        expect(spies.error).toHaveBeenCalledTimes(0);
        expect(spies.warn).toHaveBeenCalledTimes(0);
      } finally {
        restoreSpies(spies);
      }
    });
  });

  describe('adminMiddleware', () => {
    function buildApp() {
      const app = new Hono<{ Variables: { userId: string; user: unknown } }>();
      app.use('/admin', authMiddleware, adminMiddleware);
      app.get('/admin', (c) => c.text('admin'));
      return app;
    }

    it('non-admin user logs warn and returns 403', async () => {
      const userId = await createUser();
      const token = await makeToken(userId);
      const spies = setupSpies();
      try {
        const res = await buildApp().request('/admin', {
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(res.status).toBe(403);
        expect(spies.warn).toHaveBeenCalledTimes(1);
        expect(spies.warn).toHaveBeenNthCalledWith(
          1,
          { userId, role: 'user' },
          'adminMiddleware access denied: non-admin user',
        );
      } finally {
        restoreSpies(spies);
      }
    });

    it('admin user logs debug and calls next', async () => {
      const userId = await createUser({ isAdmin: true });
      const token = await makeToken(userId, true);
      const spies = setupSpies();
      try {
        const res = await buildApp().request('/admin', {
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(res.status).toBe(200);
        expect(spies.debug).toHaveBeenCalledTimes(2);
        expect(spies.debug).toHaveBeenNthCalledWith(
          2,
          { userId },
          'adminMiddleware admin access granted',
        );
      } finally {
        restoreSpies(spies);
      }
    });
  });
});
