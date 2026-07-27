import '../../test-setup.ts';
import { afterAll, beforeAll, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import auth from './index.ts';
import { reloadConfig } from '../../config/env.ts';
import { db } from '@brewform/db';
import {
  emailVerificationTokens,
  passwordResets,
  userPreferences,
  users,
} from '@brewform/db/schema';
import { eq, inArray } from 'drizzle-orm';
import * as model from './model.ts';
import { signAccessToken, signRefreshToken } from './jwt.ts';

function createTestApp() {
  const app = new Hono();
  app.route('/auth', auth);
  return app;
}

describe('Auth Routes', { sanitizeOps: false, sanitizeResources: false }, () => {
  describe('GET /auth/registration-status', () => {
    it('should return enabled status', async () => {
      const app = createTestApp();
      const res = await app.request('/auth/registration-status');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.enabled).toBe(true);
    });
  });

  describe('POST /auth/login with rememberMe', () => {
    it('should accept rememberMe as optional boolean in request body', async () => {
      const app = createTestApp();
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          rememberMe: true,
        }),
      });
      // Schema passes (not 400), service call may fail with different status
      expect(res.status).not.toBe(400);
    });

    it('should accept request without rememberMe field', async () => {
      const app = createTestApp();
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      });
      // Schema passes (not 400), service call may fail with different status
      expect(res.status).not.toBe(400);
    });

    it('should return 400 when rememberMe is not a boolean', async () => {
      const app = createTestApp();
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          rememberMe: 'yes',
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/refresh with rememberMe', () => {
    it('should accept rememberMe in refresh request body', async () => {
      const app = createTestApp();
      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: 'some-fake-token',
          rememberMe: true,
        }),
      });
      expect(res.status).toBe(401);
    });

    it('should accept refresh request without rememberMe', async () => {
      const app = createTestApp();
      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: 'some-fake-token',
        }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/register', () => {
    it('should return 400 for invalid body', async () => {
      const app = createTestApp();
      const res = await app.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });
      expect(res.status).toBe(400);
    });

    it('should return 403 when registration is disabled', async () => {
      const original = Deno.env.get('ENABLE_REGISTRATION');
      try {
        Deno.env.set('ENABLE_REGISTRATION', 'false');
        reloadConfig();

        const app = createTestApp();
        const res = await app.request('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'newuser@test.com',
            username: 'newuser',
            password: 'Test12345!',
          }),
        });
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('REGISTRATION_DISABLED');
      } finally {
        if (original === undefined) {
          Deno.env.delete('ENABLE_REGISTRATION');
        } else {
          Deno.env.set('ENABLE_REGISTRATION', original);
        }
        reloadConfig();
      }
    });
  });
});

/**
 * DB-backed route tests covering the auth route error/success branches.
 *
 * Each request carries a unique `x-forwarded-for` so the per-IP auth rate
 * limiter never collides across tests. `APP_ENV` is forced to `test` so
 * outbound email is a no-op (see `email.ts`), keeping the reset/verification
 * routes deterministic.
 */
