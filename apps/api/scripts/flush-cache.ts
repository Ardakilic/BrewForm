/**
 * Clear all cache entries.
 *
 * Usage:
 *   pnpm --filter @brewform/api exec tsx scripts/flush-cache.ts
 *   make flush-cache
 *
 * The memory driver is process-local, so there is nothing shared to flush
 * from outside the process. With the redis driver this deletes every key in
 * the cache namespace `brewform:*` via SCAN (the cache provider's prefix
 * delete with an empty prefix). Rate-limit keys live under the separate root
 * `brewform-rl:*` and are intentionally untouched: flushing the cache must
 * never reset limiter counters, so this script never constructs a limiter
 * backend. With caching disabled (CACHE_ENABLED=false) there is nothing to
 * flush.
 *
 * The cache client fails fast while disconnected (no offline queue), so the
 * script waits for the connection to be ready (up to 10 s) before flushing,
 * and exits with status 1 if it cannot connect. It talks to the provider
 * directly rather than through the fail-soft wrapper, so an error is reported
 * instead of being swallowed.
 */
import 'dotenv/config';
import { config } from '../src/config/index.ts';
import { RedisCacheProvider, type RedisClient } from '../src/utils/cache/redis.ts';
import { createRedisClient } from '../src/utils/redis/client.ts';

/** How long to wait for the Redis connection before giving up. */
const READY_TIMEOUT_MS = 10_000;

if (!config.CACHE_ENABLED) {
  console.log('Cache is disabled (CACHE_ENABLED=false); nothing to flush.');
} else if (config.CACHE_DRIVER === 'redis') {
  const client = createRedisClient(config.REDIS_URL as string, {
    connectionName: 'brewform-flush-cache',
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Redis was not ready within ${READY_TIMEOUT_MS} ms`)),
        READY_TIMEOUT_MS,
      );
      client.once('ready', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    const provider = new RedisCacheProvider(client as unknown as RedisClient);
    await provider.deleteByPrefix([]);
    console.log('Redis cache flushed (brewform:* only; rate-limit keys brewform-rl:* untouched).');
  } catch (err) {
    console.error('Failed to flush the Redis cache:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    client.disconnect();
  }
} else {
  console.log('Memory cache driver is process-local; nothing to flush.');
}
