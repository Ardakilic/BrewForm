/**
 * BrewForm Configuration Module
 * Loads and validates environment variables using Zod
 */

import process from "node:process";
import { z } from "zod";

/**
 * Environment configuration schema with validation
 */
const configSchema = z.object({
  // Application
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  appName: z.string().default("BrewForm"),
  appUrl: z.string().url().default("http://localhost:3000"),
  apiUrl: z.string().url().default("http://localhost:3001"),
  appSecret: z.string().min(32),
  apiVersion: z.string().default("v1"),
  port: z.coerce.number().default(3001),

  // Database
  databaseUrl: z.string(),
  databasePoolMin: z.coerce.number().default(2),
  databasePoolMax: z.coerce.number().default(10),

  // JWT
  jwtSecret: z.string().min(32),
  jwtAccessExpiresIn: z.string().default("15m"),
  jwtRefreshExpiresIn: z.string().default("7d"),

  // Email
  smtpHost: z.string().default("localhost"),
  smtpPort: z.coerce.number().default(1025),
  smtpSecure: z.coerce.boolean().default(false),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  smtpFromName: z.string().default("BrewForm"),
  smtpFromEmail: z.string().email().default("noreply@brewform.local"),

  // Logging
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  logFormat: z.enum(["json", "pretty"]).default("json"),

  // Rate Limiting
  rateLimitWindowMs: z.coerce.number().default(60000),
  rateLimitMaxRequests: z.coerce.number().default(100),

  // Pagination
  defaultPageSize: z.coerce.number().default(20),
  maxPageSize: z.coerce.number().default(100),

  // File Upload
  maxFileSize: z.coerce.number().default(5242880), // 5MB
  allowedFileTypes: z.string().default("image/jpeg,image/png,image/webp"),

  // Session
  sessionSecret: z.string().min(32),
  sessionMaxAge: z.coerce.number().default(604800000), // 7 days

  // Admin
  adminEmail: z.string().email().default("admin@brewform.local"),

  // Cache
  cacheDriver: z.enum(["deno-kv", "redis"]).default("deno-kv"),
  cacheRequired: z.coerce.boolean().default(false),
  cacheDenoKvPath: z.string().default("/data/deno-kv/brewform.kv"),
  cacheRedisUrl: z.string().url().default("redis://redis:6379"),
  cacheRedisPassword: z.string().optional(),
  cacheTtlRecipesLatest: z.coerce.number().int().positive().default(300),
  cacheTtlRecipesPopular: z.coerce.number().int().positive().default(300),
  cacheTtlRecipesList: z.coerce.number().int().positive().default(120),
  cacheTtlTasteNotes: z.coerce.number().int().positive().default(86_400),
  cacheTtlRecipeDetail: z.coerce.number().int().positive().default(600),

  // Analytics
  enableAnalytics: z.coerce.boolean().default(true),

  // Feature Flags
  enableRegistration: z.coerce.boolean().default(true),
  enableEmailVerification: z.coerce.boolean().default(true),
  enablePasswordReset: z.coerce.boolean().default(true),

  // Timezone & Locale
  defaultTimezone: z.string().default("UTC"),
  defaultLocale: z.string().default("en"),
  supportedLocales: z.string().default("en,es,de,fr,it,tr,ja,ko,zh"),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Load configuration from environment variables
 */
function loadConfig(): Config {
  const envMap = {
    nodeEnv: process.env.NODE_ENV,
    appName: process.env.APP_NAME,
    appUrl: process.env.APP_URL,
    apiUrl: process.env.API_URL,
    appSecret: process.env.APP_SECRET,
    apiVersion: process.env.API_VERSION,
    port: process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    databasePoolMin: process.env.DATABASE_POOL_MIN,
    databasePoolMax: process.env.DATABASE_POOL_MAX,
    jwtSecret: process.env.JWT_SECRET,
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT,
    smtpSecure: process.env.SMTP_SECURE,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpFromName: process.env.SMTP_FROM_NAME,
    smtpFromEmail: process.env.SMTP_FROM_EMAIL,
    logLevel: process.env.LOG_LEVEL,
    logFormat: process.env.LOG_FORMAT,
    rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
    rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS,
    defaultPageSize: process.env.DEFAULT_PAGE_SIZE,
    maxPageSize: process.env.MAX_PAGE_SIZE,
    maxFileSize: process.env.MAX_FILE_SIZE,
    allowedFileTypes: process.env.ALLOWED_FILE_TYPES,
    sessionSecret: process.env.SESSION_SECRET,
    sessionMaxAge: process.env.SESSION_MAX_AGE,
    adminEmail: process.env.ADMIN_EMAIL,
    cacheDriver: process.env.CACHE_DRIVER,
    cacheRequired: process.env.CACHE_REQUIRED,
    cacheDenoKvPath: process.env.CACHE_DENO_KV_PATH,
    cacheRedisUrl: process.env.CACHE_REDIS_URL,
    cacheRedisPassword: process.env.CACHE_REDIS_PASSWORD,
    cacheTtlRecipesLatest: process.env.CACHE_TTL_RECIPES_LATEST,
    cacheTtlRecipesPopular: process.env.CACHE_TTL_RECIPES_POPULAR,
    cacheTtlRecipesList: process.env.CACHE_TTL_RECIPES_LIST,
    cacheTtlTasteNotes: process.env.CACHE_TTL_TASTE_NOTES,
    cacheTtlRecipeDetail: process.env.CACHE_TTL_RECIPE_DETAIL,
    enableAnalytics: process.env.ENABLE_ANALYTICS,
    enableRegistration: process.env.ENABLE_REGISTRATION,
    enableEmailVerification: process.env.ENABLE_EMAIL_VERIFICATION,
    enablePasswordReset: process.env.ENABLE_PASSWORD_RESET,
    defaultTimezone: process.env.DEFAULT_TIMEZONE,
    defaultLocale: process.env.DEFAULT_LOCALE,
    supportedLocales: process.env.SUPPORTED_LOCALES,
  };

  const result = configSchema.safeParse(envMap);

  if (!result.success) {
    console.error("❌ Invalid configuration:");
    console.error(result.error.format());
    throw new Error("Invalid configuration. Check environment variables.");
  }

  return result.data;
}

// Singleton config instance
let configInstance: Config | null = null;

/**
 * Get the configuration instance (singleton pattern)
 */
export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * Get config for testing (allows overrides)
 */
export function getTestConfig(overrides: Partial<Config> = {}): Config {
  const baseConfig = loadConfig();
  return { ...baseConfig, ...overrides };
}

export default getConfig;
