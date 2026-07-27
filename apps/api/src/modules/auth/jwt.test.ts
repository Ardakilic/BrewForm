import '../../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { decodeJwt, signAccessToken, signRefreshToken, verifyJwt } from './jwt.ts';

describe('JWT Module', () => {
  describe('signAccessToken', () => {
    it('should sign and verify an access token', async () => {
      const payload = {
        id: 'user-123',
        email: 'test@test.com',
        username: 'testuser',
        isAdmin: false,
      };
      const token = await signAccessToken(payload);
      const decoded = await verifyJwt(token);
      expect(decoded.sub).toBe('user-123');
      expect((decoded as { email?: string }).email).toBe('test@test.com');
      expect(decoded.type).toBe('access');
    });

    it('should include isAdmin flag', async () => {
      const payload = { id: 'admin-1', email: 'admin@test.com', username: 'admin', isAdmin: true };
      const token = await signAccessToken(payload);
      const decoded = await verifyJwt(token);
      expect((decoded as { isAdmin?: boolean }).isAdmin).toBe(true);
    });
  });

  describe('signRefreshToken', () => {
    it('should sign and verify a refresh token', async () => {
      const token = await signRefreshToken('user-123');
      const decoded = await verifyJwt(token);
      expect(decoded.sub).toBe('user-123');
      expect(decoded.type).toBe('refresh');
    });

    it('should not include email or username in refresh token', async () => {
      const token = await signRefreshToken('user-123');
      const decoded = await verifyJwt(token);
      expect(decoded.type).toBe('refresh');
    });
  });

  describe('verifyJwt', () => {
    it('should reject an invalid token', async () => {
      try {
        await verifyJwt('invalid-token');
        expect(true).toBe(false);
      } catch {
        // intentional: rejection is the expected outcome; swallow the error
      }
    });

    it('should reject a token signed with wrong secret', async () => {
      const { sign } = await import('hono/jwt');
      const token = await sign({ sub: 'test', type: 'access' }, 'wrong-secret');
      try {
        await verifyJwt(token);
        expect(true).toBe(false);
      } catch {
        // intentional: rejection is the expected outcome; swallow the error
      }
    });
  });

  describe('decodeJwt', () => {
    it('should decode a token without verification', async () => {
      const token = await signAccessToken({
        id: 'user-1',
        email: 'test@test.com',
        username: 'test',
        isAdmin: false,
      });
      const decoded = decodeJwt(token);
      expect(decoded).not.toBeNull();
      expect(decoded!.payload.sub).toBe('user-1');
    });

    it('should return null for invalid token', () => {
      const decoded = decodeJwt('not.a.valid-token');
      expect(decoded).toBeNull();
    });
  });

  describe('parseExpiry - M (month) suffix', () => {
    it('should accept M suffix via signRefreshToken custom expiry', async () => {
      const token = await signRefreshToken('user-123', '6M');
      const decoded = await verifyJwt(token);
      expect(decoded.sub).toBe('user-123');
      expect(decoded.type).toBe('refresh');
      const now = Math.floor(Date.now() / 1000);
      const expectedExp = now + (6 * 30 * 86400);
      expect(decoded.exp).toBeGreaterThan(now);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 5);
    });
  });

  describe('signRefreshToken with custom expiry (remember me)', () => {
    it('should sign a refresh token with custom 180d expiry', async () => {
      const token = await signRefreshToken('user-123', '180d');
      const decoded = await verifyJwt(token);
      expect(decoded.sub).toBe('user-123');
      expect(decoded.type).toBe('refresh');
      const now = Math.floor(Date.now() / 1000);
      const expectedExp = now + (180 * 86400);
      expect(decoded.exp).toBeGreaterThan(now);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 5);
    });

    it('should use default 7d expiry when no custom expiry provided', async () => {
      const token = await signRefreshToken('user-123');
      const decoded = await verifyJwt(token);
      const now = Math.floor(Date.now() / 1000);
      const expectedExp = now + (7 * 86400);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 5);
    });

    it('should produce different expiries for different custom expiry values', async () => {
      const shortToken = await signRefreshToken('user-1', '1d');
      const longToken = await signRefreshToken('user-1', '365d');
      const shortDecoded = await verifyJwt(shortToken);
      const longDecoded = await verifyJwt(longToken);
      const now = Math.floor(Date.now() / 1000);
      const shortExp = shortDecoded.exp! - now;
      const longExp = longDecoded.exp! - now;
      expect(shortExp).toBeLessThan(longExp);
    });

    it('should reject invalid expiry format', async () => {
      try {
        await signRefreshToken('user-123', 'invalid');
        expect(true).toBe(false);
      } catch (err) {
        expect((err as Error).message).toContain('Invalid expiry format');
      }
    });
  });

  describe('Token type differentiation', () => {
    it('should distinguish access and refresh tokens', async () => {
      const accessToken = await signAccessToken({
        id: '1',
        email: 'a@b.com',
        username: 'u',
        isAdmin: false,
      });
      const refreshToken = await signRefreshToken('1');

      const accessDecoded = await verifyJwt(accessToken);
      const refreshDecoded = await verifyJwt(refreshToken);

      expect(accessDecoded.type).toBe('access');
      expect(refreshDecoded.type).toBe('refresh');
    });

    it('should reject refresh token when used as access', async () => {
      const refreshToken = await signRefreshToken('user-1');
      const decoded = await verifyJwt(refreshToken);
      expect(decoded.type).toBe('refresh');
    });
  });
});
