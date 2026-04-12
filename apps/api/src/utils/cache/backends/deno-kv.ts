/**
 * BrewForm Cache Module — Deno KV Backend
 *
 * Default backend. Ships with Deno, no extra deps.
 * Requires `"unstable": ["kv"]` in deno.json.
 */

import type { CacheBackend, CacheKey, CacheOptions } from '../types.ts';

/** Subset of config fields consumed by this backend. */
export interface DenoKvConfig {
  cacheDenoKvPath?: string;
}

/**
 * Convert a CacheKey array to a Deno KV key (same shape — no transformation needed).
 */
function toKvKey(key: CacheKey): Deno.KvKey {
  return key as unknown as Deno.KvKey;
}

export class DenoKvBackend implements CacheBackend {
  private kv: Deno.Kv | null = null;
  private readonly path: string | undefined;

  constructor(config: DenoKvConfig) {
    this.path = config.cacheDenoKvPath;
  }

  async init(): Promise<void> {
    this.kv = await Deno.openKv(this.path);
  }

  /** Returns the open KV instance or throws if not initialized. */
  private openKv(): Deno.Kv {
    if (!this.kv) {
      throw new Error('DenoKvBackend not initialized — call init() first');
    }
    return this.kv;
  }

  /** Total TTL = freshWindow + staleWindow (both managed via the envelope's `f` field). */
  private totalTtlMs(options?: CacheOptions): number | undefined {
    const ttl = options?.ttlSeconds ?? 0;
    const swr = options?.staleWhileRevalidateSeconds ?? ttl;
    const total = ttl + swr;
    return total > 0 ? total * 1000 : undefined;
  }

  async get<T>(key: CacheKey): Promise<T | undefined> {
    const kv = this.openKv();
    const entry = await kv.get<T>(toKvKey(key));
    return entry.value ?? undefined;
  }

  async getMany<T>(keys: readonly CacheKey[]): Promise<(T | undefined)[]> {
    const kv = this.openKv();
    const kvKeys = keys.map(toKvKey) as Parameters<typeof kv.getMany>[0];
    const CHUNK_SIZE = 10;
    const results: (T | undefined)[] = new Array(keys.length).fill(undefined);

    for (let i = 0; i < kvKeys.length; i += CHUNK_SIZE) {
      const chunk = kvKeys.slice(i, i + CHUNK_SIZE);
      const entries = await kv.getMany(
        chunk as Parameters<typeof kv.getMany>[0],
      );
      for (let j = 0; j < entries.length; j++) {
        results[i + j] = (entries[j].value as T) ?? undefined;
      }
    }

    return results;
  }

  async set<T>(key: CacheKey, value: T, options?: CacheOptions): Promise<void> {
    const kv = this.openKv();
    const expireIn = this.totalTtlMs(options);
    await kv.set(toKvKey(key), value, expireIn ? { expireIn } : undefined);
  }

  async setMany<T>(
    entries: readonly { key: CacheKey; value: T; options?: CacheOptions }[],
  ): Promise<void> {
    const BATCH_SIZE = 1000;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const chunk = entries.slice(i, i + BATCH_SIZE);
      const kv = this.openKv();
      let atomic = kv.atomic();
      for (const e of chunk) {
        const expireIn = this.totalTtlMs(e.options);
        atomic = atomic.set(
          toKvKey(e.key),
          e.value,
          expireIn ? { expireIn } : undefined,
        );
      }
      await atomic.commit();
    }
  }

  async delete(key: CacheKey): Promise<void> {
    const kv = this.openKv();
    await kv.delete(toKvKey(key));
  }

  async invalidateByPrefix(prefix: CacheKey): Promise<number> {
    const kv = this.openKv();
    const BATCH_SIZE = 1000;
    let count = 0;
    const iter = kv.list({ prefix: toKvKey(prefix) });
    const batch: Deno.KvKey[] = [];

    for await (const entry of iter) {
      batch.push(entry.key);
      if (batch.length >= BATCH_SIZE) {
        let atomic = kv.atomic();
        for (const k of batch) atomic = atomic.delete(k);
        await atomic.commit();
        count += batch.length;
        batch.length = 0;
      }
    }

    if (batch.length > 0) {
      let atomic = kv.atomic();
      for (const k of batch) atomic = atomic.delete(k);
      await atomic.commit();
      count += batch.length;
    }

    return count;
  }

  async has(key: CacheKey): Promise<boolean> {
    const kv = this.openKv();
    const entry = await kv.get(toKvKey(key));
    return entry.value !== null;
  }

  async ping(): Promise<boolean> {
    try {
      const kv = this.openKv();
      await kv.get(['__ping__']);
      return true;
    } catch {
      return false;
    }
  }

  close(): Promise<void> {
    if (this.kv) {
      this.kv.close();
      this.kv = null;
    }
    return Promise.resolve();
  }
}
