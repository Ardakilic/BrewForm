/**
 * Auth Module Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import authModule from './index.js';

// API Response type for testing
interface ApiResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
  message?: string;
}

// Mock dependencies
vi.mock('../../utils/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    passwordReset: {
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    emailVerification: {
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('../../utils/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
  },
}));

vi.mock('../../utils/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock('argon2', () => ({
  hash: vi.fn().mockResolvedValue('hashed_password'),
  verify: vi.fn().mockResolvedValue(true),
}));

vi.mock('jsonwebtoken', () => ({
  sign: vi.fn().mockReturnValue('mock_jwt_token'),
  verify: vi.fn().mockReturnValue({ userId: 'user_123', sessionId: 'session_123' }),
}));

import { prisma } from '../../utils/prisma/index.js';

describe('Auth Module', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/auth', authModule);
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
      };

      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue(mockUser as never);
      vi.mocked(prisma.emailVerification.create).mockResolvedValue({
        id: 'token_123',
        token: 'verify_token',
        userId: 'user_123',
        expiresAt: new Date(Date.now() + 86400000),
      } as never);

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
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
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

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
      vi.mocked(prisma.session.create).mockResolvedValue({
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
      expect(body.data).toHaveProperty('accessToken');
      expect(body.data).toHaveProperty('refreshToken');
    });

    it('should reject invalid credentials', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

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

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);

      const response = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'banned@example.com',
          password: 'SecurePassword123!',
        }),
      });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout successfully', async () => {
      vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 1 });

      const response = await app.request('/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_jwt_token',
        },
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

      vi.mocked(prisma.session.findFirst).mockResolvedValue(mockSession as never);
      vi.mocked(prisma.session.create).mockResolvedValue({
        id: 'new_session_123',
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
      };

      vi.mocked(prisma.session.findFirst).mockResolvedValue(mockSession as never);

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

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
      vi.mocked(prisma.passwordReset.create).mockResolvedValue({
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
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

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

      vi.mocked(prisma.passwordReset.findFirst).mockResolvedValue(mockToken as never);
      vi.mocked(prisma.user.update).mockResolvedValue({ id: 'user_123' } as never);
      vi.mocked(prisma.passwordReset.delete).mockResolvedValue({} as never);
      vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 1 });

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

      vi.mocked(prisma.passwordReset.findFirst).mockResolvedValue(mockToken as never);

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
      const mockToken = {
        id: 'token_123',
        token: 'valid_verify_token',
        userId: 'user_123',
        expiresAt: new Date(Date.now() + 86400000),
      };

      vi.mocked(prisma.emailVerification.findFirst).mockResolvedValue(mockToken as never);
      vi.mocked(prisma.user.update).mockResolvedValue({ id: 'user_123', emailVerified: true } as never);
      vi.mocked(prisma.emailVerification.delete).mockResolvedValue({} as never);

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
      vi.mocked(prisma.emailVerification.findFirst).mockResolvedValue(null);

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
