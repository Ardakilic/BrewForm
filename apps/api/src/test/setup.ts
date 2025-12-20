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
