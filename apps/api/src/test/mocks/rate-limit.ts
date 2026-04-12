/**
 * Mock for src/middleware/rateLimit.ts
 * Redirected via import_map.json during deno test runs.
 */

import { spy } from '@std/testing/mock';

const passThrough = (...args: unknown[]) => (args[1] as () => Promise<void>)();

export const authRateLimiter = spy(passThrough);
export const writeRateLimiter = spy(passThrough);
export const apiRateLimiter = spy(passThrough);
export const rateLimitMiddleware = spy(passThrough);
export const createRateLimiter = spy(() => spy(passThrough));
