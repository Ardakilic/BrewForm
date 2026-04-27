import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { signAccessToken, signRefreshToken, verifyJwt, decodeJwt } from './jwt.ts';

describe('JWT Module', () => {
  describe('signAccessToken', () => {
    it('should sign and verify an access token', async () => {
      const payload = { id: 'user-123', email: 'test@test.com', username: 'testuser', isAdmin: false };
      const token = await signAccessToken(payload);
      const decoded = await verifyJwt(token);
      expect(decoded.sub).toBe('user-123');
      expect(decoded.email).toBe('test@test.com');
      expect(decoded.type).toBe('access');
    });

    it('should include isAdmin flag', async () => {
      const payload = { id: 'admin-1', email: 'admin@test.com', username: 'admin', isAdmin: true };
      const token = await signAccessToken(payload);
      const decoded = await verifyJwt(token);
      expect(decoded.isAdmin).toBe(true);
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
      }
    });

    it('should reject a token signed with wrong secret', async () => {
      const { sign } = await import('hono/jwt');
      const token = await sign({ sub: 'test', type: 'access' }, 'wrong-secret');
      try {
        await verifyJwt(token);
        expect(true).toBe(false);
      } catch {
      }
    });
  });

  describe('decodeJwt', () => {
    it('should decode a token without verification', async () => {
      const token = await signAccessToken({ id: 'user-1', email: 'test@test.com', username: 'test', isAdmin: false });
      const decoded = decodeJwt(token);
      expect(decoded).not.toBeNull();
      expect(decoded!.payload.sub).toBe('user-1');
    });

    it('should return null for invalid token', () => {
      const decoded = decodeJwt('not.a.valid-token');
      expect(decoded).toBeNull();
    });
  });

  describe('Token type differentiation', () => {
    it('should distinguish access and refresh tokens', async () => {
      const accessToken = await signAccessToken({ id: '1', email: 'a@b.com', username: 'u', isAdmin: false });
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