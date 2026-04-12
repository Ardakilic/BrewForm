/**
 * BrewForm Cache Module — Redis Backend
 *
 * Optional backend. Selected by CACHE_DRIVER=redis.
 * Requires the `redis` npm package (optionalDependencies in apps/api/package.json).
 * Hard-fails at startup if the package is missing — no silent fallback.
 *
 * Uses node-redis v4 API (createClient, connect, get/set/mGet, etc.)
 */

import type { CacheBackend, CacheKey, CacheOptions } from '../types.ts';
import { keyToString, prefixToPattern } from '../serialize.ts';
import { getLogger } from '../../logger/index.ts';

export interface RedisConfig {
  cacheRedisUrl: string;
  cacheRedisPassword?: string;
}

// deno-lint-ignore no-explicit-any
type RedisClient = any;

export class RedisBackend implements CacheBackend {
  private client!: RedisClient;
  private readonly config: RedisConfig;

  constructor(config: RedisConfig) {
    this.config = config;
  }

  async init(): Promise<void> {
    const logger = getLogger();
    let redisModule: RedisClient;

    try {
      redisModule = await import('redis');
    } catch {
      throw new Error(
          "CACHE_DRIVER=redis but the 'redis' package is not installed. " +
          'To fix: (1) add it with `deno add npm:redis` or install the optional npm dependencies, ' +
          '(2) ensure Redis is reachable at CACHE_REDIS_URL, ' +
          'or (3) set CACHE_DRIVER=deno-kv to use the built-in backend.',
        );
    }

    this.client = redisModule.createClient({
      url: this.config.cacheRedisUrl,
      password: this.config.cacheRedisPassword || undefined,
    });

    this.client.on('error', (err: Error) => {
      logger.warn(
        { type: 'cache', backend: 'redis', error: err.message },
        'Redis client error',
      );
    });

    await this.client.connect();
    logger.info({ type: 'cache', backend: 'redis' }, 'Redis cache connected');
  }

  private toKey(key: CacheKey): string {
    return keyToString(key);
  }

  async get<T>(key: CacheKey): Promise<T | undefined> {
    const raw = await this.client.get(this.toKey(key));
    if (raw === null || raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async getMany<T>(keys: readonly CacheKey[]): Promise<(T | undefined)[]> {
    if (keys.length === 0) return [];
    const rawValues: (string | null)[] = await this.client.mGet(
      keys.map(this.toKey.bind(this)),
    );
    return rawValues.map((raw) => {
      if (raw === null || raw === undefined) return undefined;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return undefined;
      }
    });
  }

  async set<T>(key: CacheKey, value: T, options?: CacheOptions): Promise<void> {
    const ttl = (options?.ttlSeconds ?? 0) +
      (options?.staleWhileRevalidateSeconds ?? options?.ttlSeconds ?? 0);
    const serialized = JSON.stringify(value);
    if (ttl > 0) {
      await this.client.set(this.toKey(key), serialized, { EX: ttl });
    } else {
      await this.client.set(this.toKey(key), serialized);
    }
  }

  async setMany<T>(
    entries: readonly { key: CacheKey; value: T; options?: CacheOptions }[],
  ): Promise<void> {
    if (entries.length === 0) return;
    const multi = this.client.multi();
    for (const e of entries) {
      const ttl = (e.options?.ttlSeconds ?? 0) +
        (e.options?.staleWhileRevalidateSeconds ?? e.options?.ttlSeconds ?? 0);
      const serialized = JSON.stringify(e.value);
      if (ttl > 0) {
        multi.set(this.toKey(e.key), serialized, { EX: ttl });
      } else {
        multi.set(this.toKey(e.key), serialized);
      }
    }
    await multi.exec();
  }

  async delete(key: CacheKey): Promise<void> {
    await this.client.del(this.toKey(key));
  }

  async invalidateByPrefix(prefix: CacheKey): Promise<number> {
    const pattern = prefixToPattern(prefix);
    const prefixKey = this.toKey(prefix);
    const prefixWithSeparator = prefixKey + ':';
    const isEmptyPrefix = prefixKey === '';
    let count = 0;

    // `DEL ''` is not a valid Redis command (empty key); skip for the match-all case.
    if (!isEmptyPrefix) {
      const deleted = await this.client.del(prefixKey);
      if (deleted === 1) count++;
    }

    const CHUNK_SIZE = 500;
    const chunk: string[] = [];

    for await (
      const batch of this.client.scanIterator({ MATCH: pattern, COUNT: 500 })
    ) {
      const keys: string[] = Array.isArray(batch) ? batch : [batch];
      for (const key of keys) {
        // Empty prefix ⇒ match-all: accept every scanned key.
        // Non-empty prefix ⇒ only delete keys that are exactly the prefix or
        // share its namespace (e.g. "recipes:123" but not "recipes2:foo").
        if (isEmptyPrefix || key === prefixKey || key.startsWith(prefixWithSeparator)) {
          chunk.push(key as string);
          if (chunk.length >= CHUNK_SIZE) {
            const numDeleted: number = await this.client.del(chunk);
            count += numDeleted;
            chunk.length = 0;
          }
        }
      }
    }

    if (chunk.length > 0) {
      const numDeleted: number = await this.client.del(chunk);
      count += numDeleted;
    }

    return count;
  }

  async has(key: CacheKey): Promise<boolean> {
    const exists = await this.client.exists(this.toKey(key));
    return exists === 1;
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    try {
      await this.client?.disconnect();
    } catch {
      // ignore disconnect errors on shutdown
    }
  }
}
