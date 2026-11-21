/**
 * Test helpers for cache providers: every provider created through
 * {@link testCache} is closed by {@link closeTestCaches}, so no test leaks an
 * `InMemoryCacheProvider` sweep timer. Register `afterEach(closeTestCaches)`
 * in files that create providers directly (providers installed with
 * `setCacheProvider` are closed when they are replaced).
 */
import { type InMemoryCacheOptions, InMemoryCacheProvider } from './index.ts';

const open: InMemoryCacheProvider[] = [];

/**
 * Create an in-memory provider that {@link closeTestCaches} will close.
 *
 * @param options - Optional entry cap and sweep interval.
 * @returns The new provider.
 */
export function testCache(options?: InMemoryCacheOptions): InMemoryCacheProvider {
  const cache = new InMemoryCacheProvider(options);
  open.push(cache);
  return cache;
}

/** Close every provider created by {@link testCache} since the last call. */
export async function closeTestCaches(): Promise<void> {
  for (const cache of open.splice(0)) await cache.close();
}
