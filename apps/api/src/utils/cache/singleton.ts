import type { CacheProvider } from './index.ts';
import { InMemoryCacheProvider } from './index.ts';

/**
 * Global singleton cache provider.
 * Initialized in main.ts with the configured driver (memory | redis), or a
 * no-op provider when caching is disabled (CACHE_ENABLED=false).
 * Route modules import this reference directly to avoid circular deps with main.ts.
 */
export let cacheProvider: CacheProvider = new InMemoryCacheProvider();

/**
 * Replace the global singleton cache provider. Called once from main.ts at
 * startup after the configured driver (memory | redis) is constructed, or a
 * no-op provider when caching is disabled.
 */
export function setCacheProvider(provider: CacheProvider): void {
  cacheProvider = provider;
}
