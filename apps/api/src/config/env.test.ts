import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { z } from 'zod';

const envSchema = z.object({
  APP_PORT: z.coerce.number().default(8000),
  APP_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1),
  DATABASE_PROVIDER: z.enum(['postgresql', 'mysql', 'sqlite']).default('postgresql'),
  CACHE_DRIVER: z.enum(['deno-kv', 'memory']).default('deno-kv'),
  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:8000'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_SECURE: z.coerce.boolean().default(false),
  EMAIL_FROM: z.string().default('noreply@brewform.local'),
  OPENAPI_ENABLED: z.coerce.boolean().default(true),
  UPLOAD_DIR: z.string().default('./uploads'),
  UPLOAD_MAX_SIZE_BYTES: z.coerce.number().default(10 * 1024 * 1024),
  UPLOAD_ALLOWED_TYPES: z.string().default('image/jpeg,image/png,image/webp'),
  APP_URL: z.string().default('http://localhost:8000'),
  ADMIN_EMAIL: z.string().default('admin@brewform.local'),
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().default('changeme123'),
});

describe('Environment Config Schema', () => {
  it('should apply defaults for optional fields', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.APP_PORT).toBe(8000);
      expect(result.data.APP_ENV).toBe('development');
      expect(result.data.CACHE_DRIVER).toBe('deno-kv');
      expect(result.data.DATABASE_PROVIDER).toBe('postgresql');
      expect(result.data.JWT_ACCESS_EXPIRY).toBe('15m');
      expect(result.data.JWT_REFRESH_EXPIRY).toBe('7d');
      expect(result.data.SMTP_PORT).toBe(1025);
      expect(result.data.APP_URL).toBe('http://localhost:8000');
      expect(result.data.UPLOAD_MAX_SIZE_BYTES).toBe(10485760);
    }
  });

  it('should reject missing required DATABASE_URL', () => {
    const result = envSchema.safeParse({
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
    });
    expect(result.success).toBe(false);
  });

  it('should reject short JWT_SECRET', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid APP_ENV', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
      APP_ENV: 'staging',
    });
    expect(result.success).toBe(false);
  });

  it('should coerce string port to number', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
      APP_PORT: '3000',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.APP_PORT).toBe(3000);
    }
  });

  it('should accept all valid environments', () => {
    for (const env of ['development', 'production', 'test'] as const) {
      const result = envSchema.safeParse({
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
        APP_ENV: env,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept all valid cache drivers', () => {
    for (const driver of ['deno-kv', 'memory'] as const) {
      const result = envSchema.safeParse({
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
        CACHE_DRIVER: driver,
      });
      expect(result.success).toBe(true);
    }
  });
});
