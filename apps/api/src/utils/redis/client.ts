/**
 * Shared ioredis client factory for the cache driver and the rate limiter.
 *
 * Each caller opens its own connection, with fast-fail options so a dead or
 * slow Valkey/Redis never stalls a request (cache-driver spec, "Redis cache
 * connections fail fast"; api-rate-limiting, "Limiter degrades safely"):
 *
 * - `enableOfflineQueue: false`: commands fail at once while disconnected
 *   instead of queueing across reconnect attempts;
 * - `maxRetriesPerRequest: 1`: a command in flight when the connection drops
 *   is retried at most once;
 * - `commandTimeout: 500` ms and `connectTimeout: 2000` ms;
 * - ioredis's default `retryStrategy` (exponential backoff to 5 s), so the
 *   client keeps reconnecting in the background.
 *
 * The URL (which may carry a password) is never logged.
 */
import { Redis, type RedisOptions } from 'ioredis';
import { createLogger } from '../logger/index.ts';

/** Module logger (exported for test spies). */
export const log = createLogger('redis-client');

/** The fast-fail defaults applied to every client (see the module docblock). */
export const FAST_FAIL_REDIS_OPTIONS: Readonly<RedisOptions> = Object.freeze({
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  commandTimeout: 500,
  connectTimeout: 2000,
});

/**
 * Create an ioredis client with {@link FAST_FAIL_REDIS_OPTIONS}. `error`
 * events are logged at most once per disconnect cycle (re-armed on `ready`)
 * with `{ err, connection }`, so an outage does not flood the log; the
 * listener also keeps ioredis from reporting unhandled `error` events.
 *
 * @param url - Redis-protocol URL (`redis://[:password@]host:port[/db]`).
 * @param overrides - Extra or replacement ioredis options (e.g. `lazyConnect`,
 *   `connectionName`); they win over the defaults.
 * @returns The new client.
 */
export function createRedisClient(url: string, overrides: RedisOptions = {}): Redis {
  const client = new Redis(url, { ...FAST_FAIL_REDIS_OPTIONS, ...overrides });
  const connection = overrides.connectionName;
  let errorLogged = false;
  client.on('error', (err: Error) => {
    if (errorLogged) return;
    errorLogged = true;
    log.error({ err, connection }, 'createRedisClient connection error');
  });
  client.on('ready', () => {
    errorLogged = false;
  });
  return client;
}
