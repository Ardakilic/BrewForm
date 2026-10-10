/**
 * Clear all cache entries.
 *
 * Usage:
 *   pnpm --filter @brewform/api exec tsx scripts/flush-cache.ts
 *   make flush-cache
 *
 * The API uses a process-local in-memory cache, so there is nothing shared to
 * flush from outside the process. This script is a no-op kept so
 * `make flush-cache` keeps working.
 */

console.log('Memory cache driver is process-local; nothing to flush.');
