/**
 * Abstraction over key-value caching (process-local or shared).
 * Services never construct a cache backend directly — they receive a CacheProvider
 * via Hono context injection. This ensures testability and DB portability (§6.2).
 *
 * Keys are string arrays for hierarchical namespacing,
 * e.g. ["taste-notes", "hierarchy"] or ["taste-notes", "search", "fruit"].
 */
import { createValkeyProvider } from './valkey.ts';

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
 * Factory selecting a CacheProvider by driver name ('memory' | 'valkey').
 * Throws if the driver is unknown, or if 'valkey' is selected without a URL.
 */
export function createCacheProvider(
  driver: string,
  options?: { valkeyUrl?: string },
): CacheProvider {
  switch (driver) {
    case 'memory':
      return new InMemoryCacheProvider();
    case 'valkey': {
      if (!options?.valkeyUrl)
        throw new Error('VALKEY_URL is required when CACHE_DRIVER is valkey');
      return createValkeyProvider(options.valkeyUrl);
    }
    default:
      throw new Error(`Unknown cache driver: ${driver}`);
  }
}
