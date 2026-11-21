/**
 * Abstraction over key-value caching (process-local or shared).
 * Services never construct a cache backend directly — they use the process-wide
 * `cacheProvider` singleton (`singleton.ts`), which `main.ts` installs once at
 * startup from `CACHE_ENABLED` / `CACHE_DRIVER` (cache-driver spec). This keeps
 * services testable (tests swap the provider with `setCacheProvider`).
 *
 * Drivers: the bounded {@link InMemoryCacheProvider} (LRU cap
 * `CACHE_MEMORY_MAX_ENTRIES` plus a periodic expiry sweep), the redis driver
 * wrapped in `FailSoftCacheProvider` (a backend failure becomes a miss), and
 * {@link NullCacheProvider} when caching is disabled. Rate limiting never uses
 * the cache (it has its own backend, see `utils/rate-limit/`).
 *
 * Keys are string arrays for hierarchical namespacing,
 * e.g. ["taste-notes", "hierarchy"] or ["taste-notes", "search", "fruit"].
 */
import { config } from '../../config/index.ts';
import { createLogger } from '../logger/index.ts';
import { FailSoftCacheProvider } from './failSoft.ts';
import { createRedisProvider } from './redis.ts';

/** Module logger (sweep statistics only; never keys or values). */
const log = createLogger('cache');

/** Cache health reported by `/ready`. */
export type CacheStatus = 'ok' | 'degraded' | 'memory' | 'disabled';

/**
 * Key/value cache contract injected into requests (`c.get('cache')`) and services; implemented
 * by the memory, Redis and {@link NullCacheProvider} backends and built by
 * {@link createCacheProvider}. Never construct a backend directly — go through this interface.
 */
export interface CacheProvider {
  /** Retrieve a cached value by key. Returns null if missing or expired. */
  get<T>(key: string[]): Promise<T | null>;
  /** Store a value with optional TTL (milliseconds). Overwrites existing. */
  set<T>(key: string[], value: T, options?: { ttlMs?: number }): Promise<void>;
  /** Delete a single cache entry. */
  delete(key: string[]): Promise<void>;
  /** Delete all entries whose key starts with the given prefix. */
  deleteByPrefix(prefix: string[]): Promise<void>;
  /** Release underlying resources (timers, connections). */
  close?(): Promise<void>;
  /** Health for `/ready`: `memory`, `disabled`, or `ok` / `degraded` for a shared backend. */
  status?(): CacheStatus;
}

/** Options for {@link InMemoryCacheProvider}. */
export interface InMemoryCacheOptions {
  /** Entry cap; the least-recently-used entry is evicted above it (default 10 000). */
  maxEntries?: number;
  /** Interval of the expiry sweep in milliseconds (default 60 000). */
  sweepIntervalMs?: number;
}

/** Default entry cap of {@link InMemoryCacheProvider} (`CACHE_MEMORY_MAX_ENTRIES` default). */
export const DEFAULT_MEMORY_MAX_ENTRIES = 10_000;

/**
 * Process-local CacheProvider backed by a Map, bounded in two ways
 * (cache-driver spec, "In-memory cache is bounded"):
 *
 * - an LRU cap: a successful `get` re-inserts the key (Map order = recency) and
 *   a `set` of a new key at the cap evicts the oldest key; overwriting an
 *   existing key never evicts;
 * - a periodic sweep on an `unref()`'d interval that removes expired entries
 *   nobody reads again (expired entries also read as missing in between).
 *
 * `close()` clears the timer and the store. Used for the 'memory' driver and as
 * the default singleton.
 */
export class InMemoryCacheProvider implements CacheProvider {
  private readonly store = new Map<string, { value: unknown; expiresAt: number | null }>();
  private readonly maxEntries: number;
  private sweepTimer: ReturnType<typeof setInterval> | null;

