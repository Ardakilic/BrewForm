import '../../test-setup.ts';
import { db } from '@brewform/db';
import {
  emailVerificationTokens,
  passwordResets,
  userPreferences,
  users,
} from '@brewform/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadConfig } from '../../config/env.ts';
import { errorHandler, log as errorHandlerLog } from '../../middleware/errorHandler.ts';
import auth, { log as authRouteLog } from './index.ts';
import { signAccessToken, signRefreshToken } from './jwt.ts';
import * as model from './model.ts';
import { logger as authServiceLog } from './service.ts';

function createTestApp() {
  const app = new Hono();
  app.route('/auth', auth);
  return app;
}

describe('Auth Routes', () => {
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
      const original = process.env.ENABLE_REGISTRATION;
      try {
        process.env.ENABLE_REGISTRATION = 'false';
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
          delete process.env.ENABLE_REGISTRATION;
        } else {
          process.env.ENABLE_REGISTRATION = original;
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
describe('Auth Routes — DB integration', () => {
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
    originalAppEnv = process.env.APP_ENV;
    process.env.APP_ENV = 'test';
    reloadConfig();
  });

  afterAll(async () => {
    if (originalAppEnv === undefined) {
      delete process.env.APP_ENV;
    } else {
      process.env.APP_ENV = originalAppEnv;
    }
    reloadConfig();

    if (createdUsers.length) {
      await db.delete(passwordResets).where(inArray(passwordResets.userId, createdUsers));
      await db
        .delete(emailVerificationTokens)
        .where(inArray(emailVerificationTokens.userId, createdUsers));
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
      const res = await postJson(
        app,
        '/auth/send-verification',
        {},
        {
          Authorization: `Bearer ${accessToken}`,
        },
      );
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
      const res = await postJson(
        app,
        '/auth/send-verification',
        {},
        {
          Authorization: `Bearer ${accessToken}`,
        },
      );
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.message).toBe('Verification email sent');
    });
  });

  describe('GET /auth/registration-status (disabled)', () => {
    it('should report disabled when registration is turned off', async () => {
      const original = process.env.ENABLE_REGISTRATION;
      try {
        process.env.ENABLE_REGISTRATION = 'false';
        reloadConfig();
        const app = createTestApp();
        const res = await app.request('/auth/registration-status');
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.data.enabled).toBe(false);
      } finally {
        if (original === undefined) {
          delete process.env.ENABLE_REGISTRATION;
        } else {
          process.env.ENABLE_REGISTRATION = original;
        }
        reloadConfig();
      }
    });
  });
});

/**
 * Registration conflicts that slip past the availability pre-checks (spec:
 * error-handling, "Known race and conflict paths never return 500"). The app
 * mounts the production `errorHandler`, and every logger on the path plus
 * `console.error` is captured so the tests can prove that no log line carries
 * the submitted email, username or a bcrypt hash.
 */
