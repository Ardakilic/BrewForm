/**
 * Mock for src/utils/cache/index.ts
 * Redirected via import_map.json during deno test runs.
 *
 * The default behaviour is pass-through (calls fetcher, stores result)
 * so existing tests that don't interact with the cache keep passing.
 *
 * Test helpers:
 *   setCacheValue(key, value)   — force a cache hit
 *   getCacheCalls()            — inspect which keys were read/written
 *   resetCacheMock()           — clear state between tests
 *   simulateCacheError(true)   — make the next get/set throw
 */

import type { CacheKey, CacheOptions } from '../../utils/cache/types.ts';
export type { CacheKey, CacheOptions };
export { CacheKeys } from '../../utils/cache/keys.ts';

// ============================================
// In-process mock store
// ============================================

// deno-lint-ignore no-explicit-any
const _store = new Map<string, any>();

/**
 * When true, cacheGetOrSet is a pure pass-through (fetcher always called).
 * When false, the store is used as a cache.
 * Default is passthrough so existing tests don't accumulate stale state.
 */
let _passthrough = true;

interface CacheCall {
  op: 'get' | 'set' | 'invalidate' | 'getOrSet';
  key: unknown;
}

let _calls: CacheCall[] = [];
let _errorOnNext = false;
let _errorOnNextAll = false;
let _cacheConnectionResult = true;
let _mockPingResult = true;

function k(key: CacheKey): string {
  return JSON.stringify(key);
}

// ============================================
// Test helpers (exported for test assertions)
// ============================================

// deno-lint-ignore no-explicit-any
export function setCacheValue(key: CacheKey, value: any): void {
  _store.set(k(key), value);
}

export function getCacheCalls(): CacheCall[] {
  return [..._calls];
}

export function resetCacheMock(): void {
  _store.clear();
  _calls = [];
  _errorOnNext = false;
  _errorOnNextAll = false;
  _cacheConnectionResult = true;
  _mockPingResult = true;
  _passthrough = true;
}

/**
 * Enable store-backed caching in the mock (tests that explicitly want to
 * verify cache hit/miss behaviour should call this).
 */
export function enableCacheStore(): void {
  _passthrough = false;
}

export function simulateCacheError(enable: boolean): void {
  _errorOnNext = enable;
  _errorOnNextAll = enable;
}

export function setCacheConnectionResult(healthy: boolean): void {
  _cacheConnectionResult = healthy;
  _mockPingResult = healthy;
}

// ============================================
// Mock implementations
// ============================================

export function getCache() {
  return {
    get<T>(key: CacheKey): Promise<T | undefined> {
      _calls.push({ op: 'get', key });
      if (_errorOnNext) {
        _errorOnNext = false;
        return Promise.reject(new Error('Mock cache error'));
      }
      return Promise.resolve(_store.get(k(key)) as T | undefined);
    },
    getMany<T>(keys: readonly CacheKey[]): Promise<(T | undefined)[]> {
      return Promise.all(keys.map((key) => this.get<T>(key)));
    },
    set<T>(key: CacheKey, value: T, _opts?: CacheOptions): Promise<void> {
      _calls.push({ op: 'set', key });
      if (_errorOnNextAll) {
        _errorOnNextAll = false;
        return Promise.reject(new Error('Mock cache error'));
      }
      _store.set(k(key), value);
      return Promise.resolve();
    },
    setMany<T>(
      entries: readonly { key: CacheKey; value: T; options?: CacheOptions }[],
    ): Promise<void> {
      if (_errorOnNextAll) {
        _errorOnNextAll = false;
        return Promise.reject(new Error('Mock cache error'));
      }
      for (const e of entries) {
        _store.set(k(e.key), e.value);
      }
      return Promise.resolve();
    },
    delete(key: CacheKey): Promise<void> {
      _store.delete(k(key));
      return Promise.resolve();
    },
    invalidateByPrefix(prefix: CacheKey): Promise<number> {
      _calls.push({ op: 'invalidate', key: prefix });
      if (_errorOnNextAll) {
        _errorOnNextAll = false;
        return Promise.reject(new Error('Mock cache error'));
      }
      const prefixArr = JSON.parse(JSON.stringify(prefix));
      let count = 0;
      for (const storedKey of [..._store.keys()]) {
        const storedArr = JSON.parse(storedKey);
        if (
          Array.isArray(storedArr) &&
          prefixArr.length <= storedArr.length &&
          prefixArr.every((seg: unknown, i: number) => seg === storedArr[i])
        ) {
          _store.delete(storedKey);
          count++;
        }
      }
      return Promise.resolve(count);
    },
    has(key: CacheKey): Promise<boolean> {
      return Promise.resolve(_store.has(k(key)));
    },
    ping(): Promise<boolean> {
      return Promise.resolve(_mockPingResult);
    },
    close(): Promise<void> {
      return Promise.resolve();
    },
  };
}

