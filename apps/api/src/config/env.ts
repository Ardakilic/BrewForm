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

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(Deno.env.toObject());
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }
  return result.data;
}

export const config = loadEnv();