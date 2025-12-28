import { vi } from 'vitest';

// Mock Prisma
vi.mock('../../utils/database', () => ({
  getPrisma: vi.fn(() => ({
    $on: vi.fn(),
    $disconnect: vi.fn(),
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
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    emailVerification: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  })),
}));

// Mock Redis
vi.mock('../../utils/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
  },
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 99,
    resetAt: Date.now() + 60000,
  }),
}));

// Mock Config
vi.mock('../../config', () => ({
  getConfig: vi.fn(() => ({
    enablePasswordReset: true,
    enableEmailVerification: false,
    appUrl: 'http://localhost:3000',
  })),
}));

// Mock Logger
vi.mock('../../utils/logger', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  logSecurity: vi.fn(),
  logAudit: vi.fn(),
}));

// Mock Email
vi.mock('../../utils/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

// Mock Auth utilities
vi.mock('../../utils/auth', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed_password'),
  verifyPassword: vi.fn().mockResolvedValue(true),
  generateTokenPair: vi.fn().mockReturnValue({
    accessToken: 'mock_access_token',
    refreshToken: 'mock_refresh_token',
  }),
  generateVerificationToken: vi.fn().mockReturnValue('mock_verification_token'),
  generatePasswordResetToken: vi.fn().mockReturnValue('mock_reset_token'),
  generateSessionToken: vi.fn().mockReturnValue('mock_session_token'),
}));

// Mock Argon2
vi.mock('argon2', () => ({
  hash: vi.fn().mockResolvedValue('hashed_password'),
  verify: vi.fn().mockResolvedValue(true),
}));

// Mock JWT
vi.mock('jsonwebtoken', () => ({
  sign: vi.fn().mockReturnValue('mock_jwt_token'),
  verify: vi.fn().mockReturnValue({ userId: 'user_123', sessionId: 'session_123' }),
}));
