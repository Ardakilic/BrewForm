/**
 * Mock for src/config/index.ts
 * Redirected via import_map.json during deno test runs.
 */

const _defaultConfig = {
  nodeEnv: 'test',
  port: 3000,
  appUrl: 'http://localhost:3000',
  databaseUrl: 'postgresql://test:test@localhost:5432/test',
  jwtSecret: 'test_jwt_secret',
  jwtAccessExpiry: '15m',
  jwtRefreshExpiry: '7d',
  enablePasswordReset: true,
  enableEmailVerification: false,
  defaultLocale: 'en',
  supportedLocales: 'en,es,de',
  smtpHost: 'localhost',
  smtpPort: 1025,
  smtpUser: '',
  smtpPassword: '',
  emailFrom: 'noreply@brewform.local',
  rateLimitWindowMs: 60000,
  rateLimitMaxRequests: 100,
  // Cache defaults
  cacheDriver: 'deno-kv',
  cacheRequired: false,
  cacheDenoKvPath: undefined,
  cacheRedisUrl: 'redis://localhost:6379',
  cacheRedisPassword: undefined,
  cacheTtlRecipesLatest: 300,
  cacheTtlRecipesPopular: 300,
  cacheTtlRecipesList: 120,
  cacheTtlTasteNotes: 86_400,
  cacheTtlRecipeDetail: 600,
};

// deno-lint-ignore no-explicit-any
let _config: any = { ..._defaultConfig };

export function getConfig() {
  return _config;
}

// deno-lint-ignore no-explicit-any
export function setConfig(config: any): void {
  _config = { ..._defaultConfig, ...config };
}

export function resetConfig(): void {
  _config = { ..._defaultConfig };
}
