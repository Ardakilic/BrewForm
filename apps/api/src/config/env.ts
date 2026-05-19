/**
 * Zod-validated environment configuration.
 * All env vars are parsed at startup — invalid or missing required vars
 * cause the server to exit immediately with a descriptive error.
 * Defaults are suitable for local development (Mailpit on port 1025, etc.).
 */
import { z } from 'zod';

const envSchema = z.object({
  APP_PORT: z.coerce.number().default(8000),
  APP_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),

  DATABASE_URL: z.string().min(1),
  DATABASE_PROVIDER: z.enum(['postgresql', 'mysql', 'sqlite']).default('postgresql'),

  CACHE_DRIVER: z.enum(['deno-kv', 'memory']).default('deno-kv'),

  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  JWT_REMEMBER_ME_EXPIRY: z.string().default('180d'),

  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:8000'),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  EMAIL_FROM: z.string().default('noreply@brewform.local'),

  OPENAPI_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  ENABLE_REGISTRATION: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),

  // Storage
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.url().optional(),

  // Retained for local driver
  UPLOAD_DIR: z.string().default('./uploads'),
  UPLOAD_MAX_SIZE_BYTES: z.coerce.number().default(10 * 1024 * 1024),
  UPLOAD_ALLOWED_TYPES: z.string().default('image/jpeg,image/png,image/webp'),

  APP_URL: z.string().default('http://localhost:8000'),
  PUBLIC_APP_URL: z.url().optional(),

  ADMIN_EMAIL: z.string().default('admin@brewform.local'),
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().default('admin123456'),
}).superRefine((obj, ctx) => {
  if (obj.STORAGE_DRIVER !== 's3') return;
  const requiredS3Fields = [
    { key: 'S3_ENDPOINT', value: obj.S3_ENDPOINT },
    { key: 'S3_BUCKET', value: obj.S3_BUCKET },
    { key: 'S3_ACCESS_KEY', value: obj.S3_ACCESS_KEY },
    { key: 'S3_SECRET_KEY', value: obj.S3_SECRET_KEY },
    { key: 'S3_PUBLIC_URL', value: obj.S3_PUBLIC_URL },
  ];
  for (const field of requiredS3Fields) {
    if (!field.value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field.key],
        message: `${field.key} is required when STORAGE_DRIVER is s3`,
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(Deno.env.toObject());
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }
  return result.data;
}

export let config: Env = loadEnv();

/** Re-parse env vars and update the singleton — used in tests to toggle config between cases. */
export function reloadConfig(): void {
  config = loadEnv();
}