describe('Auth Routes — registration conflicts (DB integration)', () => {
  const createdUsers: string[] = [];
  let originalAppEnv: string | undefined;
  let logSpies: Array<ReturnType<typeof vi.spyOn>>;

  /** Auth router behind the production error handler. */
  function createAppWithErrorHandler() {
    const app = new Hono();
    app.onError(errorHandler);
    app.route('/auth', auth);
    return app;
  }

  /** POST a registration with its own rate-limit bucket. */
  function register(app: Hono, body: { email: string; username: string; password: string }) {
    return app.request('/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': `test-${crypto.randomUUID()}`,
      },
      body: JSON.stringify(body),
    });
  }

  /** Every argument passed to a captured logger or `console.error`, as one string. */
  function capturedLogText() {
    const seen = new Set<unknown>();
    const flatten = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      if (typeof value !== 'object' && typeof value !== 'function') return String(value);
      if (seen.has(value)) return '';
      seen.add(value);
      return Object.getOwnPropertyNames(value)
        .map((key) => `${key} ${flatten((value as Record<string, unknown>)[key])}`)
        .join(' ');
    };
    return logSpies
      .flatMap((spy) => spy.mock.calls)
      .map((call) => flatten(call))
      .join('\n');
  }

  /** Assert no captured log line contains the identifiers or a bcrypt hash. */
  function expectNoPiiInLogs(...values: string[]) {
    const text = capturedLogText();
    for (const value of values) expect(text).not.toContain(value);
    expect(text).not.toMatch(/\$2[ab]\$/);
  }

  /** Track created users from 201 responses for cleanup. */
  async function trackCreated(res: Response) {
    if (res.status !== 201) return;
    const body = await res.clone().json();
    createdUsers.push(body.data.user.id);
  }

  beforeAll(() => {
    originalAppEnv = process.env.APP_ENV;
    process.env.APP_ENV = 'test';
    reloadConfig();
  });

  afterAll(async () => {
    if (originalAppEnv === undefined) {
      delete process.env.APP_ENV;
    } else {
      process.env.APP_ENV = originalAppEnv;
    }
    reloadConfig();
    if (createdUsers.length) {
      await db
        .delete(emailVerificationTokens)
        .where(inArray(emailVerificationTokens.userId, createdUsers));
      await db.delete(userPreferences).where(inArray(userPreferences.userId, createdUsers));
      await db.delete(users).where(inArray(users.id, createdUsers));
    }
  });

  beforeEach(() => {
    logSpies = [errorHandlerLog, authRouteLog, authServiceLog].flatMap((logger) => [
      vi.spyOn(logger, 'debug'),
      vi.spyOn(logger, 'info'),
      vi.spyOn(logger, 'warn'),
      vi.spyOn(logger, 'error'),
    ]);
    // Hono's default handler and stray debugging both go through console.error.
    logSpies.push(vi.spyOn(console, 'error').mockImplementation(() => {}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should answer re-registration with a soft-deleted account email with 409 Email already registered', async () => {
    const id = crypto.randomUUID();
    const deleted = await model.createUser({
      email: `soft-deleted-${id}@example.com`,
      username: `soft-del-${id.slice(0, 8)}`,
      password: 'TestPassword1!',
    });
    createdUsers.push(deleted.id);
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, deleted.id));

    const app = createAppWithErrorHandler();
    const username = `re-reg-${id.slice(0, 8)}`;
    const res = await register(app, {
      email: deleted.email,
      username,
      password: 'Test12345!',
    });
    await trackCreated(res);
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toBe('Email already registered');
    expectNoPiiInLogs(deleted.email, username);
  });

  it('should answer two concurrent registrations with the same new email with one 201 and one 409, logging no PII', async () => {
    const id = crypto.randomUUID();
    const email = `race-email-${id}@example.com`;
    const usernames = [`race-e1-${id.slice(0, 8)}`, `race-e2-${id.slice(0, 8)}`];
    const app = createAppWithErrorHandler();

    const responses = await Promise.all(
      usernames.map((username) => register(app, { email, username, password: 'Test12345!' })),
    );
    for (const res of responses) await trackCreated(res);

    const statuses = responses.map((res) => res.status).sort();
    expect(statuses).toEqual([201, 409]);
    const loser = responses.find((res) => res.status === 409) as Response;
    const body = await loser.json();
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toBe('Email already registered');
    expectNoPiiInLogs(email, ...usernames);
  });

  it('should answer two concurrent registrations with the same username with one 201 and one 409', async () => {
    const id = crypto.randomUUID();
    const username = `race-u-${id.slice(0, 8)}`;
    const emails = [`race-u1-${id}@example.com`, `race-u2-${id}@example.com`];
    const app = createAppWithErrorHandler();

    const responses = await Promise.all(
      emails.map((email) => register(app, { email, username, password: 'Test12345!' })),
    );
    for (const res of responses) await trackCreated(res);

    const statuses = responses.map((res) => res.status).sort();
    expect(statuses).toEqual([201, 409]);
    const loser = responses.find((res) => res.status === 409) as Response;
    const body = await loser.json();
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toBe('Username already taken');
    expectNoPiiInLogs(username, ...emails);
  });
});
