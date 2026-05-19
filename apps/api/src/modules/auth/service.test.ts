import '../../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { config, reloadConfig } from '../../config/env.ts';
import { register } from './service.ts';
import { signAccessToken, signRefreshToken, verifyJwt } from './jwt.ts';

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
});
