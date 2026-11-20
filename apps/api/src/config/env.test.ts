import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Validate the production schema (not a copy) so refinement tests cover real behavior.
// Importing env.ts initializes config, so stub the required vars first.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET ??= 'a-very-long-secret-key-for-testing-12345';
const { envSchema, reloadConfig } = await import('./env.ts');

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

/** The two required variables, valid, for building test inputs. */
const REQUIRED = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
} as const;

/** Variable names reported by a failed parse (first path segment of each issue). */
function failedKeys(input: Record<string, string>): string[] {
  const result = envSchema.safeParse(input);
  expect(result.success).toBe(false);
  if (result.success) return [];
  return result.error.issues.map((issue) => String(issue.path[0]));
}

describe('blank values are treated as unset', () => {
  it('should leave blank optional URL variables undefined with local storage', () => {
    const result = envSchema.safeParse({
      ...REQUIRED,
      STORAGE_DRIVER: 'local',
      S3_ENDPOINT: '',
      S3_PUBLIC_URL: '',
      PUBLIC_APP_URL: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.S3_ENDPOINT).toBeUndefined();
      expect(result.data.S3_PUBLIC_URL).toBeUndefined();
      expect(result.data.PUBLIC_APP_URL).toBeUndefined();
    }
  });

  it('should fall back to numeric defaults for blank numbers', () => {
    const result = envSchema.safeParse({
      ...REQUIRED,
      APP_PORT: '',
      SMTP_PORT: '',
      UPLOAD_MAX_SIZE_BYTES: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.APP_PORT).toBe(8000);
      expect(result.data.SMTP_PORT).toBe(1025);
      expect(result.data.UPLOAD_MAX_SIZE_BYTES).toBe(10485760);
    }
  });

  it('should fall back to enum and boolean defaults for blank values', () => {
    const result = envSchema.safeParse({
      ...REQUIRED,
      CACHE_ENABLED: '',
      CACHE_DRIVER: '',
      LOG_FORMAT: '',
      STORAGE_DRIVER: '  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.CACHE_ENABLED).toBe(true);
      expect(result.data.CACHE_DRIVER).toBe('memory');
      expect(result.data.LOG_FORMAT).toBe('json');
      expect(result.data.STORAGE_DRIVER).toBe('local');
    }
  });

  it('should still fail blank required variables and name them', () => {
    expect(failedKeys({ ...REQUIRED, JWT_SECRET: '' })).toContain('JWT_SECRET');
    expect(failedKeys({ ...REQUIRED, DATABASE_URL: '   ' })).toContain('DATABASE_URL');
  });

  it('should still require non-blank S3 settings for the s3 driver', () => {
    const result = envSchema.safeParse({
      ...REQUIRED,
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: '',
      S3_BUCKET: 'bucket',
      S3_ACCESS_KEY: 'access',
      S3_SECRET_KEY: 'secret',
      S3_PUBLIC_URL: 'https://cdn.example.com',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        'S3_ENDPOINT is required when STORAGE_DRIVER is s3',
      );
    }
  });
});

describe('port and size range checks', () => {
  it('should reject non-numeric and out-of-range APP_PORT values', () => {
    for (const value of ['abc', '0', '70000']) {
      expect(failedKeys({ ...REQUIRED, APP_PORT: value })).toContain('APP_PORT');
    }
  });

  it('should reject an out-of-range SMTP_PORT', () => {
    expect(failedKeys({ ...REQUIRED, SMTP_PORT: '70000' })).toContain('SMTP_PORT');
  });

  it('should reject non-positive UPLOAD_MAX_SIZE_BYTES values', () => {
    for (const value of ['-1', '0']) {
      expect(failedKeys({ ...REQUIRED, UPLOAD_MAX_SIZE_BYTES: value })).toContain(
        'UPLOAD_MAX_SIZE_BYTES',
      );
    }
  });

  it('should coerce valid numeric values', () => {
    const result = envSchema.safeParse({
      ...REQUIRED,
      APP_PORT: '3000',
      UPLOAD_MAX_SIZE_BYTES: '5242880',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.APP_PORT).toBe(3000);
      expect(result.data.UPLOAD_MAX_SIZE_BYTES).toBe(5242880);
    }
  });
});

describe('upload limits and allowlist', () => {
  /** The issues reported for UPLOAD_ALLOWED_TYPES when parsing `value`. */
  function allowlistIssues(value: string): string[] {
    const result = envSchema.safeParse({ ...REQUIRED, UPLOAD_ALLOWED_TYPES: value });
    if (result.success) return [];
    return result.error.issues
      .filter((issue) => issue.path.join('.') === 'UPLOAD_ALLOWED_TYPES')
      .map((issue) => issue.message);
  }

  it('should reject an unsupported allowlist entry with a message naming it', () => {
    const messages = allowlistIssues('image/jpeg,image/gif');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('UPLOAD_ALLOWED_TYPES');
    expect(messages[0]).toContain('image/gif');
  });

  it('should trim and lower-case allowlist entries and ignore empty ones', () => {
    const result = envSchema.safeParse({
      ...REQUIRED,
      UPLOAD_ALLOWED_TYPES: 'image/jpeg, image/png',
    });
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data.UPLOAD_ALLOWED_TYPES).toEqual(['image/jpeg', 'image/png']);

    const messy = envSchema.safeParse({ ...REQUIRED, UPLOAD_ALLOWED_TYPES: ' IMAGE/WEBP ,, ' });
    expect(messy.success).toBe(true);
    if (messy.success) expect(messy.data.UPLOAD_ALLOWED_TYPES).toEqual(['image/webp']);
  });

  it('should reject an allowlist with no entries', () => {
    expect(allowlistIssues(',')).toEqual([
      'UPLOAD_ALLOWED_TYPES must list at least one image type',
    ]);
  });

  it.each(['0', '-5', '1.5'])('should reject UPLOAD_MAX_SIZE_BYTES=%s', (value) => {
    expect(failedKeys({ ...REQUIRED, UPLOAD_MAX_SIZE_BYTES: value })).toContain(
      'UPLOAD_MAX_SIZE_BYTES',
    );
  });

  it('should default to 10485760 bytes and the three supported types', () => {
    const result = envSchema.safeParse(REQUIRED);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.UPLOAD_MAX_SIZE_BYTES).toBe(10485760);
      expect(result.data.UPLOAD_ALLOWED_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    }
  });
});

