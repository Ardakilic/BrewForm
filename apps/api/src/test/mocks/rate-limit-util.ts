/**
 * Mock for src/utils/rate-limit/index.ts
 * Redirected via import_map.json during deno test runs.
 */

interface CallRecord {
  identifier: string;
  action: string;
  maxRequests: number;
  windowMs: number;
}

let _calls: CallRecord[] = [];

export function getCheckRateLimitCalls(): CallRecord[] {
  return [..._calls];
}

export function resetCheckRateLimitCalls(): void {
  _calls = [];
}

export function checkRateLimit(
  identifier: string,
  action: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  _calls.push({ identifier, action, maxRequests, windowMs });
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