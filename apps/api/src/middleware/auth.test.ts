/**
 * Auth Middleware Tests
 */

import { beforeEach, describe, it } from '@std/testing';
import { expect } from '@std/expect';
import { spy, type Stub, stub } from '@std/testing/mock';
import { Hono } from 'hono';
import { authMiddleware, optionalAuth, requireAdmin, requireAuth } from './_impl/auth.ts';
import { createMockPrisma } from '../test/setup.ts';
import * as databaseMock from '../test/mocks/database.ts';
import authUtilsMock from '../test/mocks/auth-utils.ts';
import * as loggerMock from '../test/mocks/logger.ts';

describe('Auth Middleware', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let verifyTokenStub: Stub | undefined;
  let logSecurityCallsBefore: number;
  let loggerErrorCallsBefore: number;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    databaseMock.setPrisma(mockPrisma);
    logSecurityCallsBefore = loggerMock.logSecurity.calls.length;
    loggerErrorCallsBefore = loggerMock.getLogger().error.calls.length;
    if (verifyTokenStub) {
      verifyTokenStub.restore();
      verifyTokenStub = undefined;
    }
  });

  describe('authMiddleware', () => {
    it('should set user to null when no Authorization header is provided', async () => {
      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ user: c.get('user') }));

      const response = await app.request('/test');
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.user).toBeNull();
    });

    it('should set user to null when Authorization header does not start with Bearer', async () => {
      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ user: c.get('user') }));

      const response = await app.request('/test', {
        headers: { Authorization: 'Basic abc123' },
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.user).toBeNull();
    });

    it('should set user to null when token verification fails', async () => {
      verifyTokenStub = stub(
        authUtilsMock,
        'verifyAccessToken',
        // @ts-expect-error - Mock returns null but type expects non-null
        () => Promise.resolve(null),
      );

      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ user: c.get('user') }));

      const response = await app.request('/test', {
        headers: { Authorization: 'Bearer invalid_token' },
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.user).toBeNull();
    });

    it('should set user to null when user is not found in database', async () => {
      verifyTokenStub = stub(
        authUtilsMock,
        'verifyAccessToken',
        () => Promise.resolve({ userId: 'user_123', sessionId: 'session_123' }),
      );
      mockPrisma.user.findUnique = spy(() => Promise.resolve(null));

      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ user: c.get('user') }));

      const response = await app.request('/test', {
        headers: { Authorization: 'Bearer valid_token' },
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.user).toBeNull();
    });

    it('should set user to null when user is deleted', async () => {
      verifyTokenStub = stub(
        authUtilsMock,
        'verifyAccessToken',
        () => Promise.resolve({ userId: 'user_123', sessionId: 'session_123' }),
      );
      mockPrisma.user.findUnique = spy(() =>
        Promise.resolve({
          id: 'user_123',
          email: 'test@example.com',
          username: 'testuser',
          isAdmin: false,
          isBanned: false,
          deletedAt: new Date(),
        })
      );

      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ user: c.get('user') }));

      const response = await app.request('/test', {
        headers: { Authorization: 'Bearer valid_token' },
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.user).toBeNull();
    });

    it('should set user to null and log security event when user is banned', async () => {
      verifyTokenStub = stub(
        authUtilsMock,
        'verifyAccessToken',
        () => Promise.resolve({ userId: 'user_123', sessionId: 'session_123' }),
      );
      mockPrisma.user.findUnique = spy(() =>
        Promise.resolve({
          id: 'user_123',
          email: 'banned@example.com',
          username: 'banneduser',
          isAdmin: false,
          isBanned: true,
          deletedAt: null,
        })
      );

      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ user: c.get('user') }));

      const response = await app.request('/test', {
        headers: { Authorization: 'Bearer valid_token' },
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.user).toBeNull();

      const logSecurityCalls = loggerMock.logSecurity.calls.slice(
        logSecurityCallsBefore,
      );
      expect(logSecurityCalls.length).toBe(1);
      expect(logSecurityCalls[0].args[0]).toBe('banned_user_access_attempt');
      expect(logSecurityCalls[0].args[1]).toEqual({
        userId: 'user_123',
        email: 'banned@example.com',
      });
    });

    it('should set user context when token is valid and user exists', async () => {
      verifyTokenStub = stub(
        authUtilsMock,
        'verifyAccessToken',
        () => Promise.resolve({ userId: 'user_123', sessionId: 'session_123' }),
      );
      mockPrisma.user.findUnique = spy(() =>
        Promise.resolve({
          id: 'user_123',
          email: 'valid@example.com',
          username: 'validuser',
          isAdmin: false,
          isBanned: false,
          deletedAt: null,
        })
      );

      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ user: c.get('user') }));

      const response = await app.request('/test', {
        headers: { Authorization: 'Bearer valid_token' },
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.user).toEqual({
        id: 'user_123',
        email: 'valid@example.com',
        username: 'validuser',
        isAdmin: false,
        isBanned: false,
      });
    });

    it('should catch and log errors during token verification', async () => {
      verifyTokenStub = stub(
        authUtilsMock,
        'verifyAccessToken',
        () => Promise.reject(new Error('Token verification failed')),
      );

      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ user: c.get('user') }));

      const response = await app.request('/test', {
        headers: { Authorization: 'Bearer error_token' },
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.user).toBeNull();

      const loggerErrorCalls = loggerMock.getLogger().error.calls.slice(
        loggerErrorCallsBefore,
      );
      expect(loggerErrorCalls.length).toBeGreaterThan(0);
    });
  });

  describe('requireAuth', () => {
    it('should return 401 when user is not authenticated', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('user', null);
        await next();
      });
      app.use('*', requireAuth);
      app.get('/test', (c) => c.json({ success: true }));

      const response = await app.request('/test');
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Authentication required');
    });

    it('should proceed to next middleware when user is authenticated', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('user', {
          id: 'user_123',
          email: 'test@example.com',
          username: 'testuser',
          isAdmin: false,
          isBanned: false,
        });
        await next();
      });
      app.use('*', requireAuth);
      app.get(
        '/test',
        (c) => c.json({ success: true, userId: c.get('user')?.id }),
      );

      const response = await app.request('/test');
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.userId).toBe('user_123');
    });
  });

  describe('requireAdmin', () => {
    it('should return 401 when user is not authenticated', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('user', null);
        await next();
      });
      app.use('*', requireAdmin);
      app.get('/test', (c) => c.json({ success: true }));

      const response = await app.request('/test');
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Authentication required');
    });

    it('should return 403 when user is not an admin', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('user', {
          id: 'user_123',
          email: 'user@example.com',
          username: 'regularuser',
          isAdmin: false,
          isBanned: false,
        });
        await next();
      });
      app.use('*', requireAdmin);
      app.get('/test', (c) => c.json({ success: true }));

      const response = await app.request('/test');
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toBe('Admin access required');
    });

    it('should proceed to next middleware when user is an admin', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('user', {
          id: 'admin_123',
          email: 'admin@example.com',
          username: 'adminuser',
          isAdmin: true,
          isBanned: false,
        });
        await next();
      });
      app.use('*', requireAdmin);
      app.get(
        '/test',
        (c) => c.json({ success: true, userId: c.get('user')?.id }),
      );

      const response = await app.request('/test');
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.userId).toBe('admin_123');
    });
  });

  describe('optionalAuth', () => {
    it('should be the same as authMiddleware', () => {
      expect(optionalAuth).toBe(authMiddleware);
    });
  });
});
