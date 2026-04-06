/**
 * Mock for src/utils/rate-limit/index.ts
 * Redirected via import_map.json during deno test runs.
 */

export function checkRateLimit(
  _identifier: string,
  _action: string,
  maxRequests: number,
  _windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  return Promise.resolve({
    allowed: true,
    remaining: maxRequests - 1,
    resetAt: Date.now() + 60000,
  });
}

export function cleanupExpiredRateLimits(): Promise<number> {
  return Promise.resolve(0);
}

export default {
  checkRateLimit,
  cleanupExpiredRateLimits,
};