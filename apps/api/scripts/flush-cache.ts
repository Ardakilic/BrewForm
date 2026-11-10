/**
 * Clear all cache entries.
 *
 * Usage:
 *   pnpm --filter @brewform/api exec tsx scripts/flush-cache.ts
 *   make flush-cache
 *
 * The memory driver is process-local, so there is nothing shared to flush
 * from outside the process. With the valkey driver this deletes every key
 * via SCAN (reusing the provider's prefix-delete with an empty prefix).
 */
import 'dotenv/config';
import { config } from '../src/config/index.ts';
import { createCacheProvider } from '../src/utils/cache/index.ts';

if (config.CACHE_DRIVER === 'valkey') {
  const provider = createCacheProvider('valkey', { valkeyUrl: config.VALKEY_URL });
  await provider.deleteByPrefix([]);
  await provider.close?.();
  console.log('Valkey cache flushed.');
} else {
  console.log('Memory cache driver is process-local; nothing to flush.');
}
