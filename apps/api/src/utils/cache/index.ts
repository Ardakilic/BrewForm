/**
 * BrewForm Cache Module — Public API
 *
 * All call-sites import from this barrel.  Never import backend classes directly.
 *
 * Features:
 *   - Pluggable backends: Deno KV (default) or Redis (opt-in via CACHE_DRIVER)
 *   - Stale-while-revalidate (SWR) enabled by default
 *   - Single-flight / stampede protection per key (in-process)
 *   - Fail-open reads: cache errors never break a request
 */

import { getConfig } from "../../config/index.ts";
import { getLogger } from "../logger/index.ts";
import { createCache } from "./factory.ts";
import { MemoryBackend } from "./backends/memory.ts";
import type {
  CacheBackend,
  CacheEnvelope,
  CacheKey,
  CacheOptions,
} from "./types.ts";

export type { CacheBackend, CacheKey, CacheOptions };
export { CacheKeys } from "./keys.ts";

// ============================================
// Singleton
// ============================================

let _instance: CacheBackend | null = null;

/**
 * Get the singleton cache backend.
 * Throws if `initCache()` has not been called.
 */
export function getCache(): CacheBackend {
  if (!_instance) {
    throw new Error("Cache not initialized — call initCache() during startup");
  }
  return _instance;
}

/**
 * Initialise the cache backend.
 * Must be called once at application startup, before any cache operations.
 *
 * @param fallbackToMemory If true (default false), a failing backend init
 *   falls back to the in-memory backend instead of throwing.
 */
export async function initCache(fallbackToMemory = false): Promise<void> {
  const cfg = getConfig();
  const logger = getLogger();

  try {
    _instance = await createCache(cfg);
    logger.info(
      { type: "cache", driver: cfg.cacheDriver },
      "Cache backend initialized",
    );
  } catch (err) {
    if (cfg.cacheRequired) {
      throw err;
    }
    logger.warn(
      {
        type: "cache",
        driver: cfg.cacheDriver,
        error: err instanceof Error ? err.message : String(err),
      },
      "Cache backend failed to initialize — falling back to in-memory cache",
    );
    if (fallbackToMemory) {
      _instance = new MemoryBackend();
    }
  }
}

/**
 * Disconnect and clear the cache singleton.
 * Called during graceful shutdown.
 */
export async function disconnectCache(): Promise<void> {
  await _instance?.close();
  _instance = null;
}

/**
 * Returns true if the cache backend is reachable.
 */
export async function checkCacheConnection(): Promise<boolean> {
  try {
    return await (_instance?.ping() ?? Promise.resolve(false));
  } catch {
    return false;
  }
}

// ============================================
// Single-flight / Stampede Protection
// ============================================

// deno-lint-ignore no-explicit-any
const _inFlight = new Map<string, Promise<any>>();

function keyStr(key: CacheKey): string {
  return JSON.stringify(key);
}

// ============================================
// SWR Helper
// ============================================

function buildEnvelope<T>(value: T, options?: CacheOptions): CacheEnvelope<T> {
  const ttl = options?.ttlSeconds ?? 0;
  const freshWindow = options?.staleWhileRevalidateSeconds ?? ttl;
  return {
    v: value,
    f: ttl > 0 ? Date.now() + freshWindow * 1000 : Infinity,
  };
}

// ============================================
// cacheGetOrSet — the primary helper
// ============================================

/**
 * Read-through cache with stale-while-revalidate and stampede protection.
 *
 * - On miss: calls `fetcher`, stores result, returns value.
 * - On fresh hit: returns cached value without calling fetcher.
 * - On stale hit: returns stale value immediately AND schedules a background
 *   refresh via queueMicrotask.
 * - On cache error: logs a warning and falls through to fetcher (fail-open).
 *
 * @param key      Cache key (use CacheKeys factory).
 * @param fetcher  Async function that produces the fresh value.
 * @param options  TTL and SWR options.
 */
