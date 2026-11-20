/**
 * Rate-limit state backends (api-rate-limiting spec, "Rate-limit state is
 * independent of the cache" and "Limiter degrades safely"; ADR-016).
 *
 * A backend hands out one `rate-limiter-flexible` limiter per policy
 * (memoised by policy id) and reports its health for `/ready`:
 *
 * - {@link createMemoryBackend}: `RateLimiterMemory` per policy (keys expire
 *   with their window, so memory is bounded by the keys seen in the longest
 *   window).
 * - {@link createRedisBackend}: `RateLimiterRedis` (atomic Lua INCR + TTL) on a
 *   dedicated ioredis client, keys under `brewform-rl:<policy-id>:` (outside the
 *   cache's `brewform:` namespace), `rejectIfRedisNotReady: true`, and a
 *   `RateLimiterMemory` insurance limiter with the same points and window. Any
 *   store error, or a client that is not ready, falls back to the insurance
 *   limiter (fail-soft). It logs one warn on entering degraded mode and one
 *   info on recovery (with the number of fallback decisions in between).
 */
import {
  type RateLimiterAbstract,
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
} from 'rate-limiter-flexible';
import { createLogger } from '../logger/index.ts';
import type { RateLimitPolicy } from './policies.ts';

/** Module logger (exported for test spies). Never logs keys, IPs or emails. */
export const log = createLogger('rate-limit-backend');

/** Root of every limiter key on the shared store (never matched by `brewform:*`). */
export const REDIS_KEY_ROOT = 'brewform-rl:';

/** Health of a backend: `memory` (process-local), `ok` or `degraded` (redis). */
export type RateLimitBackendStatus = 'memory' | 'ok' | 'degraded';

/** A source of per-policy limiters. */
export interface RateLimitBackend {
  /** Which store this backend uses. */
  readonly kind: 'memory' | 'redis';
  /**
   * The limiter for a policy, created on first use and memoised by policy id.
   *
   * @param policy - The policy to enforce.
   */
  limiter(policy: RateLimitPolicy): RateLimiterAbstract;
  /** Current health, reported by `/ready`. */
  status(): RateLimitBackendStatus;
  /** Release resources (the redis client's connection). */
  close(): Promise<void>;
}

/**
 * The ioredis surface the redis backend needs: connection status, lifecycle
 * events and `disconnect`. `RateLimiterRedis` additionally calls
 * `defineCommand`, the generated `rlflxIncr`, `multi` and `del`.
 */
export interface RedisLimiterClient {
  readonly status: string;
  on(event: 'error', listener: (err: Error) => void): unknown;
  on(event: 'ready', listener: () => void): unknown;
  disconnect(): void;
}

/**
 * Build a memory-only backend: one `RateLimiterMemory` per policy, with
 * `keyPrefix: policy.id`.
 *
 * @returns A backend whose status is always `memory`.
 */
export function createMemoryBackend(): RateLimitBackend {
  const limiters = new Map<string, RateLimiterMemory>();
  return {
    kind: 'memory',
    limiter(policy) {
      let limiter = limiters.get(policy.id);
      if (!limiter) {
        limiter = new RateLimiterMemory({
          points: policy.points,
          duration: policy.durationSec,
          keyPrefix: policy.id,
        });
        limiters.set(policy.id, limiter);
      }
      return limiter;
    },
    status: () => 'memory',
    close() {
      limiters.clear();
      return Promise.resolve();
    },
  };
}

/** Signature of `rate-limiter-flexible`'s internal store-error funnel (not in its typings). */
type HandleError = (
  err: unknown,
  funcName: string,
  resolve: (value: unknown) => void,
  reject: (reason: unknown) => void,
  params: unknown[],
) => void;

/** The library's own `_handleError` (routes store errors to the insurance limiter). */
const baseHandleError = (RateLimiterRedis.prototype as unknown as { _handleError: HandleError })
  ._handleError;

/**
 * `RateLimiterRedis` that reports every store error (anything but a
 * `RateLimiterRes` "limit exceeded" rejection) before the library hands the
 * call to the insurance limiter, so the backend can track degraded mode.
 */
class ObservedRateLimiterRedis extends RateLimiterRedis {
  /** Called with the store error each time a decision falls back to insurance. */
  onStoreError: (err: unknown) => void = () => {};

  /**
   * Intercept the library's error funnel, then delegate to it unchanged.
   *
   * @param err - The rejection reason from the store call.
   * @param funcName - The limiter method that failed (`consume`, `get`, ...).
   * @param resolve - Resolves the caller's promise.
   * @param reject - Rejects the caller's promise.
   * @param params - The original call arguments, replayed on the insurance limiter.
   */
  _handleError(
    err: unknown,
    funcName: string,
    resolve: (value: unknown) => void,
    reject: (reason: unknown) => void,
    params: unknown[],
  ): void {
    if (!(err instanceof RateLimiterRes)) this.onStoreError(err);
    baseHandleError.call(this, err, funcName, resolve, reject, params);
  }
}

/**
 * Build a backend on a shared Redis/Valkey store. Use a dedicated client from
 * `createRedisClient()` (fast-fail options); `/ready` reads {@link
 * RateLimitBackend.status}.
 *
 * @param client - The ioredis client (its connection is closed by `close()`).
 * @returns A backend whose status is `ok` or `degraded`.
 */
export function createRedisBackend(client: RedisLimiterClient): RateLimitBackend {
  const limiters = new Map<string, ObservedRateLimiterRedis>();
  let degraded = false;
  let fallbackDecisions = 0;

  const enterDegraded = (err: unknown) => {
    if (degraded) return;
    degraded = true;
    log.warn(
      { store: 'redis', err },
      'Rate-limit store unavailable; falling back to per-process limits',
    );
  };

  client.on('error', (err) => enterDegraded(err));
  client.on('ready', () => {
    if (!degraded) return;
    degraded = false;
    log.info({ store: 'redis', fallbackDecisions }, 'Rate-limit store recovered');
    fallbackDecisions = 0;
  });

  return {
    kind: 'redis',
    limiter(policy) {
      let limiter = limiters.get(policy.id);
      if (!limiter) {
        limiter = new ObservedRateLimiterRedis({
          storeClient: client,
          points: policy.points,
          duration: policy.durationSec,
          keyPrefix: `${REDIS_KEY_ROOT}${policy.id}`,
          rejectIfRedisNotReady: true,
          insuranceLimiter: new RateLimiterMemory({
            points: policy.points,
            duration: policy.durationSec,
            keyPrefix: policy.id,
          }),
        });
        limiter.onStoreError = (err) => {
          fallbackDecisions += 1;
          enterDegraded(err);
        };
        limiters.set(policy.id, limiter);
      }
      return limiter;
    },
    status: () => (degraded ? 'degraded' : 'ok'),
    close() {
      limiters.clear();
      client.disconnect();
      return Promise.resolve();
    },
  };
}