describe('UPLOAD_DIR', () => {
  it('should resolve a relative value against the working directory', () => {
    const result = envSchema.safeParse({ ...REQUIRED, UPLOAD_DIR: './uploads' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.UPLOAD_DIR).toBe(path.resolve('./uploads'));
  });

  it('should resolve the default to an absolute path', () => {
    const result = envSchema.safeParse({ ...REQUIRED });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.UPLOAD_DIR).toBe(path.resolve('./uploads'));
  });

  it('should keep an absolute value as is', () => {
    const result = envSchema.safeParse({ ...REQUIRED, UPLOAD_DIR: '/app/uploads' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.UPLOAD_DIR).toBe('/app/uploads');
  });
});

describe('loadEnv failure output', () => {
  it('should name the failing variables without printing their values', () => {
    const keys = ['JWT_SECRET', 'STORAGE_DRIVER', 'S3_ENDPOINT'] as const;
    const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      process.env.JWT_SECRET = 'tooshort';
      process.env.STORAGE_DRIVER = 's3';
      process.env.S3_ENDPOINT = 'not a url';
      expect(() => reloadConfig()).toThrow('Invalid environment variables');

      const output = errorSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
      expect(output).toContain('JWT_SECRET');
      expect(output).toContain('S3_ENDPOINT');
      expect(output).not.toContain('tooshort');
      expect(output).not.toContain('not a url');
    } finally {
      for (const key of keys) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
      errorSpy.mockRestore();
      reloadConfig();
    }
  });
});
