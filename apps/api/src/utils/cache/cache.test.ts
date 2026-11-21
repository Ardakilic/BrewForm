import '../../test-setup.ts';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FailSoftCacheProvider } from './failSoft.ts';
import { createCacheProvider, InMemoryCacheProvider, NullCacheProvider } from './index.ts';
import { RedisCacheProvider } from './redis.ts';

// Hermetic stand-in for the real ioredis client (no server in unit tests).
vi.mock('ioredis', () => {
  class MockRedis {
    static lastUrl: string | undefined;
    static lastOptions: Record<string, unknown> | undefined;
    disconnected = false;
    constructor(url?: string, options?: Record<string, unknown>) {
      MockRedis.lastUrl = url;
      MockRedis.lastOptions = options;
    }
    on(): this {
      return this;
    }
    disconnect(): void {
      this.disconnected = true;
    }
  }
  return { Redis: MockRedis };
});

import type { RedisClient } from './redis.ts';

/** Escape a literal for use in a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Simplified Redis GLOB matcher (`*`, `?`, `[...]` classes, backslash escapes).
 * Keeps the fake client's SCAN honest so glob-handling regressions are caught.
 */
function globToRegExp(glob: string): RegExp {
  let re = '^';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '\\' && i + 1 < glob.length) {
      re += escapeRegExp(glob[i + 1]);
      i += 2;
    } else if (c === '*') {
      re += '.*';
      i += 1;
    } else if (c === '?') {
      re += '.';
      i += 1;
    } else if (c === '[') {
      const j = glob.indexOf(']', i + 1);
      if (j === -1) {
        re += '\\[';
        i += 1;
      } else {
        re += glob.slice(i, j + 1);
        i = j + 1;
      }
    } else {
      re += escapeRegExp(c);
      i += 1;
    }
  }
  return new RegExp(`${re}$`);
}

/** In-memory fake of the Redis command surface — no server needed. */
function createFakeRedisClient(): RedisClient & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
    set: (key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    },
    del: (...keys: string[]) => {
      for (const k of keys) store.delete(k);
      return Promise.resolve(keys.length);
    },
    scanStream: ({ match }: { match: string; count: number }) => {
      const pattern = globToRegExp(match);
      const keys = [...store.keys()].filter((k) => pattern.test(k));
      // A Readable stream is an AsyncIterable, like ioredis's real scanStream.
      return Readable.from(keys.length > 0 ? [keys] : []);
    },
    disconnect: () => undefined,
  };
}

describe('CacheProvider', () => {
  let cache: InMemoryCacheProvider;

  beforeEach(() => {
    cache = new InMemoryCacheProvider();
  });

  afterEach(async () => {
    // Stop the sweep timer so no provider leaks an interval between tests.
    await cache.close();
  });

  describe('InMemoryCacheProvider', () => {
    it('should set and get values', async () => {
      await cache.set(['test', 'key'], 'value');
      const result = await cache.get(['test', 'key']);
      expect(result).toBe('value');
    });

    it('should return null for non-existent keys', async () => {
      const result = await cache.get(['nonexistent']);
      expect(result).toBeNull();
    });

    it('should delete keys', async () => {
      await cache.set(['test', 'key'], 'value');
      await cache.delete(['test', 'key']);
      const result = await cache.get(['test', 'key']);
      expect(result).toBeNull();
    });

    it('should delete by prefix', async () => {
      await cache.set(['cache', 'a'], 1);
      await cache.set(['cache', 'b'], 2);
      await cache.set(['other', 'c'], 3);
      await cache.deleteByPrefix(['cache']);
      expect(await cache.get(['cache', 'a'])).toBeNull();
      expect(await cache.get(['cache', 'b'])).toBeNull();
      expect(await cache.get(['other', 'c'])).toBe(3);
    });

    it('should respect TTL', async () => {
      await cache.set(['ttl', 'key'], 'expires', { ttlMs: 50 });
      const result1 = await cache.get(['ttl', 'key']);
      expect(result1).toBe('expires');

      await new Promise((resolve) => setTimeout(resolve, 60));
      const result2 = await cache.get(['ttl', 'key']);
      expect(result2).toBeNull();
    });

    it('should not expire entries without TTL', async () => {
      await cache.set(['permanent', 'key'], 'stays');
      await new Promise((resolve) => setTimeout(resolve, 30));
      const result = await cache.get(['permanent', 'key']);
      expect(result).toBe('stays');
    });

    it('should overwrite existing keys', async () => {
      await cache.set(['test', 'key'], 'value1');
      await cache.set(['test', 'key'], 'value2');
      const result = await cache.get(['test', 'key']);
      expect(result).toBe('value2');
    });

    it('should handle complex values', async () => {
      const complex = { id: '1', name: 'Espresso', children: [{ id: '2', name: 'Fruity' }] };
      await cache.set(['complex'], complex);
      const result = await cache.get<typeof complex>(['complex']);
      expect(result).toEqual(complex);
    });

    it('should handle array values', async () => {
      const arr = [1, 2, 3, 4, 5];
      await cache.set(['array'], arr);
      const result = await cache.get<number[]>(['array']);
      expect(result).toEqual(arr);
    });
  });
});

