/**
 * BrewForm Test Setup
 * Configures the test environment
 */

import { vi } from 'vitest';

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.APP_NAME = 'BrewForm';
process.env.APP_URL = 'http://localhost:3000';
process.env.API_URL = 'http://localhost:3001';
process.env.APP_SECRET = 'test-secret-key-must-be-at-least-32-chars';
process.env.API_VERSION = 'v1';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-jwt-secret-key-must-be-at-least-32-chars';
process.env.SESSION_SECRET = 'test-session-secret-key-must-be-32-chars';
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '1025';
process.env.SMTP_FROM_EMAIL = 'test@brewform.local';

// Mock Prisma client
vi.mock('@prisma/client', () => {
  return {
    PrismaClient: vi.fn().mockImplementation(() => ({
      $connect: vi.fn(),
      $disconnect: vi.fn(),
      $queryRaw: vi.fn(),
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      recipe: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      session: {
        create: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    })),
    BrewMethodType: {
      ESPRESSO_MACHINE: 'ESPRESSO_MACHINE',
      POUR_OVER_V60: 'POUR_OVER_V60',
      AEROPRESS: 'AEROPRESS',
      FRENCH_PRESS: 'FRENCH_PRESS',
      TURKISH_CEZVE: 'TURKISH_CEZVE',
    },
    DrinkType: {
      ESPRESSO: 'ESPRESSO',
      POUR_OVER: 'POUR_OVER',
      LATTE: 'LATTE',
      CAPPUCCINO: 'CAPPUCCINO',
      TURKISH_COFFEE: 'TURKISH_COFFEE',
    },
    Visibility: {
      DRAFT: 'DRAFT',
      PRIVATE: 'PRIVATE',
      UNLISTED: 'UNLISTED',
      PUBLIC: 'PUBLIC',
    },
    EmojiRating: {
      SUPER_GOOD: 'SUPER_GOOD',
      GOOD: 'GOOD',
      OKAY: 'OKAY',
      BAD: 'BAD',
      HORRIBLE: 'HORRIBLE',
    },
    ProcessingMethod: {
      WASHED: 'WASHED',
      NATURAL: 'NATURAL',
      HONEY: 'HONEY',
      ANAEROBIC: 'ANAEROBIC',
      WET_HULLED: 'WET_HULLED',
      OTHER: 'OTHER',
    },
  };
});

// Mock Redis client
vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      connect: vi.fn(),
      quit: vi.fn(),
      ping: vi.fn().mockResolvedValue('PONG'),
      get: vi.fn(),
      set: vi.fn(),
      setex: vi.fn(),
      del: vi.fn(),
      keys: vi.fn().mockResolvedValue([]),
      zremrangebyscore: vi.fn(),
      zcard: vi.fn().mockResolvedValue(0),
      zadd: vi.fn(),
      zrange: vi.fn().mockResolvedValue([]),
      pexpire: vi.fn(),
      on: vi.fn(),
    })),
  };
});

// Mock nodemailer
vi.mock('nodemailer', () => ({
  createTransport: vi.fn().mockReturnValue({
    sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
  }),
}));

// Mock utility modules
const mockPrisma = {
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
    findUnique: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
  },
  passwordReset: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  emailVerification: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

vi.mock('../utils/database/index.js', () => ({
  getPrisma: vi.fn(() => mockPrisma),
}));

// Export the mock for use in tests
export { mockPrisma };

vi.mock('../utils/redis/index.js', () => ({
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

vi.mock('../config/index.js', () => ({
  getConfig: vi.fn(() => ({
    enablePasswordReset: true,
    enableEmailVerification: false,
    appUrl: 'http://localhost:3000',
  })),
}));

vi.mock('../utils/logger/index.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  logSecurity: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('../utils/email/index.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  sendVerificationEmail: vi.fn().mockResolvedValue(true),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
  sendWelcomeEmail: vi.fn().mockResolvedValue(true),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock('../utils/auth/index.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed_password'),
  verifyPassword: vi.fn().mockResolvedValue(true),
  generateTokenPair: vi.fn().mockReturnValue({
    accessToken: 'mock_access_token',
    refreshToken: 'mock_refresh_token',
  }),
  generateVerificationToken: vi.fn().mockReturnValue('mock_verification_token'),
  generatePasswordResetToken: vi.fn().mockReturnValue('mock_reset_token'),
  generateSessionToken: vi.fn().mockReturnValue('mock_session_token'),
  verifyAccessToken: vi.fn().mockResolvedValue({ userId: 'user_123', sessionId: 'session_123' }),
  verifyRefreshToken: vi.fn().mockResolvedValue({ userId: 'user_123', sessionId: 'session_123' }),
}));

// Mock auth middleware
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn((_c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    _c.set('user', { id: 'user_123', email: 'test@example.com', username: 'testuser', isAdmin: false, isBanned: false });
    return next();
  }),
  requireAuth: vi.fn((_c: unknown, next: () => Promise<void>) => next()),
  requireAdmin: vi.fn((_c: unknown, next: () => Promise<void>) => next()),
  optionalAuth: vi.fn((_c: unknown, next: () => Promise<void>) => next()),
}));

vi.mock('argon2', () => ({
  hash: vi.fn().mockResolvedValue('hashed_password'),
  verify: vi.fn().mockResolvedValue(true),
}));

vi.mock('jsonwebtoken', () => ({
  sign: vi.fn().mockReturnValue('mock_jwt_token'),
  verify: vi.fn().mockReturnValue({ userId: 'user_123', sessionId: 'session_123' }),
}));

// Mock rate limiter middleware
vi.mock('../middleware/rateLimit.js', () => ({
  authRateLimiter: vi.fn((_c: unknown, next: () => Promise<void>) => next()),
  writeRateLimiter: vi.fn((_c: unknown, next: () => Promise<void>) => next()),
  apiRateLimiter: vi.fn((_c: unknown, next: () => Promise<void>) => next()),
  rateLimitMiddleware: vi.fn((_c: unknown, next: () => Promise<void>) => next()),
  createRateLimiter: vi.fn(() => vi.fn((_c: unknown, next: () => Promise<void>) => next())),
}));

// Mock error handler
vi.mock('../middleware/errorHandler.js', () => ({
  NotFoundError: class NotFoundError extends Error {
    constructor(resource: string) {
      super(`${resource} not found`);
      this.name = 'NotFoundError';
    }
    statusCode = 404;
  },
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(message = 'Unauthorized') {
      super(message);
      this.name = 'UnauthorizedError';
    }
    statusCode = 401;
  },
  ForbiddenError: class ForbiddenError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ForbiddenError';
    }
    statusCode = 403;
  },
  BadRequestError: class BadRequestError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'BadRequestError';
    }
    statusCode = 400;
  },
  ConflictError: class ConflictError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ConflictError';
    }
    statusCode = 409;
  },
  ValidationError: class ValidationError extends Error {
    constructor(_errors: Array<{ field: string; message: string }>) {
      super('Validation failed');
      this.name = 'ValidationError';
    }
    statusCode = 422;
  },
  errorHandler: vi.fn(),
}));
