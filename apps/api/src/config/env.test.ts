import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { z } from 'zod';

const envSchema = z.object({
  APP_PORT: z.coerce.number().default(8000),
  APP_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  DATABASE_URL: z.string().min(1),
  DATABASE_PROVIDER: z.enum(['postgresql', 'mysql', 'sqlite']).default('postgresql'),
  CACHE_DRIVER: z.enum(['deno-kv', 'memory']).default('deno-kv'),
  DENO_KV_URL: z.string().optional(),
  DENO_KV_ACCESS_TOKEN: z.string().optional(),
  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  JWT_REMEMBER_ME_EXPIRY: z.string().default('180d'),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:8000'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_SECURE: z.coerce.boolean().default(false),
  EMAIL_FROM: z.string().default('noreply@brewform.local'),
  OPENAPI_ENABLED: z.coerce.boolean().default(true),
  ENABLE_REGISTRATION: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  UPLOAD_DIR: z.string().default('./uploads'),
  UPLOAD_MAX_SIZE_BYTES: z.coerce.number().default(10 * 1024 * 1024),
  UPLOAD_ALLOWED_TYPES: z.string().default('image/jpeg,image/png,image/webp'),
  APP_URL: z.string().default('http://localhost:8000'),
  ADMIN_EMAIL: z.string().default('admin@brewform.local'),
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().default('admin123456'),
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
    for (const driver of ['deno-kv', 'memory'] as const) {
      const result = envSchema.safeParse({
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
        CACHE_DRIVER: driver,
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

describe('DENO_KV_URL / DENO_KV_ACCESS_TOKEN', () => {
  const base = {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
  };

  it('should be optional (schema parses without them)', () => {
    const result = envSchema.safeParse({ ...base, CACHE_DRIVER: 'deno-kv' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DENO_KV_URL).toBeUndefined();
      expect(result.data.DENO_KV_ACCESS_TOKEN).toBeUndefined();
    }
  });

  it('should parse for memory driver without KV vars', () => {
    const result = envSchema.safeParse({ ...base, CACHE_DRIVER: 'memory' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DENO_KV_URL).toBeUndefined();
      expect(result.data.DENO_KV_ACCESS_TOKEN).toBeUndefined();
    }
  });

  it('should accept DENO_KV_URL and DENO_KV_ACCESS_TOKEN when present', () => {
    const result = envSchema.safeParse({
      ...base,
      CACHE_DRIVER: 'deno-kv',
      DENO_KV_URL: 'http://10.0.0.5:4512',
      DENO_KV_ACCESS_TOKEN: 'abc123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DENO_KV_URL).toBe('http://10.0.0.5:4512');
      expect(result.data.DENO_KV_ACCESS_TOKEN).toBe('abc123');
    }
  });

  it('should infer both fields as `string | undefined`', () => {
    type Env = z.infer<typeof envSchema>;
    // Compile-time assertions (verified by `deno check`):
    //  - `undefined` is assignable to each field  → the field includes `undefined`
    //  - a `string` is assignable to each field    → the field includes `string`
    //  - each field is assignable to `string | undefined` → it is no wider than that
    const urlUndefined: Env['DENO_KV_URL'] = undefined;
    const urlString: Env['DENO_KV_URL'] = 'http://denokv:4512';
    const tokenUndefined: Env['DENO_KV_ACCESS_TOKEN'] = undefined;
    const tokenString: Env['DENO_KV_ACCESS_TOKEN'] = 'token';
    const urlNarrowed: string | undefined = urlString;
    const tokenNarrowed: string | undefined = tokenString;

    expect(urlUndefined).toBeUndefined();
    expect(tokenUndefined).toBeUndefined();
    expect(urlNarrowed).toBe('http://denokv:4512');
    expect(tokenNarrowed).toBe('token');
  });
});