export function initCache(_fallback?: boolean): Promise<void> {
  return Promise.resolve();
}

export function disconnectCache(): Promise<void> {
  return Promise.resolve();
}

export function checkCacheConnection(): Promise<boolean> {
  return Promise.resolve(_cacheConnectionResult);
}

export async function cacheGetOrSet<T>(
  key: CacheKey,
  fetcher: () => Promise<T>,
  _options?: CacheOptions,
): Promise<T> {
  _calls.push({ op: 'getOrSet', key });
  if (_errorOnNext) {
    _errorOnNext = false;
    throw new Error('Mock cache error');
  }
  if (!_passthrough) {
    const stored = _store.get(k(key));
    if (stored !== undefined) {
      return stored as T;
    }
  }
  const value = await fetcher();
  if (!_passthrough) {
    _store.set(k(key), value);
  }
  return value;
}

export async function cacheGetManyOrSet<T>(
  keys: readonly CacheKey[],
  fetcher: (missingKeys: readonly CacheKey[]) => Promise<T[]>,
  _options?: CacheOptions,
): Promise<T[]> {
  _calls.push({ op: 'getOrSet', key: keys });
  if (_errorOnNextAll) {
    _errorOnNextAll = false;
    throw new Error('Mock cache error');
  }
  if (_passthrough) {
    return await fetcher(keys);
  }
  const results: T[] = [];
  const missing: number[] = [];
  for (let i = 0; i < keys.length; i++) {
    const stored = _store.get(k(keys[i]));
    if (stored !== undefined) {
      results[i] = stored as T;
    } else {
      missing.push(i);
    }
  }
  if (missing.length > 0) {
    const fetched = await fetcher(missing.map((i) => keys[i]));
    for (let j = 0; j < missing.length; j++) {
      results[missing[j]] = fetched[j];
      _store.set(k(keys[missing[j]]), fetched[j]);
    }
  }
  return results;
}

export function invalidateCache(prefix: CacheKey): Promise<number> {
  _calls.push({ op: 'invalidate', key: prefix });
  if (_errorOnNextAll) {
    _errorOnNextAll = false;
    return Promise.reject(new Error('Mock cache error'));
  }
  const prefixArr = JSON.parse(JSON.stringify(prefix));
  let count = 0;
  for (const storedKey of [..._store.keys()]) {
    const storedArr = JSON.parse(storedKey);
    if (
      Array.isArray(storedArr) &&
      prefixArr.length <= storedArr.length &&
      prefixArr.every((seg: unknown, i: number) => seg === storedArr[i])
    ) {
      _store.delete(storedKey);
      count++;
    }
  }
  return Promise.resolve(count);
}

export default {
  getCache,
  initCache,
  disconnectCache,
  checkCacheConnection,
  cacheGetOrSet,
  cacheGetManyOrSet,
  invalidateCache,
  // test helpers
  resetCacheMock,
  enableCacheStore,
  setCacheValue,
  getCacheCalls,
  simulateCacheError,
  setCacheConnectionResult,
};