describe('InMemoryCacheProvider bounds (LRU cap and expiry sweep)', () => {
  const providers: InMemoryCacheProvider[] = [];

  /** Create a provider that is closed again in afterEach. */
  function provider(options?: ConstructorParameters<typeof InMemoryCacheProvider>[0]) {
    const p = new InMemoryCacheProvider(options);
    providers.push(p);
    return p;
  }

  afterEach(async () => {
    for (const p of providers.splice(0)) await p.close();
    vi.useRealTimers();
  });

  it('evicts the least-recently-used key, with recency refreshed on get', async () => {
    const cache = provider({ maxEntries: 3 });
    await cache.set(['a'], 1);
    await cache.set(['b'], 2);
    await cache.set(['c'], 3);
    expect(await cache.get(['a'])).toBe(1);
    await cache.set(['d'], 4);
    expect(await cache.get(['b'])).toBeNull();
    expect(await cache.get(['a'])).toBe(1);
    expect(await cache.get(['c'])).toBe(3);
    expect(await cache.get(['d'])).toBe(4);
    expect(cache.size).toBe(3);
  });

  it('does not evict when an existing key is overwritten', async () => {
    const cache = provider({ maxEntries: 3 });
    await cache.set(['a'], 1);
    await cache.set(['b'], 2);
    await cache.set(['c'], 3);
    await cache.set(['b'], 20);
    expect(cache.size).toBe(3);
    expect(await cache.get(['a'])).toBe(1);
    expect(await cache.get(['b'])).toBe(20);
    expect(await cache.get(['c'])).toBe(3);
  });

  it('sweeps 1 000 expired entries that are never read again', async () => {
    vi.useFakeTimers();
    const cache = provider();
    for (let i = 0; i < 1000; i++) await cache.set(['ttl', String(i)], i, { ttlMs: 1000 });
    expect(cache.size).toBe(1000);
    vi.advanceTimersByTime(61_000);
    expect(cache.size).toBe(0);
  });

  it('holds at most 10 000 entries after 50 000 distinct writes with the default cap', async () => {
    const cache = provider();
    for (let i = 0; i < 50_000; i++) await cache.set(['k', String(i)], i);
    expect(cache.size).toBeLessThanOrEqual(10_000);
    expect(await cache.get(['k', '49999'])).toBe(49_999);
    expect(await cache.get(['k', '0'])).toBeNull();
  });

  it('clears the sweep interval and empties the store on close()', async () => {
    vi.useFakeTimers();
    const baseline = vi.getTimerCount();
    const cache = new InMemoryCacheProvider();
    expect(vi.getTimerCount()).toBe(baseline + 1);
    await cache.set(['a'], 1);
    await cache.close();
    expect(vi.getTimerCount()).toBe(baseline);
    expect(cache.size).toBe(0);
    expect(await cache.get(['a'])).toBeNull();
  });

  it('reports the memory status', () => {
    expect(provider().status()).toBe('memory');
  });
});

