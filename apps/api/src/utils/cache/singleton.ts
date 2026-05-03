import type { CacheProvider } from './index.ts';
import { InMemoryCacheProvider } from './index.ts';

/**
 * Global singleton cache provider.
 * Initialized in main.ts with the configured driver (deno-kv or memory).
 * Route modules import this reference directly to avoid circular deps with main.ts.
 */
export let cacheProvider: CacheProvider = new InMemoryCacheProvider();

export function setCacheProvider(provider: CacheProvider): void {
  cacheProvider = provider;
}
