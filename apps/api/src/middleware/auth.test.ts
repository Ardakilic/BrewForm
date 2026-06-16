import '../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { assertSpyCallArgs, assertSpyCalls, spy } from 'jsr:@std/testing/mock';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '@brewform/db';
import { users } from '@brewform/db/schema';
import { signAccessToken, signRefreshToken } from '../modules/auth/jwt.ts';
import { adminMiddleware, authMiddleware, log, optionalAuthMiddleware } from './auth.ts';

describe('Auth Middleware', { sanitizeOps: false, sanitizeResources: false }, () => {
  let createdUserIds: string[] = [];

  function setupSpies() {
    return {
      debug: spy(log, 'debug'),
      warn: spy(log, 'warn'),
      error: spy(log, 'error'),
    };
  }

  function restoreSpies(spies: ReturnType<typeof setupSpies>) {
    spies.debug.restore();
    spies.warn.restore();
    spies.error.restore();
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
        assertSpyCalls(spies.debug, 1);
        assertSpyCallArgs(spies.debug, 0, [
          {},
          'authMiddleware no token found in Authorization header',
        ]);
        assertSpyCalls(spies.error, 0);
        assertSpyCalls(spies.warn, 0);
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
        assertSpyCalls(spies.error, 1);
        expect(spies.error.calls[0].args[0].err).toBeInstanceOf(Error);
        expect(spies.error.calls[0].args[1]).toContain('token verification failed');
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
        assertSpyCalls(spies.warn, 1);
        const warnArg = spies.warn.calls[0].args[0] as { hasSub: boolean; type: string };
        expect(warnArg.hasSub).toBe(true);
        expect(warnArg.type).toBe('refresh');
        expect(spies.warn.calls[0].args[1]).toBe('authMiddleware invalid token payload');
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
        assertSpyCalls(spies.warn, 1);
        assertSpyCallArgs(spies.warn, 0, [
          { userId: missingUserId },
          'authMiddleware user not found for valid token',
        ]);
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
        assertSpyCalls(spies.warn, 1);
        assertSpyCallArgs(spies.warn, 0, [
          { userId },
          'authMiddleware access denied: user is banned',
        ]);
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
        assertSpyCalls(spies.debug, 1);
        assertSpyCallArgs(spies.debug, 0, [
          { userId },
          'authMiddleware authentication successful',
        ]);
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
        assertSpyCalls(spies.debug, 1);
        assertSpyCallArgs(spies.debug, 0, [
          {},
          'optionalAuthMiddleware no auth token supplied (proceeding unauthenticated)',
        ]);
        assertSpyCalls(spies.error, 0);
        assertSpyCalls(spies.warn, 0);
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
        assertSpyCalls(spies.debug, 1);
        assertSpyCallArgs(spies.debug, 0, [
          { userId },
          'optionalAuthMiddleware authenticated user',
        ]);
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
        assertSpyCalls(spies.debug, 1);
        assertSpyCallArgs(spies.debug, 0, [
          {},
          'optionalAuthMiddleware token verification failed (proceeding unauthenticated)',
        ]);
        assertSpyCalls(spies.error, 0);
        assertSpyCalls(spies.warn, 0);
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
        assertSpyCalls(spies.warn, 1);
        assertSpyCallArgs(spies.warn, 0, [
          { userId, role: 'user' },
          'adminMiddleware access denied: non-admin user',
        ]);
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
        assertSpyCalls(spies.debug, 2);
        assertSpyCallArgs(spies.debug, 1, [
          { userId },
          'adminMiddleware admin access granted',
        ]);
      } finally {
        restoreSpies(spies);
      }
    });
  });
});
