/**
 * Abstraction over key-value caching (process-local or shared).
 * Services never construct a cache backend directly — they receive a CacheProvider
 * via Hono context injection. This ensures testability and DB portability (§6.2).
 *
 * Keys are string arrays for hierarchical namespacing,
 * e.g. ["taste-notes", "hierarchy"] or ["taste-notes", "search", "fruit"].
 */
import { createRedisProvider } from './redis.ts';

export interface CacheProvider {
  /** Retrieve a cached value by key. Returns null if missing or expired. */
  get<T>(key: string[]): Promise<T | null>;
  /** Store a value with optional TTL (milliseconds). Overwrites existing. */
  set<T>(key: string[], value: T, options?: { ttlMs?: number }): Promise<void>;
  /** Delete a single cache entry. */
  delete(key: string[]): Promise<void>;
  /** Delete all entries whose key starts with the given prefix. */
  deleteByPrefix(prefix: string[]): Promise<void>;
  /** Release underlying resources (no-op for process-local drivers). */
  close?(): Promise<void>;
}

/**
 * Process-local CacheProvider backed by a Map. Used in tests and when the
 * 'memory' driver is configured. Expired entries are evicted lazily on read.
 */
export class InMemoryCacheProvider implements CacheProvider {
  private store = new Map<string, { value: unknown; expiresAt: number | null }>();

  get<T>(key: string[]): Promise<T | null> {
    const k = key.join(':');
    const entry = this.store.get(k);
    if (!entry) return Promise.resolve(null);
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.store.delete(k);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value as T);
  }

  set<T>(key: string[], value: T, options?: { ttlMs?: number }): Promise<void> {
    const k = key.join(':');
    this.store.set(k, {
      value,
      expiresAt: options?.ttlMs ? Date.now() + options.ttlMs : null,
    });
    return Promise.resolve();
  }

  delete(key: string[]): Promise<void> {
    this.store.delete(key.join(':'));
    return Promise.resolve();
  }

  deleteByPrefix(prefix: string[]): Promise<void> {
    const p = prefix.join(':');
    for (const k of this.store.keys()) {
      if (k.startsWith(p)) {
        this.store.delete(k);
      }
    }
    return Promise.resolve();
  }
}

/**
 * No-op CacheProvider used when caching is disabled (CACHE_ENABLED=false).
 * All reads miss; all writes are dropped. Keeps consumers working unchanged.
 */
export class NullCacheProvider implements CacheProvider {
  get<T>(_key: string[]): Promise<T | null> {
    return Promise.resolve(null);
  }

  set<T>(_key: string[], _value: T, _options?: { ttlMs?: number }): Promise<void> {
    return Promise.resolve();
  }

  delete(_key: string[]): Promise<void> {
    return Promise.resolve();
  }

  deleteByPrefix(_prefix: string[]): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Factory selecting a CacheProvider by driver name ('memory' | 'redis').
 * Throws if the driver is unknown, or if 'redis' is selected without a URL.
 */
export function createCacheProvider(
  driver: string,
  options?: { redisUrl?: string },
): CacheProvider {
  switch (driver) {
    case 'memory':
      return new InMemoryCacheProvider();
    case 'redis': {
      if (!options?.redisUrl) throw new Error('REDIS_URL is required when CACHE_DRIVER is redis');
      return createRedisProvider(options.redisUrl);
    }
    default:
      throw new Error(`Unknown cache driver: ${driver}`);
  }
}