export async function cacheGetOrSet<T>(
  key: CacheKey,
  fetcher: () => Promise<T>,
  options?: CacheOptions,
): Promise<T> {
  const logger = getLogger();
  const k = keyStr(key);

  // --- Try cache read ---
  let envelope: CacheEnvelope<T> | undefined;
  try {
    envelope = await getCache().get<CacheEnvelope<T>>(key);
  } catch (err) {
    logger.warn(
      {
        type: "cache",
        event: "cache_error",
        key,
        error: (err as Error).message,
      },
      "Cache get error — falling through to fetcher",
    );
  }

  if (envelope !== undefined) {
    const isFresh = Date.now() < envelope.f;

    if (isFresh) {
      logger.debug({ type: "cache", event: "cache_hit", key }, "Cache hit");
      return envelope.v;
    }

    // Stale — return immediately, refresh in background
    logger.debug(
      { type: "cache", event: "cache_stale", key },
      "Cache stale — background refresh",
    );
    scheduleBackgroundRefresh(key, fetcher, options, k);
    return envelope.v;
  }

  logger.debug({ type: "cache", event: "cache_miss", key }, "Cache miss");

  // --- Single-flight ---
  const existing = _inFlight.get(k);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = (async () => {
    const value = await fetcher();
    try {
      await getCache().set(key, buildEnvelope(value, options), options);
    } catch (err) {
      logger.warn(
        {
          type: "cache",
          event: "cache_set_error",
          key,
          error: (err as Error).message,
        },
        "Cache set error — value still returned",
      );
    }
    return value;
  })().finally(() => {
    _inFlight.delete(k);
  });

  _inFlight.set(k, promise);
  return promise;
}

function scheduleBackgroundRefresh<T>(
  key: CacheKey,
  fetcher: () => Promise<T>,
  options: CacheOptions | undefined,
  k: string,
) {
  const logger = getLogger();
  // De-duplicate concurrent background refreshes
  if (_inFlight.has(k)) return;

  const promise = (async () => {
    try {
      const value = await fetcher();
      await getCache().set(key, buildEnvelope(value, options), options);
      logger.debug(
        { type: "cache", event: "cache_swr_refresh", key },
        "Background SWR refresh",
      );
    } catch (err) {
      logger.warn(
        {
          type: "cache",
          event: "cache_swr_error",
          key,
          error: (err as Error).message,
        },
        "Background SWR refresh failed",
      );
    }
  })().finally(() => {
    _inFlight.delete(k);
  });

  _inFlight.set(k, promise);
  queueMicrotask(() => promise);
}

// ============================================
// cacheGetManyOrSet — batched read-through
// ============================================

/**
 * Batched read-through. Makes a single cache round trip for the read.
 * `fetcher` receives only the keys that missed and must return results
 * aligned by index. One batch write-back for the misses.
 */
export async function cacheGetManyOrSet<T>(
  keys: readonly CacheKey[],
  fetcher: (missingKeys: readonly CacheKey[]) => Promise<T[]>,
  options?: CacheOptions,
): Promise<T[]> {
  const logger = getLogger();
  const results: (T | undefined)[] = new Array(keys.length).fill(undefined);
  const missingIndices: number[] = [];

  // Batch read
  let envelopes: (CacheEnvelope<T> | undefined)[] = [];
  try {
    envelopes = await getCache().getMany<CacheEnvelope<T>>(keys);
  } catch (err) {
    logger.warn(
      { type: "cache", event: "cache_error", error: (err as Error).message },
      "Cache getMany error — fetching all from source",
    );
    envelopes = new Array(keys.length).fill(undefined);
  }

  const now = Date.now();
  for (let i = 0; i < keys.length; i++) {
    const env = envelopes[i];
    if (env !== undefined && now < env.f) {
      results[i] = env.v;
    } else {
      missingIndices.push(i);
    }
  }

  if (missingIndices.length === 0) {
    return results as T[];
  }

  const missingKeys = missingIndices.map((i) => keys[i]);
  const fetched = await fetcher(missingKeys);

  // Write back
  const writeEntries: {
    key: CacheKey;
    value: CacheEnvelope<T>;
    options?: CacheOptions;
  }[] = [];
  for (let j = 0; j < missingIndices.length; j++) {
    const idx = missingIndices[j];
    results[idx] = fetched[j];
    writeEntries.push({
      key: keys[idx],
      value: buildEnvelope(fetched[j], options),
      options,
    });
  }

  try {
    await getCache().setMany(writeEntries);
  } catch (err) {
    logger.warn(
      {
        type: "cache",
        event: "cache_set_error",
        error: (err as Error).message,
      },
      "Cache setMany error — values still returned",
    );
  }

  return results as T[];
}

// ============================================
// invalidateCache — prefix-based invalidation
// ============================================

/**
 * Invalidate all cache entries whose key starts with `prefix`.
 * Errors are logged and swallowed (TTLs will expire stale entries eventually).
 */
export async function invalidateCache(prefix: CacheKey): Promise<number> {
  const logger = getLogger();
  try {
    const count = await getCache().invalidateByPrefix(prefix);
    logger.debug(
      { type: "cache", event: "cache_invalidate", prefix, count },
      "Cache invalidated",
    );
    return count;
  } catch (err) {
    logger.warn(
      {
        type: "cache",
        event: "cache_invalidate_error",
        prefix,
        error: (err as Error).message,
      },
      "Cache invalidation failed",
    );
    return 0;
  }
}
