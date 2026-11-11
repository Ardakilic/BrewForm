/**
 * Clear all cache entries.
 *
 * Usage:
 *   pnpm --filter @brewform/api exec tsx scripts/flush-cache.ts
 *   make flush-cache
 *
 * The memory driver is process-local, so there is nothing shared to flush
 * from outside the process. With the redis driver this deletes every key
 * via SCAN (reusing the provider's prefix-delete with an empty prefix).
 * With caching disabled (CACHE_ENABLED=false) there is nothing to flush.
 */
import 'dotenv/config';
import { config } from '../src/config/index.ts';
import { createCacheProvider } from '../src/utils/cache/index.ts';

if (!config.CACHE_ENABLED) {
  console.log('Cache is disabled (CACHE_ENABLED=false); nothing to flush.');
} else if (config.CACHE_DRIVER === 'redis') {
  const provider = createCacheProvider('redis', { redisUrl: config.REDIS_URL });
  await provider.deleteByPrefix([]);
  await provider.close?.();
  console.log('Redis cache flushed.');
} else {
  console.log('Memory cache driver is process-local; nothing to flush.');
}
