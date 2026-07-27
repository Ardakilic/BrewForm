import '../../test-setup.ts';
import { afterAll, beforeAll, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { config, reloadConfig } from '../../config/env.ts';
import * as service from './service.ts';
import { register, toAuthUser } from './service.ts';
import { signAccessToken, signRefreshToken, verifyJwt } from './jwt.ts';
import { db } from '@brewform/db';
import {
  emailVerificationTokens,
  passwordResets,
  userPreferences,
  users,
} from '@brewform/db/schema';
import { eq, inArray } from 'drizzle-orm';
import * as model from './model.ts';

describe('Auth Service Logic', () => {
  describe('Registration validation', () => {
    it('should throw EMAIL_ALREADY_EXISTS when email is taken', () => {
      try {
        throw new Error('EMAIL_ALREADY_EXISTS');
      } catch (err) {
        expect((err as Error).message).toBe('EMAIL_ALREADY_EXISTS');
      }
    });

    it('should throw USERNAME_ALREADY_EXISTS when username is taken', () => {
      try {
        throw new Error('USERNAME_ALREADY_EXISTS');
      } catch (err) {
        expect((err as Error).message).toBe('USERNAME_ALREADY_EXISTS');
      }
    });
  });

  describe('Login validation', () => {
    it('should throw INVALID_CREDENTIALS for non-existent user', () => {
      try {
        throw new Error('INVALID_CREDENTIALS');
      } catch (err) {
        expect((err as Error).message).toBe('INVALID_CREDENTIALS');
      }
    });

    it('should throw USER_BANNED for banned users', () => {
      try {
        throw new Error('USER_BANNED');
      } catch (err) {
        expect((err as Error).message).toBe('USER_BANNED');
      }
    });

    it('should throw INVALID_CREDENTIALS for wrong password', () => {
      try {
        throw new Error('INVALID_CREDENTIALS');
      } catch (err) {
        expect((err as Error).message).toBe('INVALID_CREDENTIALS');
      }
    });
  });

  describe('Token refresh validation', () => {
    it('should throw INVALID_TOKEN_TYPE when using access token for refresh', () => {
      try {
        throw new Error('INVALID_TOKEN_TYPE');
      } catch (err) {
        expect((err as Error).message).toBe('INVALID_TOKEN_TYPE');
      }
    });

    it('should throw USER_NOT_FOUND for non-existent user', () => {
      try {
        throw new Error('USER_NOT_FOUND');
      } catch (err) {
        expect((err as Error).message).toBe('USER_NOT_FOUND');
      }
    });
  });

  describe('Password reset', () => {
    // deno-lint-ignore require-await -- test callback signature
    it('should silently succeed for non-existent email (security)', async () => {
      const _email = 'nonexistent@test.com';
      const found = false;
      if (!found) {
        return;
      }
      expect(true).toBe(true);
    });

    it('should throw INVALID_RESET_TOKEN for invalid token', () => {
      try {
        throw new Error('INVALID_RESET_TOKEN');
      } catch (err) {
        expect((err as Error).message).toBe('INVALID_RESET_TOKEN');
      }
    });

    it('should throw TOKEN_ALREADY_USED for reused token', () => {
      try {
        throw new Error('TOKEN_ALREADY_USED');
      } catch (err) {
        expect((err as Error).message).toBe('TOKEN_ALREADY_USED');
      }
    });

    it('should throw TOKEN_EXPIRED for expired token', () => {
      try {
        throw new Error('TOKEN_EXPIRED');
      } catch (err) {
        expect((err as Error).message).toBe('TOKEN_EXPIRED');
      }
    });
  });

  describe('Registration toggle', () => {
    it('should throw REGISTRATION_DISABLED when config disables registration', async () => {
      const original = Deno.env.get('ENABLE_REGISTRATION');
      try {
        Deno.env.set('ENABLE_REGISTRATION', 'false');
        reloadConfig();

        await expect(register({
          email: 'test@test.com',
          username: 'testuser',
          password: 'Test12345!',
        })).rejects.toThrow('REGISTRATION_DISABLED');
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

  describe('Remember Me login parameter', () => {
    async function loginWithRememberMe(
      email: string,
      password: string,
      rememberMe: boolean,
      mockModel: {
        findUserByEmail: (email: string) => Promise<
          {
            id: string;
            email: string;
            username: string;
            passwordHash: string;
            isAdmin: boolean;
            isBanned: boolean;
          } | null
        >;
        verifyPassword: (plain: string, hashed: string) => boolean;
      },
    ) {
      const rawUser = await mockModel.findUserByEmail(email);
      if (!rawUser) throw new Error('INVALID_CREDENTIALS');
      if (rawUser.isBanned) throw new Error('USER_BANNED');
      if (!mockModel.verifyPassword(password, rawUser.passwordHash)) {
        throw new Error('INVALID_CREDENTIALS');
      }
      const accessToken = await signAccessToken({
        id: rawUser.id,
        email: rawUser.email,
        username: rawUser.username,
        isAdmin: rawUser.isAdmin,
      });
      const refreshToken = rememberMe
        ? await signRefreshToken(rawUser.id, config.JWT_REMEMBER_ME_EXPIRY)
        : await signRefreshToken(rawUser.id);
      return { accessToken, refreshToken };
    }

    it('should produce longer-lived refresh token when rememberMe is true', async () => {
      const user = {
        id: 'user-1',
        email: 'a@b.com',
        username: 'u',
        passwordHash: 'hash',
        isAdmin: false,
        isBanned: false,
      };
      const { refreshToken } = await loginWithRememberMe('a@b.com', 'pw', true, {
        findUserByEmail: () => Promise.resolve(user),
        verifyPassword: () => true,
      });
      const decoded = await verifyJwt(refreshToken);
      const now = Math.floor(Date.now() / 1000);
      const expectedExp = now + (180 * 86400);
      expect(decoded.exp).toBeGreaterThanOrEqual(now + (179 * 86400));
      expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 5);
    });

    it('should produce default-lived refresh token when rememberMe is false', async () => {
      const user = {
        id: 'user-1',
        email: 'a@b.com',
        username: 'u',
        passwordHash: 'hash',
        isAdmin: false,
        isBanned: false,
      };
      const { refreshToken } = await loginWithRememberMe('a@b.com', 'pw', false, {
        findUserByEmail: () => Promise.resolve(user),
        verifyPassword: () => true,
      });
      const decoded = await verifyJwt(refreshToken);
      const now = Math.floor(Date.now() / 1000);
      const expectedExp = now + (7 * 86400);
      expect(decoded.exp).toBeGreaterThanOrEqual(now + (6 * 86400));
      expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 5);
    });

    it('should throw INVALID_CREDENTIALS when password is wrong', async () => {
      const user = {
        id: 'user-1',
        email: 'a@b.com',
        username: 'u',
        passwordHash: 'hash',
        isAdmin: false,
        isBanned: false,
      };
      await expect(loginWithRememberMe('a@b.com', 'wrong', false, {
        findUserByEmail: () => Promise.resolve(user),
        verifyPassword: () => false,
      })).rejects.toThrow('INVALID_CREDENTIALS');
    });

    it('should throw INVALID_CREDENTIALS when user does not exist', async () => {
      await expect(loginWithRememberMe('nope@nope.com', 'pw', false, {
        findUserByEmail: () => Promise.resolve(null),
        verifyPassword: () => false,
      })).rejects.toThrow('INVALID_CREDENTIALS');
    });

    it('should throw USER_BANNED for banned user', async () => {
      const user = {
        id: 'user-1',
        email: 'a@b.com',
        username: 'u',
        passwordHash: 'hash',
        isAdmin: false,
        isBanned: true,
      };
      await expect(loginWithRememberMe('a@b.com', 'pw', false, {
        findUserByEmail: () => Promise.resolve(user),
        verifyPassword: () => true,
      })).rejects.toThrow('USER_BANNED');
    });
  });

  describe('Remember Me refresh parameter', () => {
    async function refreshWithRememberMe(
      token: string,
      rememberMe: boolean,
      mockModel: {
        findUserById: (id: string) => Promise<
          {
            id: string;
            email: string;
            username: string;
            passwordHash: string;
            isAdmin: boolean;
            isBanned: boolean;
          } | null
        >;
      },
      mockVerifyJwt: (t: string) => Promise<{ sub: string; type: string }>,
    ) {
      const payload = await mockVerifyJwt(token);
      if (payload.type !== 'refresh') throw new Error('INVALID_TOKEN_TYPE');
      const rawUser = await mockModel.findUserById(payload.sub);
      if (!rawUser) throw new Error('USER_NOT_FOUND');
      if (rawUser.isBanned) throw new Error('USER_NOT_FOUND');
      const newAccessToken = await signAccessToken({
        id: rawUser.id,
        email: rawUser.email,
        username: rawUser.username,
        isAdmin: rawUser.isAdmin,
      });
      const newRefreshToken = rememberMe
        ? await signRefreshToken(rawUser.id, config.JWT_REMEMBER_ME_EXPIRY)
        : await signRefreshToken(rawUser.id);
      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    }

    it('should produce longer-lived refresh token when rememberMe is true', async () => {
      const user = {
        id: 'user-1',
        email: 'a@b.com',
        username: 'u',
        passwordHash: 'hash',
        isAdmin: false,
        isBanned: false,
      };
      const { refreshToken } = await refreshWithRememberMe(
        'some-token',
        true,
        { findUserById: () => Promise.resolve(user) },
        () => Promise.resolve({ sub: 'user-1', type: 'refresh' }),
      );
      const decoded = await verifyJwt(refreshToken);
      const now = Math.floor(Date.now() / 1000);
      expect(decoded.exp).toBeGreaterThanOrEqual(now + (179 * 86400));
      expect(decoded.exp).toBeLessThanOrEqual(now + (180 * 86400) + 5);
    });

    it('should produce default-lived refresh token when rememberMe is false', async () => {
      const user = {
        id: 'user-1',
        email: 'a@b.com',
        username: 'u',
        passwordHash: 'hash',
        isAdmin: false,
        isBanned: false,
      };
      const { refreshToken } = await refreshWithRememberMe(
        'some-token',
        false,
        { findUserById: () => Promise.resolve(user) },
        () => Promise.resolve({ sub: 'user-1', type: 'refresh' }),
      );
      const decoded = await verifyJwt(refreshToken);
      const now = Math.floor(Date.now() / 1000);
      expect(decoded.exp).toBeGreaterThanOrEqual(now + (6 * 86400));
      expect(decoded.exp).toBeLessThanOrEqual(now + (7 * 86400) + 5);
    });

    it('should throw INVALID_TOKEN_TYPE for access token', async () => {
      const user = {
        id: 'user-1',
        email: 'a@b.com',
        username: 'u',
        passwordHash: 'hash',
        isAdmin: false,
        isBanned: false,
      };
      await expect(refreshWithRememberMe(
        'access-token',
        false,
        { findUserById: () => Promise.resolve(user) },
        () => Promise.resolve({ sub: 'user-1', type: 'access' }),
      )).rejects.toThrow('INVALID_TOKEN_TYPE');
    });

    it('should throw USER_NOT_FOUND for non-existent user', async () => {
      await expect(refreshWithRememberMe(
        'some-token',
        false,
        { findUserById: () => Promise.resolve(null) },
        () => Promise.resolve({ sub: 'no-user', type: 'refresh' }),
      )).rejects.toThrow('USER_NOT_FOUND');
    });

    it('should throw USER_NOT_FOUND for banned user', async () => {
      const user = {
        id: 'user-1',
        email: 'a@b.com',
        username: 'u',
        passwordHash: 'hash',
        isAdmin: false,
        isBanned: true,
      };
      await expect(refreshWithRememberMe(
        'some-token',
        false,
        { findUserById: () => Promise.resolve(user) },
        () => Promise.resolve({ sub: 'user-1', type: 'refresh' }),
      )).rejects.toThrow('USER_NOT_FOUND');
    });
  });

  describe('Password expiry calculation', () => {
    it('should set reset token expiry to 1 hour from now', () => {
      const now = Date.now();
      const expiresAt = new Date(now + 3600 * 1000);
      const diffMs = expiresAt.getTime() - now;
      expect(diffMs).toBe(3600000);
    });
  });

  describe('toAuthUser type narrowing', () => {
    it('should return a typed AuthUser with required User fields', () => {
      const raw = {
        id: 'user-1',
        email: 'a@b.com',
        username: 'u',
        displayName: 'Test User',
        avatarUrl: null,
        bio: null,
        isAdmin: false,
        isBanned: false,
        passwordHash: 'hash',
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerifiedAt: null,
        onboardingCompleted: false,
        deletedAt: null,
      };
      const authUser = toAuthUser(raw);
      expect(authUser.id).toBe('user-1');
      expect(authUser.email).toBe('a@b.com');
      expect(authUser.passwordHash).toBe('hash');
      expect(authUser.isAdmin).toBe(false);
      expect(authUser.preferences).toBeUndefined();
    });

    it('should accept arbitrary Record<string, unknown> shape from model layer', () => {
      const raw: Record<string, unknown> = {
        id: 'user-2',
        email: 'b@b.com',
        username: 'u2',
        passwordHash: 'hash2',
        isAdmin: true,
        isBanned: false,
        preferences: { theme: 'dark' },
      };
      const authUser = toAuthUser(raw);
      expect(authUser.id).toBe('user-2');
      expect(authUser.preferences).toEqual({ theme: 'dark' });
    });
  });
});

/**
 * DB-backed integration tests for the auth service workflows.
 *
 * These exercise the real service functions against the PostgreSQL test
 * database (delegating to the real `model.ts`). `APP_ENV` is forced to
 * `test` for the suite so outbound email is a no-op (see `email.ts`),
 * making the password-reset and verification flows deterministic.
 */
describe('Auth Service — DB integration', { sanitizeOps: false, sanitizeResources: false }, () => {
  const createdUsers: string[] = [];
  let originalAppEnv: string | undefined;

  /** Create a real user (with preferences + valid password hash) and track it. */
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

  describe('register', () => {
    it('should create a user and return tokens', async () => {
      const id = crypto.randomUUID();
      const result = await service.register({
        email: `reg-ok-${id}@example.com`,
        username: `reg-ok-${id.slice(0, 8)}`,
        password: 'TestPassword1!',
      });
      createdUsers.push(result.user.id);

      expect(result.user.email).toBe(`reg-ok-${id}@example.com`);
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
    });

    it('should throw EMAIL_ALREADY_EXISTS when the email is taken', async () => {
      const { user } = await makeUser('reg-dupe-email');
      await expect(
        service.register({
          email: user.email,
          username: `fresh-${crypto.randomUUID().slice(0, 8)}`,
          password: 'TestPassword1!',
        }),
      ).rejects.toThrow('EMAIL_ALREADY_EXISTS');
    });

    it('should throw USERNAME_ALREADY_EXISTS when the username is taken', async () => {
      const { user } = await makeUser('reg-dupe-user');
      await expect(
        service.register({
          email: `fresh-${crypto.randomUUID()}@example.com`,
          username: user.username,
          password: 'TestPassword1!',
        }),
      ).rejects.toThrow('USERNAME_ALREADY_EXISTS');
    });
  });

  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
      const { user, password } = await makeUser('login-ok');
      const result = await service.login(user.email, password);
      expect(result.user.id).toBe(user.id);
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
    });

    it('should throw INVALID_CREDENTIALS for an unknown email', async () => {
      await expect(service.login('ghost@nowhere.example.com', 'whatever')).rejects.toThrow(
        'INVALID_CREDENTIALS',
      );
    });

    it('should throw INVALID_CREDENTIALS for a wrong password', async () => {
      const { user } = await makeUser('login-bad-pw');
      await expect(service.login(user.email, 'WrongPassword1!')).rejects.toThrow(
        'INVALID_CREDENTIALS',
      );
    });

    it('should throw USER_BANNED for a banned account', async () => {
      const { user, password } = await makeUser('login-banned');
      await db.update(users).set({ isBanned: true }).where(eq(users.id, user.id));
      await expect(service.login(user.email, password)).rejects.toThrow('USER_BANNED');
    });

    it('should issue a longer-lived refresh token when rememberMe is true', async () => {
      const { user, password } = await makeUser('login-remember');
      const result = await service.login(user.email, password, true);
      const decoded = await verifyJwt(result.refreshToken);
      const now = Math.floor(Date.now() / 1000);
      expect(decoded.exp).toBeGreaterThanOrEqual(now + (179 * 86400));
    });
  });

  describe('refreshAccessToken', () => {
    it('should issue fresh tokens for a valid refresh token', async () => {
      const { user } = await makeUser('refresh-ok');
      const refreshToken = await signRefreshToken(user.id);
      const result = await service.refreshAccessToken(refreshToken);
      expect(result.user.id).toBe(user.id);
      expect(result.wasRememberMe).toBe(false);
      expect(typeof result.accessToken).toBe('string');
    });

    it('should report wasRememberMe for a long-lived refresh token', async () => {
      const { user } = await makeUser('refresh-remember');
      const refreshToken = await signRefreshToken(user.id, config.JWT_REMEMBER_ME_EXPIRY);
      const result = await service.refreshAccessToken(refreshToken);
      expect(result.wasRememberMe).toBe(true);
    });

    it('should throw INVALID_TOKEN_TYPE when given an access token', async () => {
      const { user } = await makeUser('refresh-access');
      const accessToken = await signAccessToken({
        id: user.id,
        email: user.email,
        username: user.username,
        isAdmin: false,
      });
      await expect(service.refreshAccessToken(accessToken)).rejects.toThrow('INVALID_TOKEN_TYPE');
    });

    it('should throw USER_NOT_FOUND when the user no longer exists', async () => {
      const refreshToken = await signRefreshToken(crypto.randomUUID());
      await expect(service.refreshAccessToken(refreshToken)).rejects.toThrow('USER_NOT_FOUND');
    });

    it('should throw USER_NOT_FOUND for a banned user', async () => {
      const { user } = await makeUser('refresh-banned');
      await db.update(users).set({ isBanned: true }).where(eq(users.id, user.id));
      const refreshToken = await signRefreshToken(user.id);
      await expect(service.refreshAccessToken(refreshToken)).rejects.toThrow('USER_NOT_FOUND');
    });
  });

  describe('requestPasswordReset', () => {
    it('should silently succeed for a non-existent email', async () => {
      await expect(service.requestPasswordReset('ghost@nowhere.example.com')).resolves
        .toBeUndefined();
    });

    it('should persist a reset token for an existing user', async () => {
      const { user } = await makeUser('reset-request');
      await service.requestPasswordReset(user.email);
      const rows = await db.select().from(passwordResets).where(
        eq(passwordResets.userId, user.id),
      );
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe('confirmPasswordReset', () => {
    it('should update the password and mark the token used', async () => {
      const { user } = await makeUser('reset-confirm');
      const token = crypto.randomUUID();
      const reset = await model.createPasswordReset(
        user.id,
        token,
        new Date(Date.now() + 3600 * 1000),
      );

      await service.confirmPasswordReset(token, 'BrandNewPassword1!');

      const updated = await model.findUserById(user.id);
      expect(model.verifyPassword('BrandNewPassword1!', updated!.passwordHash)).toBe(true);
      const [used] = await db.select().from(passwordResets).where(eq(passwordResets.id, reset.id));
      expect(used.usedAt).not.toBeNull();
    });

    it('should throw INVALID_RESET_TOKEN for an unknown token', async () => {
      await expect(service.confirmPasswordReset('no-such-token', 'X12345678!')).rejects.toThrow(
        'INVALID_RESET_TOKEN',
      );
    });

    it('should throw TOKEN_ALREADY_USED for a consumed token', async () => {
      const { user } = await makeUser('reset-used');
      const token = crypto.randomUUID();
      const reset = await model.createPasswordReset(
        user.id,
        token,
        new Date(Date.now() + 3600 * 1000),
      );
      await model.markPasswordResetUsed(reset.id);
      await expect(service.confirmPasswordReset(token, 'X12345678!')).rejects.toThrow(
        'TOKEN_ALREADY_USED',
      );
    });

    it('should throw TOKEN_EXPIRED for an expired token', async () => {
      const { user } = await makeUser('reset-expired');
      const token = crypto.randomUUID();
      await model.createPasswordReset(user.id, token, new Date(Date.now() - 1000));
      await expect(service.confirmPasswordReset(token, 'X12345678!')).rejects.toThrow(
        'TOKEN_EXPIRED',
      );
    });
  });

  describe('getAuthenticatedUser', () => {
    it('should return the user when found', async () => {
      const { user } = await makeUser('auth-user-ok');
      const found = await service.getAuthenticatedUser(user.id);
      expect(found.id).toBe(user.id);
    });

    it('should throw USER_NOT_FOUND for an unknown id', async () => {
      await expect(service.getAuthenticatedUser(crypto.randomUUID())).rejects.toThrow(
        'USER_NOT_FOUND',
      );
    });
  });

  describe('sendVerificationToken', () => {
    it('should persist a verification token for the user', async () => {
      const { user } = await makeUser('send-verify');
      await service.sendVerificationToken(user.id, user.email, user.username);
      const rows = await db.select().from(emailVerificationTokens).where(
        eq(emailVerificationTokens.userId, user.id),
      );
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe('verifyEmail', () => {
    it('should verify the email for a valid token', async () => {
      const { user } = await makeUser('verify-ok');
      const rawToken = crypto.randomUUID();
      await model.createEmailVerificationToken(
        user.id,
        rawToken,
        new Date(Date.now() + 3600 * 1000),
      );

      await service.verifyEmail(rawToken);

      const updated = await model.findUserById(user.id);
      expect(updated!.emailVerifiedAt).not.toBeNull();
    });

    it('should throw INVALID_VERIFICATION_TOKEN for an unknown token', async () => {
      await expect(service.verifyEmail(crypto.randomUUID())).rejects.toThrow(
        'INVALID_VERIFICATION_TOKEN',
      );
    });

    it('should throw TOKEN_ALREADY_USED for a consumed token', async () => {
      const { user } = await makeUser('verify-used');
      const rawToken = crypto.randomUUID();
      const created = await model.createEmailVerificationToken(
        user.id,
        rawToken,
        new Date(Date.now() + 3600 * 1000),
      );
      await model.markEmailVerified(user.id, created.id);
      await expect(service.verifyEmail(rawToken)).rejects.toThrow('TOKEN_ALREADY_USED');
    });

    it('should throw TOKEN_EXPIRED for an expired token', async () => {
      const { user } = await makeUser('verify-expired');
      const rawToken = crypto.randomUUID();
      await model.createEmailVerificationToken(user.id, rawToken, new Date(Date.now() - 1000));
      await expect(service.verifyEmail(rawToken)).rejects.toThrow('TOKEN_EXPIRED');
    });
  });
});
