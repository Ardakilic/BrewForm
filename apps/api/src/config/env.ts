/**
 * Zod-validated environment configuration.
 * All env vars are parsed at startup — invalid or missing required vars
 * cause the server to exit immediately with a descriptive error.
 * Defaults are suitable for local development (Mailpit on port 1025, etc.).
 *
 * Blank values are treated as unset: a variable whose value is empty or
 * whitespace-only (what Compose produces for `${VAR:-}` and what operators
 * leave in a `.env` file or a Coolify variable) is dropped before validation,
 * so optional variables fall back to their default and required ones still fail.
 */
import * as path from 'node:path';
import { z } from 'zod';
import {
  isSupportedImageMime,
  SUPPORTED_IMAGE_MIME_TYPES,
  type SupportedImageMime,
} from '../utils/upload/mime.ts';

/**
 * Copy the raw environment and drop every key whose value is a string that
 * trims to `''`, so blank values behave exactly like unset ones.
 *
 * @param input - The raw input (normally `process.env`).
 * @returns A shallow copy without blank string values (non-objects pass through).
 */
function dropBlankValues(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input;
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' && value.trim() === '') continue;
    copy[key] = value;
  }
  return copy;
}

/** A TCP port: an integer between 1 and 65535 (coerced from the env string). */
const portSchema = z.coerce.number().int().min(1).max(65535);

/**
 * `UPLOAD_ALLOWED_TYPES`: a comma-separated list, split, trimmed, lower-cased
 * and stripped of empty entries, that must be a non-empty subset of
 * {@link SUPPORTED_IMAGE_MIME_TYPES} (the types the upload detector can
 * recognise). The error names the variable and the unsupported entries.
 */
const uploadAllowedTypesSchema = z
  .string()
  .default(SUPPORTED_IMAGE_MIME_TYPES.join(','))
  .transform((value, ctx): SupportedImageMime[] => {
    const entries = value
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry !== '');
    const unsupported = entries.filter((entry) => !isSupportedImageMime(entry));
    if (unsupported.length > 0) {
      ctx.addIssue({
        code: 'custom',
        input: value,
        message: `UPLOAD_ALLOWED_TYPES contains unsupported types: ${unsupported.join(', ')} (supported: ${SUPPORTED_IMAGE_MIME_TYPES.join(', ')})`,
      });
      return z.NEVER;
    }
    if (entries.length === 0) {
      ctx.addIssue({
        code: 'custom',
        input: value,
        message: 'UPLOAD_ALLOWED_TYPES must list at least one image type',
      });
      return z.NEVER;
    }
    return entries.filter(isSupportedImageMime);
  });

/** The validated environment object, before the blank-value preprocessing step. */
const envObjectSchema = z
  .object({
    APP_PORT: portSchema.default(8000),
    APP_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z.string().default('info'),
    LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),

    DATABASE_URL: z.string().min(1),
    DATABASE_PROVIDER: z.enum(['postgresql', 'mysql', 'sqlite']).default('postgresql'),

    CACHE_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    CACHE_DRIVER: z.enum(['memory', 'redis']).default('memory'),
    REDIS_URL: z.string().optional(),

    JWT_SECRET: z.string().min(16),
    JWT_ACCESS_EXPIRY: z
      .string()
      .regex(/^\d+[smhdM]$/, 'Invalid JWT_ACCESS_EXPIRY format; expected like 30d, 12h')
      .default('15m'),
    JWT_REFRESH_EXPIRY: z
      .string()
      .regex(/^\d+[smhdM]$/, 'Invalid JWT_REFRESH_EXPIRY format; expected like 30d, 12h')
      .default('7d'),
    JWT_REMEMBER_ME_EXPIRY: z
      .string()
      .regex(/^\d+[smhdM]$/, 'Invalid JWT_REMEMBER_ME_EXPIRY format; expected like 30d, 12h')
      .default('180d'),

    CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:8000'),

    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: portSchema.default(1025),
    SMTP_USER: z.string().default(''),
    SMTP_PASS: z.string().default(''),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    EMAIL_FROM: z.string().default('noreply@brewform.local'),

    OPENAPI_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    ENABLE_REGISTRATION: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    // Storage
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
    S3_PUBLIC_URL: z.url().optional(),

    // Local storage driver. UPLOAD_DIR is resolved to an absolute path at load
    // (relative values against the process working directory); the production
    // image sets /app/uploads, the path the production compose file mounts.
    UPLOAD_DIR: z
      .string()
      .default('./uploads')
      .transform((p) => path.resolve(p)),
    UPLOAD_MAX_SIZE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(10 * 1024 * 1024),
    UPLOAD_ALLOWED_TYPES: uploadAllowedTypesSchema,

    APP_URL: z.string().default('http://localhost:8000'),
    PUBLIC_APP_URL: z.url().optional(),

    ADMIN_EMAIL: z.string().default('admin@brewform.local'),
    ADMIN_USERNAME: z.string().default('admin'),
    // First-install only: read by the DB seed when the users table is empty;
    // changing it later has no effect (existing rows are never updated).
    ADMIN_PASSWORD: z.string().default('admin123456'),
  })
  .superRefine((obj, ctx) => {
    if (obj.CACHE_ENABLED && obj.CACHE_DRIVER === 'redis' && !obj.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_URL'],
        message: 'REDIS_URL is required when CACHE_ENABLED is true and CACHE_DRIVER is redis',
      });
    }
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

/**
 * Zod schema for the API environment: {@link dropBlankValues} followed by the
 * object schema. Exported for tests; see {@link config}.
 */
export const envSchema = z.preprocess(dropBlankValues, envObjectSchema);

/** Output type of the validated environment schema — the shape of {@link config}. */
export type Env = z.output<typeof envSchema>;

/**
 * Parse `process.env` with {@link envSchema}. On failure, print each failing
 * variable name with its validation messages (never the offending values,
 * which may be secrets) and throw.
 *
 * @returns The validated configuration.
 * @throws {Error} `Invalid environment variables` when validation fails.
 */
function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // Logger is not available here — config must be validated before logger can be initialized.
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }
  return result.data;
}

/** Validated environment singleton, loaded once at startup; re-parsed only via {@link reloadConfig}. */
export let config: Env = loadEnv();

/** Re-parse env vars and update the singleton — used in tests to toggle config between cases. */
export function reloadConfig(): void {
  config = loadEnv();
}