describe('Auth Routes — DB integration', { sanitizeOps: false, sanitizeResources: false }, () => {
  const createdUsers: string[] = [];
  let originalAppEnv: string | undefined;

  async function makeUser(prefix: string, password = 'TestPassword1!') {
    const id = crypto.randomUUID();
    const user = await model.createUser({
      email: `${prefix}-${id}@example.com`,
      username: `${prefix}-${id.slice(0, 8)}`,
      password,
    });
    createdUsers.push(user.id);
    return { user, password };
  }

  /** POST JSON with a unique rate-limit bucket key. */
  function postJson(app: Hono, path: string, body: unknown, headers: Record<string, string> = {}) {
    return app.request(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': `test-${crypto.randomUUID()}`,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  beforeAll(() => {
    originalAppEnv = Deno.env.get('APP_ENV');
    Deno.env.set('APP_ENV', 'test');
    reloadConfig();
  });

  afterAll(async () => {
    if (originalAppEnv === undefined) {
      Deno.env.delete('APP_ENV');
    } else {
      Deno.env.set('APP_ENV', originalAppEnv);
    }
    reloadConfig();

    if (createdUsers.length) {
      await db.delete(passwordResets).where(inArray(passwordResets.userId, createdUsers));
      await db.delete(emailVerificationTokens).where(
        inArray(emailVerificationTokens.userId, createdUsers),
      );
      await db.delete(userPreferences).where(inArray(userPreferences.userId, createdUsers));
      await db.delete(users).where(inArray(users.id, createdUsers));
    }
  });

  describe('POST /auth/register', () => {
    it('should return 201 and a sanitized user on success', async () => {
      const app = createTestApp();
      const id = crypto.randomUUID();
      const res = await postJson(app, '/auth/register', {
        email: `route-reg-${id}@example.com`,
        username: `route-reg-${id.slice(0, 8)}`,
        password: 'Test12345!',
      });
      const body = await res.json();
      createdUsers.push(body.data.user.id);

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe(`route-reg-${id}@example.com`);
      expect(body.data.user.passwordHash).toBeUndefined();
    });

    it('should return 409 when the email already exists', async () => {
      const { user } = await makeUser('route-reg-email');
      const app = createTestApp();
      const res = await postJson(app, '/auth/register', {
        email: user.email,
        username: `fresh-${crypto.randomUUID().slice(0, 8)}`,
        password: 'Test12345!',
      });
      const body = await res.json();
      expect(res.status).toBe(409);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('CONFLICT');
    });

    it('should return 409 when the username already exists', async () => {
      const { user } = await makeUser('route-reg-user');
      const app = createTestApp();
      const res = await postJson(app, '/auth/register', {
        email: `fresh-${crypto.randomUUID()}@example.com`,
        username: user.username,
        password: 'Test12345!',
      });
      const body = await res.json();
      expect(res.status).toBe(409);
      expect(body.error.code).toBe('CONFLICT');
    });
  });

  describe('POST /auth/login', () => {
    it('should return 200 and a sanitized user on valid credentials', async () => {
      const { user, password } = await makeUser('route-login-ok');
      const app = createTestApp();
      const res = await postJson(app, '/auth/login', { email: user.email, password });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.user.id).toBe(user.id);
      expect(body.data.user.passwordHash).toBeUndefined();
    });

    it('should return 401 for invalid credentials', async () => {
      const app = createTestApp();
      const res = await postJson(app, '/auth/login', {
        email: 'ghost@nowhere.example.com',
        password: 'whatever',
      });
      const body = await res.json();
      expect(res.status).toBe(401);
      expect(body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should return 403 for a banned account', async () => {
      const { user, password } = await makeUser('route-login-ban');
      await db.update(users).set({ isBanned: true }).where(eq(users.id, user.id));
      const app = createTestApp();
      const res = await postJson(app, '/auth/login', { email: user.email, password });
      const body = await res.json();
      expect(res.status).toBe(403);
      expect(body.error.code).toBe('USER_BANNED');
    });
  });

  describe('POST /auth/refresh', () => {
    it('should return 200 and fresh tokens for a valid refresh token', async () => {
      const { user } = await makeUser('route-refresh-ok');
      const refreshToken = await signRefreshToken(user.id);
      const app = createTestApp();
      const res = await postJson(app, '/auth/refresh', { refreshToken });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.user.id).toBe(user.id);
    });

    it('should return 401 when no refresh token is provided', async () => {
      const app = createTestApp();
      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'x-forwarded-for': `test-${crypto.randomUUID()}` },
      });
      const body = await res.json();
      expect(res.status).toBe(401);
      expect(body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should return 200 for a registered email', async () => {
      const { user } = await makeUser('route-forgot');
      const app = createTestApp();
      const res = await postJson(app, '/auth/forgot-password', { email: user.email });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('should return 200 for an unknown email (no enumeration)', async () => {
      const app = createTestApp();
      const res = await postJson(app, '/auth/forgot-password', {
        email: 'ghost@nowhere.example.com',
      });
      expect(res.status).toBe(200);
    });

    it('should return 400 for an invalid email', async () => {
      const app = createTestApp();
      const res = await postJson(app, '/auth/forgot-password', { email: 'not-an-email' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('should return 200 and update the password for a valid token', async () => {
      const { user } = await makeUser('route-reset-ok');
      const token = crypto.randomUUID();
      await model.createPasswordReset(user.id, token, new Date(Date.now() + 3600 * 1000));
      const app = createTestApp();
      const res = await postJson(app, '/auth/reset-password', {
        token,
        newPassword: 'NewPassword1!',
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('should return 400 INVALID_TOKEN for an unknown token', async () => {
      const app = createTestApp();
      const res = await postJson(app, '/auth/reset-password', {
        token: 'no-such-token',
        newPassword: 'NewPassword1!',
      });
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error.code).toBe('INVALID_TOKEN');
    });

    it('should return 400 TOKEN_USED for a consumed token', async () => {
      const { user } = await makeUser('route-reset-used');
      const token = crypto.randomUUID();
      const reset = await model.createPasswordReset(
        user.id,
        token,
        new Date(Date.now() + 3600 * 1000),
      );
      await model.markPasswordResetUsed(reset.id);
      const app = createTestApp();
      const res = await postJson(app, '/auth/reset-password', {
        token,
        newPassword: 'NewPassword1!',
      });
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error.code).toBe('TOKEN_USED');
    });

    it('should return 400 TOKEN_EXPIRED for an expired token', async () => {
      const { user } = await makeUser('route-reset-exp');
      const token = crypto.randomUUID();
      await model.createPasswordReset(user.id, token, new Date(Date.now() - 1000));
      const app = createTestApp();
      const res = await postJson(app, '/auth/reset-password', {
        token,
        newPassword: 'NewPassword1!',
      });
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('POST /auth/verify-email', () => {
    it('should return 200 for a valid token', async () => {
      const { user } = await makeUser('route-verify-ok');
      const rawToken = crypto.randomUUID();
      await model.createEmailVerificationToken(
        user.id,
        rawToken,
        new Date(Date.now() + 3600 * 1000),
      );
      const app = createTestApp();
      const res = await postJson(app, '/auth/verify-email', { token: rawToken });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('should return 400 INVALID_TOKEN for an unknown token', async () => {
      const app = createTestApp();
      const res = await postJson(app, '/auth/verify-email', { token: 'no-such-token' });
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error.code).toBe('INVALID_TOKEN');
    });

    it('should return 400 TOKEN_USED for a consumed token', async () => {
      const { user } = await makeUser('route-verify-used');
      const rawToken = crypto.randomUUID();
      const created = await model.createEmailVerificationToken(
        user.id,
        rawToken,
        new Date(Date.now() + 3600 * 1000),
      );
      await model.markEmailVerified(user.id, created.id);
      const app = createTestApp();
      const res = await postJson(app, '/auth/verify-email', { token: rawToken });
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error.code).toBe('TOKEN_USED');
    });

    it('should return 400 TOKEN_EXPIRED for an expired token', async () => {
      const { user } = await makeUser('route-verify-exp');
      const rawToken = crypto.randomUUID();
      await model.createEmailVerificationToken(user.id, rawToken, new Date(Date.now() - 1000));
      const app = createTestApp();
      const res = await postJson(app, '/auth/verify-email', { token: rawToken });
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('should return 400 when the token is empty', async () => {
      const app = createTestApp();
      const res = await postJson(app, '/auth/verify-email', { token: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/logout', () => {
    it('should return 200 and clear cookies', async () => {
      const app = createTestApp();
      const res = await postJson(app, '/auth/logout', {});
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  describe('POST /auth/send-verification', () => {
    it('should return 401 when unauthenticated', async () => {
      const app = createTestApp();
      const res = await postJson(app, '/auth/send-verification', {});
      expect(res.status).toBe(401);
    });

    it('should report already-verified for a verified user', async () => {
      const { user } = await makeUser('route-send-verified');
      await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
      const accessToken = await signAccessToken({
        id: user.id,
        email: user.email,
        username: user.username,
        isAdmin: false,
      });
      const app = createTestApp();
      const res = await postJson(app, '/auth/send-verification', {}, {
        Authorization: `Bearer ${accessToken}`,
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.message).toBe('Email is already verified');
    });

    it('should send a verification email for an unverified user', async () => {
      const { user } = await makeUser('route-send-unverified');
      const accessToken = await signAccessToken({
        id: user.id,
        email: user.email,
        username: user.username,
        isAdmin: false,
      });
      const app = createTestApp();
      const res = await postJson(app, '/auth/send-verification', {}, {
        Authorization: `Bearer ${accessToken}`,
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.message).toBe('Verification email sent');
    });
  });

  describe('GET /auth/registration-status (disabled)', () => {
    it('should report disabled when registration is turned off', async () => {
      const original = Deno.env.get('ENABLE_REGISTRATION');
      try {
        Deno.env.set('ENABLE_REGISTRATION', 'false');
        reloadConfig();
        const app = createTestApp();
        const res = await app.request('/auth/registration-status');
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.data.enabled).toBe(false);
      } finally {
        if (original === undefined) {
          Deno.env.delete('ENABLE_REGISTRATION');
        } else {
          Deno.env.set('ENABLE_REGISTRATION', original);
        }
        reloadConfig();
      }
    });
  });
});
