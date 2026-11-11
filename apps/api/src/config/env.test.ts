import { describe, expect, it } from 'vitest';

// Validate the production schema (not a copy) so refinement tests cover real behavior.
// Importing env.ts initializes config, so stub the required vars first.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET ??= 'a-very-long-secret-key-for-testing-12345';
const { envSchema } = await import('./env.ts');

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
      expect(result.data.CACHE_DRIVER).toBe('memory');
      expect(result.data.DATABASE_PROVIDER).toBe('postgresql');
      expect(result.data.JWT_ACCESS_EXPIRY).toBe('15m');
      expect(result.data.JWT_REFRESH_EXPIRY).toBe('7d');
      expect(result.data.JWT_REMEMBER_ME_EXPIRY).toBe('180d');
      expect(result.data.SMTP_PORT).toBe(1025);
      expect(result.data.APP_URL).toBe('http://localhost:8000');
      expect(result.data.UPLOAD_MAX_SIZE_BYTES).toBe(10485760);
      expect(result.data.LOG_LEVEL).toBe('info');
      expect(result.data.LOG_FORMAT).toBe('json');
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
    for (const driver of ['memory', 'redis'] as const) {
      const result = envSchema.safeParse({
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
        CACHE_DRIVER: driver,
        ...(driver === 'redis' ? { REDIS_URL: 'redis://localhost:6379' } : {}),
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept all valid LOG_FORMAT values', () => {
    for (const format of ['json', 'pretty'] as const) {
      const result = envSchema.safeParse({
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
        LOG_FORMAT: format,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.LOG_FORMAT).toBe(format);
      }
    }
  });

  it('should reject invalid LOG_FORMAT', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
      LOG_FORMAT: 'xml',
    });
    expect(result.success).toBe(false);
  });

  it('should default LOG_FORMAT to json', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.LOG_FORMAT).toBe('json');
    }
  });

  it('should default LOG_LEVEL to info', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.LOG_LEVEL).toBe('info');
    }
  });

  it('should accept custom LOG_LEVEL values', () => {
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const) {
      const result = envSchema.safeParse({
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
        LOG_LEVEL: level,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.LOG_LEVEL).toBe(level);
      }
    }
  });
});

describe('ENABLE_REGISTRATION', () => {
  it('should default to true', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ENABLE_REGISTRATION).toBe(true);
    }
  });

  it('should accept false', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
      ENABLE_REGISTRATION: 'false',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ENABLE_REGISTRATION).toBe(false);
    }
  });

  it('should accept true', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
      ENABLE_REGISTRATION: 'true',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ENABLE_REGISTRATION).toBe(true);
    }
  });

  it('should reject invalid values', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
      ENABLE_REGISTRATION: 'maybe',
    });
    expect(result.success).toBe(false);
  });
});

describe('JWT_REMEMBER_ME_EXPIRY', () => {
  it('should default to 180d', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.JWT_REMEMBER_ME_EXPIRY).toBe('180d');
    }
  });

  it('should accept custom value', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
      JWT_REMEMBER_ME_EXPIRY: '365d',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.JWT_REMEMBER_ME_EXPIRY).toBe('365d');
    }
  });

  it('should accept month suffix M', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
      JWT_REMEMBER_ME_EXPIRY: '6M',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.JWT_REMEMBER_ME_EXPIRY).toBe('6M');
    }
  });
});

describe('CACHE_DRIVER', () => {
  it('should reject the removed deno-kv driver', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
      CACHE_DRIVER: 'deno-kv',
    });
    expect(result.success).toBe(false);
  });

  it('should require REDIS_URL for the redis driver when enabled', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
      CACHE_DRIVER: 'redis',
    });
    expect(result.success).toBe(false);
  });

  it('should accept the redis driver with REDIS_URL set', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
      CACHE_DRIVER: 'redis',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(result.success).toBe(true);
  });

  it('should not require REDIS_URL when caching is disabled', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
      CACHE_ENABLED: 'false',
      CACHE_DRIVER: 'redis',
    });
    expect(result.success).toBe(true);
  });
});
