/**
 * Abstraction over Deno KV / in-memory caching.
 * Services never call Deno.openKv() directly — they receive a CacheProvider
 * via Hono context injection. This ensures testability and DB portability (§6.2).
 *
 * Keys are string arrays (Deno KV atomic keys) for hierarchical namespacing,
 * e.g. ["taste-notes", "hierarchy"] or ["taste-notes", "search", "fruit"].
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
}

export class DenoKVCacheProvider implements CacheProvider {
  private kv: Deno.Kv;

  constructor(kv: Deno.Kv) {
    this.kv = kv;
  }

  async get<T>(key: string[]): Promise<T | null> {
    const result = await this.kv.get(key);
    return result.value as T | null;
  }

  async set<T>(key: string[], value: T, options?: { ttlMs?: number }): Promise<void> {
    await this.kv.set(key, value, options?.ttlMs ? { expireIn: options.ttlMs } : {});
  }

  async delete(key: string[]): Promise<void> {
    await this.kv.delete(key);
  }

  async deleteByPrefix(prefix: string[]): Promise<void> {
    const entries = this.kv.list({ prefix });
    for await (const entry of entries) {
      await this.kv.delete(entry.key);
    }
  }
}

export class InMemoryCacheProvider implements CacheProvider {
  private store = new Map<string, { value: unknown; expiresAt: number | null }>();

  async get<T>(key: string[]): Promise<T | null> {
    const k = key.join(':');
    const entry = this.store.get(k);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.store.delete(k);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string[], value: T, options?: { ttlMs?: number }): Promise<void> {
    const k = key.join(':');
    this.store.set(k, {
      value,
      expiresAt: options?.ttlMs ? Date.now() + options.ttlMs : null,
    });
  }

  async delete(key: string[]): Promise<void> {
    this.store.delete(key.join(':'));
  }

  async deleteByPrefix(prefix: string[]): Promise<void> {
    const p = prefix.join(':');
    for (const k of this.store.keys()) {
      if (k.startsWith(p)) {
        this.store.delete(k);
      }
    }
  }
}

export function createCacheProvider(driver: string, kv?: Deno.Kv): CacheProvider {
  switch (driver) {
    case 'deno-kv':
      if (!kv) throw new Error('Deno.Kv instance required for deno-kv cache driver');
      return new DenoKVCacheProvider(kv);
    case 'memory':
      return new InMemoryCacheProvider();
    default:
      throw new Error(`Unknown cache driver: ${driver}`);
  }
}
