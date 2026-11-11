/**
 * Redis-backed CacheProvider (shared service, e.g. multi-replica production).
 *
 * Uses ioredis and only standard Redis commands (GET, SET with PX, DEL, SCAN),
 * so it works against Redis and any protocol-compatible server (e.g. Valkey).
 * Values are JSON-serialized so complex objects survive the round-trip;
 * TTL maps 1:1 to PX (ms). Prefix deletes use SCAN (never KEYS — it blocks).
 */
import { Redis } from 'ioredis';
import type { CacheProvider } from './index.ts';

/** Minimal Redis command surface used by the provider (real client or test fake). */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: (string | number)[]): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  scanStream(options: { match: string; count: number }): AsyncIterable<string[]>;
  disconnect(): void;
}

export class RedisCacheProvider implements CacheProvider {
  private readonly client: RedisClient;

  constructor(client: RedisClient) {
    this.client = client;
  }

  /** Read a namespaced key; returns null when missing. */
  async get<T>(key: string[]): Promise<T | null> {
    const raw = await this.client.get(namespacedKey(key));
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  /** Write a namespaced key as JSON, with optional millisecond TTL (SET PX). */
  async set<T>(key: string[], value: T, options?: { ttlMs?: number }): Promise<void> {
    const k = namespacedKey(key);
    const v = JSON.stringify(value);
    if (options?.ttlMs) await this.client.set(k, v, 'PX', options.ttlMs);
    else await this.client.set(k, v);
  }

  /** Delete a single namespaced key. */
  async delete(key: string[]): Promise<void> {
    await this.client.del(namespacedKey(key));
  }

  /**
   * Delete all namespaced keys under the prefix via SCAN. The pattern is always
   * scoped to this app's namespace, so an empty prefix matches `brewform:*` and
   * never unrelated keys on a shared server.
   */
  async deleteByPrefix(prefix: string[]): Promise<void> {
    // shortcut: unbounded SCAN loop; upgrade to batched UNLINK past ~100k keys.
    const stream = this.client.scanStream({ match: namespacedPattern(prefix), count: 100 });
    for await (const keys of stream) {
      if (keys.length > 0) await this.client.del(...keys);
    }
  }

  /** Disconnect the underlying client. */
  async close(): Promise<void> {
    this.client.disconnect();
  }
}

/**
 * Prefix every key with the app namespace so this provider never collides with
 * (or deletes) unrelated keys on a shared Redis server.
 */
function namespacedKey(key: string[]): string {
  return `brewform:${key.join(':')}`;
}

/** SCAN pattern scoped to the app namespace (`brewform:*` for an empty prefix). */
function namespacedPattern(prefix: string[]): string {
  return `brewform:${prefix.join(':')}*`;
}

/** Build a Redis-backed provider from a URL (e.g. redis://redis:6379). */
export function createRedisProvider(url: string): RedisCacheProvider {
  return new RedisCacheProvider(new Redis(url) as unknown as RedisClient);
}
