/**
 * Auth Module Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono, Context } from 'hono';
import authModule from './index.js';
import { mockPrisma } from '../../test/setup.js';

// API Response type for testing
interface ApiResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
  message?: string;
}

// Test error handler to convert errors to proper HTTP responses
const testErrorHandler = (err: Error, c: Context) => {
  if (err.name === 'NotFoundError') {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: err.message } }, 404);
  }
  if (err.name === 'BadRequestError') {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
  }
  if (err.name === 'ConflictError') {
    return c.json({ success: false, error: { code: 'CONFLICT', message: err.message } }, 409);
  }
  if (err.name === 'UnauthorizedError') {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: err.message } }, 401);
  }
  if (err.name === 'ForbiddenError') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: err.message } }, 403);
  }
  return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
};

describe('Auth Module', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/auth', authModule);
    app.onError(testErrorHandler as never);
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const mockUser = {
        id: 'user_123',
        email: 'test@example.com',
        username: 'testuser',
        displayName: 'Test User',
        emailVerified: false,
        isAdmin: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        passwordHash: 'hashed_password',
        isBanned: false,
        deletedAt: null,
      };

      // Mock the methods
      mockPrisma.user.findFirst = vi.fn().mockResolvedValue(null);
      mockPrisma.user.create = vi.fn().mockResolvedValue(mockUser);
      mockPrisma.emailVerification.create = vi.fn().mockResolvedValue({
        id: 'token_123',
        token: 'verify_token',
        userId: 'user_123',
        expiresAt: new Date(Date.now() + 86400000),
      });

      const response = await app.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          username: 'testuser',
          displayName: 'Test User',
          password: 'SecurePassword123!',
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
      expect((body.data as { user: { email: string } }).user.email).toBe('test@example.com');
    });

    it('should reject duplicate email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'existing_user',
        email: 'test@example.com',
      } as never);

      const response = await app.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          username: 'newuser',
          password: 'SecurePassword123!',
        }),
      });

      expect(response.status).toBe(409);
    });

    it('should validate password requirements', async () => {
      const response = await app.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          username: 'testuser',
          password: '123', // Too short
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const mockUser = {
        id: 'user_123',
        email: 'test@example.com',
        username: 'testuser',
        passwordHash: 'hashed_password',
        emailVerified: true,
        isAdmin: false,
        isBanned: false,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as never);
      mockPrisma.session.create.mockResolvedValue({
        id: 'session_123',
        userId: 'user_123',
        refreshToken: 'refresh_token',
        expiresAt: new Date(Date.now() + 604800000),
      } as never);

      const response = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'SecurePassword123!',
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('tokens');
      expect((body.data as { tokens: { accessToken: string } }).tokens).toHaveProperty('accessToken');
      expect((body.data as { tokens: { refreshToken: string } }).tokens).toHaveProperty('refreshToken');
    });

    it('should reject invalid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const response = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'WrongPassword',
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should reject banned users', async () => {
      const mockUser = {
        id: 'user_123',
        email: 'banned@example.com',
        passwordHash: 'hashed_password',
        isBanned: true,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as never);

      const response = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'banned@example.com',
          password: 'SecurePassword123!',
        }),
      });

      expect(response.status).toBe(401); // UnauthorizedError for banned users
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout successfully', async () => {
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 1 });

      const response = await app.request('/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_jwt_token',
        },
        body: JSON.stringify({
          refreshToken: 'valid_refresh_token',
        }),
      });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh tokens successfully', async () => {
      const mockSession = {
        id: 'session_123',
        userId: 'user_123',
        refreshToken: 'valid_refresh_token',
        expiresAt: new Date(Date.now() + 604800000),
        user: {
          id: 'user_123',
          email: 'test@example.com',
          isAdmin: false,
          isBanned: false,
        },
      };

      mockPrisma.session.findUnique.mockResolvedValue(mockSession as never);
      mockPrisma.session.update.mockResolvedValue({
        id: 'session_123',
        refreshToken: 'new_refresh_token',
      } as never);

      const response = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: 'valid_refresh_token',
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.data).toHaveProperty('accessToken');
    });

    it('should reject expired refresh token', async () => {
      const mockSession = {
        id: 'session_123',
        userId: 'user_123',
        refreshToken: 'expired_refresh_token',
        expiresAt: new Date(Date.now() - 1000), // Expired
        user: { id: 'user_123', email: 'test@example.com', isAdmin: false, isBanned: false },
      };

      mockPrisma.session.findUnique.mockResolvedValue(mockSession as never);

      const response = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: 'expired_refresh_token',
        }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should send password reset email for existing user', async () => {
      const mockUser = {
        id: 'user_123',
        email: 'test@example.com',
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as never);
      mockPrisma.passwordReset.create.mockResolvedValue({
        id: 'token_123',
        token: 'reset_token',
        userId: 'user_123',
        expiresAt: new Date(Date.now() + 3600000),
      } as never);

      const response = await app.request('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
        }),
      });

      // Should always return 200 to prevent email enumeration
      expect(response.status).toBe(200);
    });

    it('should return 200 even for non-existent email (prevent enumeration)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const response = await app.request('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
        }),
      });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('should reset password with valid token', async () => {
      const mockToken = {
        id: 'token_123',
        token: 'valid_reset_token',
        userId: 'user_123',
        expiresAt: new Date(Date.now() + 3600000),
        user: { id: 'user_123' },
      };

      mockPrisma.passwordReset.findUnique.mockResolvedValue(mockToken as never);
      mockPrisma.user.update.mockResolvedValue({ id: 'user_123' } as never);
      mockPrisma.passwordReset.update.mockResolvedValue({} as never);
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 1 });

      const response = await app.request('/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid_reset_token',
          password: 'NewSecurePassword123!',
        }),
      });

      expect(response.status).toBe(200);
    });

    it('should reject expired token', async () => {
      const mockToken = {
        id: 'token_123',
        token: 'expired_token',
        userId: 'user_123',
        expiresAt: new Date(Date.now() - 1000), // Expired
      };

      mockPrisma.passwordReset.findUnique.mockResolvedValue(mockToken as never);

      const response = await app.request('/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'expired_token',
          password: 'NewSecurePassword123!',
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /auth/verify-email', () => {
    it('should verify email with valid token', async () => {
      const mockVerification = {
        id: 'token_123',
        token: 'valid_verify_token',
        userId: 'user_123',
        expiresAt: new Date(Date.now() + 86400000),
        usedAt: null,
        user: {
          id: 'user_123',
          email: 'test@example.com',
          username: 'testuser',
        },
      };

      mockPrisma.emailVerification.findUnique.mockResolvedValue(mockVerification as never);
      mockPrisma.emailVerification.update.mockResolvedValue({} as never);
      mockPrisma.user.update.mockResolvedValue({ id: 'user_123', emailVerified: true } as never);

      const response = await app.request('/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid_verify_token',
        }),
      });

      expect(response.status).toBe(200);
    });

    it('should reject invalid token', async () => {
      mockPrisma.emailVerification.findUnique.mockResolvedValue(null);

      const response = await app.request('/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'invalid_token',
        }),
      });

      expect(response.status).toBe(400);
    });
  });
});
