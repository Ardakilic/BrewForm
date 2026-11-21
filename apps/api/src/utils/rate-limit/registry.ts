/**
 * Process-wide rate-limit backend registry.
 *
 * Route modules build their limiter middleware at import time, before
 * `main.ts` knows which store to use, so the middleware resolves the backend
 * from here on every request. `main.ts` installs the redis backend at startup
 * when `RATE_LIMIT_STORE=redis`; otherwise the default memory backend stays.
 * Tests call {@link resetRateLimitBackend} in `beforeEach` for fresh counters.
 */
import { config } from '../../config/index.ts';
import { createLogger } from '../logger/index.ts';
import { createMemoryBackend, type RateLimitBackend } from './backend.ts';
import type { RateLimitPolicy } from './policies.ts';

/** Module logger (exported for test spies). */
export const log = createLogger('rate-limit-registry');

let backend: RateLimitBackend = createMemoryBackend();

/**
 * The active backend.
 *
 * @returns The backend installed by `main.ts` (or the default memory backend).
 */
export function getRateLimitBackend(): RateLimitBackend {
  return backend;
}

/**
 * Install a backend (startup wiring, or a test double). The previous backend
 * is not closed.
 *
 * @param next - The backend to use from now on.
 */
export function setRateLimitBackend(next: RateLimitBackend): void {
  backend = next;
}

/** Replace the active backend with a fresh memory backend (all counters reset). */
export function resetRateLimitBackend(): void {
  backend = createMemoryBackend();
}

/**
 * Rate-limit store health for `/ready`.
 *
 * @returns `disabled` when `RATE_LIMIT_ENABLED=false`, otherwise the active
 *   backend's status (`memory`, `ok` or `degraded`).
 */
export function getRateLimitStoreStatus(): 'memory' | 'ok' | 'degraded' | 'disabled' {
  if (!config.RATE_LIMIT_ENABLED) return 'disabled';
  return backend.status();
}

/**
 * Delete one policy counter (for example the login-failure counters after a
 * successful password reset). Never throws: a store failure is logged with
 * `{ err, policy }` and ignored.
 *
 * @param policy - The policy whose counter to delete.
 * @param key - The policy key (an `rateLimitIpKey`, `emailKey` or user id form).
 */
export async function deleteRateLimitCounter(policy: RateLimitPolicy, key: string): Promise<void> {
  log.debug({ policy: policy.id }, 'deleteRateLimitCounter started');
  try {
    await backend.limiter(policy).delete(key);
    log.debug({ policy: policy.id }, 'deleteRateLimitCounter completed');
  } catch (err) {
    log.error({ err, policy: policy.id }, 'deleteRateLimitCounter failed');
  }
}
