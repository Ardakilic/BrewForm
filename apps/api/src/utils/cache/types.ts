/**
 * BrewForm Cache Module — Type Definitions
 */

/**
 * Array-based cache key that is backend-agnostic.
 * DenoKvBackend stores it natively; RedisBackend joins it with ':'.
 */
export type CacheKey = readonly (string | number)[];

export interface CacheOptions {
  /**
   * How long (in seconds) before the cached value is considered expired.
   * 0 or undefined = no expiry.
   */
  ttlSeconds?: number;
  /**
   * When set, the value is "fresh" for `staleWhileRevalidateSeconds` seconds.
   * Between that and `ttlSeconds`, the value is stale-but-usable and a
   * background refresh is triggered automatically.
   * Defaults to equal `ttlSeconds` (doubles total lifetime).
   */
  staleWhileRevalidateSeconds?: number;
}

/**
 * Internal storage envelope. Stored inside the cache backend so the cache
 * layer can implement stale-while-revalidate on top of any backend.
 */
export interface CacheEnvelope<T> {
  /** The cached value. */
  v: T;
  /** Unix millisecond timestamp after which the value is considered stale. */
  f: number;
}

/**
 * The pluggable cache backend interface.
 * All call-sites use this abstraction — never a driver directly.
 */
export interface CacheBackend {
  get<T>(key: CacheKey): Promise<T | undefined>;
  /** Batch read — single round trip (Deno KV getMany / Redis MGET). */
  getMany<T>(keys: readonly CacheKey[]): Promise<(T | undefined)[]>;
  set<T>(key: CacheKey, value: T, options?: CacheOptions): Promise<void>;
  /** Batch write — atomic or pipelined depending on backend. */
  setMany<T>(
    entries: readonly { key: CacheKey; value: T; options?: CacheOptions }[],
  ): Promise<void>;
  delete(key: CacheKey): Promise<void>;
  /** Delete all keys whose key array starts with `prefix`. Returns deleted count. */
  invalidateByPrefix(prefix: CacheKey): Promise<number>;
  has(key: CacheKey): Promise<boolean>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}
