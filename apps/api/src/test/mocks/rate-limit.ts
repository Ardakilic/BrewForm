/**
 * Mock for src/middleware/rateLimit.ts
 * Redirected via import_map.json during deno test runs.
 */

import { mockFn } from "../mock-fn.ts";

const passThrough = (...args: unknown[]) => (args[1] as () => Promise<void>)();

export const authRateLimiter = mockFn(passThrough);
export const writeRateLimiter = mockFn(passThrough);
export const apiRateLimiter = mockFn(passThrough);
export const rateLimitMiddleware = mockFn(passThrough);
export const createRateLimiter = mockFn(() => mockFn(passThrough));