describe('RedisCacheProvider', () => {
  it('should set and get values via JSON round-trip', async () => {
    const cache = new RedisCacheProvider(createFakeRedisClient());
    await cache.set(['test', 'key'], { id: '1', tags: ['a', 'b'] });
    expect(await cache.get(['test', 'key'])).toEqual({ id: '1', tags: ['a', 'b'] });
  });

  it('should return null for non-existent keys', async () => {
    const cache = new RedisCacheProvider(createFakeRedisClient());
    expect(await cache.get(['missing'])).toBeNull();
  });

  it('should delete keys and prefixes', async () => {
    const client = createFakeRedisClient();
    const cache = new RedisCacheProvider(client);
    await cache.set(['cache', 'a'], 1);
    await cache.set(['cache', 'b'], 2);
    await cache.set(['other'], 3);
    await cache.delete(['cache', 'a']);
    expect(await cache.get(['cache', 'a'])).toBeNull();
    await cache.deleteByPrefix(['cache']);
    expect(await cache.get(['cache', 'b'])).toBeNull();
    expect(await cache.get(['other'])).toBe(3);
  });

  it('should pass TTL through as PX milliseconds', async () => {
    const client = createFakeRedisClient();
    const seen: (string | number)[][] = [];
    const spying = {
      ...client,
      set: (key: string, value: string, ...args: (string | number)[]) => {
        seen.push([key, value, ...args]);
        return client.set(key, value);
      },
    };
    const cache = new RedisCacheProvider(spying);
    await cache.set(['ttl'], 'v', { ttlMs: 60_000 });
    expect(seen).toEqual([['brewform:ttl', '"v"', 'PX', 60_000]]);
  });

  it('should scope an empty prefix delete to the app namespace', async () => {
    const client = createFakeRedisClient();
    await client.set('other-app:key', '"foreign"');
    const cache = new RedisCacheProvider(client);
    await cache.set(['own'], 1);
    await cache.deleteByPrefix([]);
    expect(await cache.get(['own'])).toBeNull();
    expect(await client.get('other-app:key')).toBe('"foreign"');
  });

  it('should scan only brewform:* for an empty prefix, leaving rate-limit keys intact', async () => {
    const client = createFakeRedisClient();
    const patterns: string[] = [];
    const spying = {
      ...client,
      scanStream: (options: { match: string; count: number }) => {
        patterns.push(options.match);
        return client.scanStream(options);
      },
    };
    await client.set('brewform:x', '1');
    await client.set('brewform-rl:global:1.2.3.4', '7');
    await client.set('other:y', '"foreign"');
    const cache = new RedisCacheProvider(spying);
    await cache.deleteByPrefix([]);
    expect(patterns).toEqual(['brewform:*']);
    expect(client.store.has('brewform:x')).toBe(false);
    expect(client.store.get('brewform-rl:global:1.2.3.4')).toBe('7');
    expect(client.store.get('other:y')).toBe('"foreign"');
  });

  it('should match bracket-containing prefixes literally, not as a glob class', async () => {
    const client = createFakeRedisClient();
    const cache = new RedisCacheProvider(client);
    await cache.set(['weird[idx]'], 1);
    await cache.set(['weirdi'], 2);
    await cache.deleteByPrefix(['weird[idx]']);
    expect(await cache.get(['weird[idx]'])).toBeNull();
    expect(await cache.get(['weirdi'])).toBe(2);
  });
});

describe('NullCacheProvider', () => {
  it('should report the disabled status', () => {
    expect(new NullCacheProvider().status()).toBe('disabled');
  });

  it('should always miss and drop writes', async () => {
    const cache = new NullCacheProvider();
    await cache.set(['a'], 1);
    expect(await cache.get(['a'])).toBeNull();
    await cache.delete(['a']);
    await cache.deleteByPrefix(['a']);
    expect(await cache.get(['a'])).toBeNull();
  });
});

describe('createCacheProvider', () => {
  it('should create InMemoryCacheProvider for memory driver', async () => {
    const { createCacheProvider } = await import('./index.ts');
    const provider = createCacheProvider('memory');
    expect(provider).toBeInstanceOf(InMemoryCacheProvider);
    await provider.close?.();
  });

  it('should throw for unknown driver', async () => {
    const { createCacheProvider } = await import('./index.ts');
    expect(() => createCacheProvider('memcached')).toThrow('Unknown cache driver');
  });

  it('should create a fail-soft RedisCacheProvider with fast-fail options when a URL is given', async () => {
    const { Redis } = await import('ioredis');
    const provider = createCacheProvider('redis', { redisUrl: 'redis://localhost:6379' });
    expect(provider).toBeInstanceOf(FailSoftCacheProvider);
    expect((provider as FailSoftCacheProvider).inner).toBeInstanceOf(RedisCacheProvider);
    expect((Redis as unknown as { lastUrl: string }).lastUrl).toBe('redis://localhost:6379');
    expect(
      (Redis as unknown as { lastOptions: Record<string, unknown> }).lastOptions,
    ).toMatchObject({ enableOfflineQueue: false, maxRetriesPerRequest: 1, commandTimeout: 500 });
    await provider.close?.();
  });

  it('should pass a password-authenticated URL through to ioredis unmodified', async () => {
    const { Redis } = await import('ioredis');
    const url = 'redis://:s3cret@valkey:6379';
    const provider = createCacheProvider('redis', { redisUrl: url });
    expect(provider).toBeInstanceOf(FailSoftCacheProvider);
    expect((Redis as unknown as { lastUrl: string }).lastUrl).toBe(url);
    await provider.close?.();
  });

  it('should throw for redis driver without a URL', () => {
    expect(() => createCacheProvider('redis')).toThrow('REDIS_URL is required');
  });

  it('should reject the removed deno-kv driver', async () => {
    const { createCacheProvider } = await import('./index.ts');
    expect(() => createCacheProvider('deno-kv')).toThrow('Unknown cache driver');
  });
});
