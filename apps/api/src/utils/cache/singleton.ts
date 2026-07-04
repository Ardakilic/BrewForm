import type { CacheProvider } from './index.ts';
import { InMemoryCacheProvider } from './index.ts';

/**
 * Global singleton cache provider.
 * Initialized in main.ts with the configured driver (deno-kv or memory).
 * Route modules import this reference directly to avoid circular deps with main.ts.
 */
export let cacheProvider: CacheProvider = new InMemoryCacheProvider();

/**
 * Replace the global singleton cache provider. Called once from main.ts at
 * startup after the configured driver (deno-kv or memory) is constructed.
 */
export function setCacheProvider(provider: CacheProvider): void {
  cacheProvider = provider;
}
