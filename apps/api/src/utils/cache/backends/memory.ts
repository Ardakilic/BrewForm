/**
 * BrewForm Cache Module — In-Memory Backend
 *
 * Backed by a plain Map<string, ...>. Used exclusively in tests
 * (NODE_ENV=test) — never selectable via CACHE_DRIVER in production.
 */

import type { CacheBackend, CacheKey, CacheOptions } from "../types.ts";
import { keyToString, prefixToPattern } from "../serialize.ts";

interface MemoryEntry {
  value: unknown;
  expiresAt?: number; // unix ms
}

export class MemoryBackend implements CacheBackend {
  private readonly store = new Map<string, MemoryEntry>();

  private isExpired(entry: MemoryEntry): boolean {
    return entry.expiresAt !== undefined && Date.now() > entry.expiresAt;
  }

  get<T>(key: CacheKey): Promise<T | undefined> {
    const k = keyToString(key);
    const entry = this.store.get(k);
    if (!entry || this.isExpired(entry)) {
      this.store.delete(k);
      return Promise.resolve(undefined);
    }
    return Promise.resolve(entry.value as T);
  }

  getMany<T>(keys: readonly CacheKey[]): Promise<(T | undefined)[]> {
    return Promise.all(keys.map((k) => this.get<T>(k)));
  }

  set<T>(key: CacheKey, value: T, options?: CacheOptions): Promise<void> {
    const swr = options?.staleWhileRevalidateSeconds ?? options?.ttlSeconds ??
      0;
    const ttl = (options?.ttlSeconds ?? 0) + swr;
    this.store.set(keyToString(key), {
      value,
      expiresAt: ttl > 0 ? Date.now() + ttl * 1000 : undefined,
    });
    return Promise.resolve();
  }

  async setMany<T>(
    entries: readonly { key: CacheKey; value: T; options?: CacheOptions }[],
  ): Promise<void> {
    await Promise.all(entries.map((e) => this.set(e.key, e.value, e.options)));
  }

  delete(key: CacheKey): Promise<void> {
    this.store.delete(keyToString(key));
    return Promise.resolve();
  }

  invalidateByPrefix(prefix: CacheKey): Promise<number> {
    const pattern = prefixToPattern(prefix);
    const matchPrefix = pattern === "*" ? "" : pattern.slice(0, -1);

    let count = 0;
    for (const k of this.store.keys()) {
      if (
        matchPrefix === "" || k === matchPrefix ||
        k.startsWith(matchPrefix + ":")
      ) {
        this.store.delete(k);
        count++;
      }
    }
    return Promise.resolve(count);
  }

  has(key: CacheKey): Promise<boolean> {
    const entry = this.store.get(keyToString(key));
    if (!entry || this.isExpired(entry)) return Promise.resolve(false);
    return Promise.resolve(true);
  }

  ping(): Promise<boolean> {
    return Promise.resolve(true);
  }

  close(): Promise<void> {
    this.store.clear();
    return Promise.resolve();
  }

  /** Test helper — expose underlying store size. */
  get size(): number {
    return this.store.size;
  }

  /** Test helper — clear all entries. */
  clear(): void {
    this.store.clear();
  }
}
