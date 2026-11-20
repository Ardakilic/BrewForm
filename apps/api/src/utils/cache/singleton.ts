import type { CacheProvider, CacheStatus } from './index.ts';
import { InMemoryCacheProvider } from './index.ts';

/**
 * Global singleton cache provider.
 * Initialized in main.ts with the configured driver (memory | redis), or a
 * no-op provider when caching is disabled (CACHE_ENABLED=false).
 * Route modules import this reference directly to avoid circular deps with main.ts.
 * The default is a bounded in-memory provider whose sweep timer is `unref()`'d,
 * so it never keeps a process (or a test worker) alive.
 */
export let cacheProvider: CacheProvider = new InMemoryCacheProvider();

/**
 * Replace the global singleton cache provider. Called once from main.ts at
 * startup after the configured driver (memory | redis) is constructed, or a
 * no-op provider when caching is disabled (tests call it to swap providers).
 * The replaced provider is closed, so its sweep timer or connection never
 * outlives it.
 *
 * @param provider - The provider to install.
 */
export function setCacheProvider(provider: CacheProvider): void {
  const previous = cacheProvider;
  cacheProvider = provider;
  if (previous !== provider) void previous.close?.();
}

/**
 * Cache health for `/ready` (cache-driver spec, "Readiness reports cache and
 * rate-limit store health without failing").
 *
 * @returns `memory` (in-memory driver), `disabled` (`CACHE_ENABLED=false`),
 *   or `ok` / `degraded` for the fail-soft redis driver.
 */
export function getCacheStatus(): CacheStatus {
  return cacheProvider.status?.() ?? 'ok';
}