  /**
   * @param options - Entry cap and sweep interval (see {@link InMemoryCacheOptions}).
   */
  constructor(options: InMemoryCacheOptions = {}) {
    this.maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MEMORY_MAX_ENTRIES);
    this.sweepTimer = setInterval(() => this.sweep(), options.sweepIntervalMs ?? 60_000);
    // Never keep the process alive just for the sweep.
    this.sweepTimer.unref?.();
  }

  /** Number of stored entries (expired ones included until swept or read). */
  get size(): number {
    return this.store.size;
  }

  /** Read a key; returns null when missing or expired, and marks a hit as most recently used. */
  get<T>(key: string[]): Promise<T | null> {
    const k = key.join(':');
    const entry = this.store.get(k);
    if (!entry) return Promise.resolve(null);
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(k);
      return Promise.resolve(null);
    }
    this.store.delete(k);
    this.store.set(k, entry);
    return Promise.resolve(entry.value as T);
  }

  /**
   * Write a key with optional millisecond TTL. A new key at the cap evicts the
   * least-recently-used entry; overwriting an existing key does not evict.
   */
  set<T>(key: string[], value: T, options?: { ttlMs?: number }): Promise<void> {
    const k = key.join(':');
    if (this.store.has(k)) {
      this.store.delete(k);
    } else if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
    this.store.set(k, {
      value,
      expiresAt: options?.ttlMs ? Date.now() + options.ttlMs : null,
    });
    return Promise.resolve();
  }

  /**
   * Remove every expired entry. Logs `{ swept, size }` at debug level only when
   * something was removed (never per entry).
   *
   * @returns The number of removed entries.
   */
  sweep(): number {
    const now = Date.now();
    let swept = 0;
    for (const [k, entry] of this.store) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.store.delete(k);
        swept += 1;
      }
    }
    if (swept > 0) log.debug({ swept, size: this.store.size }, 'InMemoryCacheProvider sweep');
    return swept;
  }

  /** Delete a single key. */
  delete(key: string[]): Promise<void> {
    this.store.delete(key.join(':'));
    return Promise.resolve();
  }

  /** Delete all keys whose joined form starts with the joined prefix. */
  deleteByPrefix(prefix: string[]): Promise<void> {
    const p = prefix.join(':');
    for (const k of this.store.keys()) {
      if (k.startsWith(p)) {
        this.store.delete(k);
      }
    }
    return Promise.resolve();
  }

  /** Stop the sweep timer and drop every entry. */
  close(): Promise<void> {
    if (this.sweepTimer !== null) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    this.store.clear();
    return Promise.resolve();
  }

  /** Always `memory` (process-local). */
  status(): CacheStatus {
    return 'memory';
  }
}

/**
 * No-op CacheProvider used when caching is disabled (CACHE_ENABLED=false).
 * All reads miss; all writes are dropped. Keeps consumers working unchanged.
 */
export class NullCacheProvider implements CacheProvider {
  /** Always miss (caching disabled). */
  get<T>(_key: string[]): Promise<T | null> {
    return Promise.resolve(null);
  }

  /** Drop the write (caching disabled). */
  set<T>(_key: string[], _value: T, _options?: { ttlMs?: number }): Promise<void> {
    return Promise.resolve();
  }

  /** No-op (caching disabled). */
  delete(_key: string[]): Promise<void> {
    return Promise.resolve();
  }

  /** No-op (caching disabled). */
  deleteByPrefix(_prefix: string[]): Promise<void> {
    return Promise.resolve();
  }

  /** Always `disabled`. */
  status(): CacheStatus {
    return 'disabled';
  }
}

/**
 * Factory selecting a CacheProvider by driver name ('memory' | 'redis').
 * `memory` is bounded by `CACHE_MEMORY_MAX_ENTRIES`; `redis` is a
 * {@link FailSoftCacheProvider} around the Redis provider (fast-fail client).
 * Throws if the driver is unknown, or if 'redis' is selected without a URL.
 *
 * @param driver - `memory` or `redis`.
 * @param options - `redisUrl` for the redis driver.
 * @returns The provider to install with `setCacheProvider`.
 */
export function createCacheProvider(
  driver: string,
  options?: { redisUrl?: string },
): CacheProvider {
  switch (driver) {
    case 'memory':
      return new InMemoryCacheProvider({ maxEntries: config.CACHE_MEMORY_MAX_ENTRIES });
    case 'redis': {
      if (!options?.redisUrl) throw new Error('REDIS_URL is required when CACHE_DRIVER is redis');
      return new FailSoftCacheProvider(createRedisProvider(options.redisUrl));
    }
    default:
      throw new Error(`Unknown cache driver: ${driver}`);
  }
}
