import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCacheProvider, InMemoryCacheProvider } from './index.ts';
import { ValkeyCacheProvider } from './valkey.ts';

// Hermetic stand-in for the real iovalkey client (no server in unit tests).
vi.mock('iovalkey', () => {
  class MockValkey {
    static lastUrl: string | undefined;
    disconnected = false;
    constructor(url?: string) {
      MockValkey.lastUrl = url;
    }
    disconnect(): void {
      this.disconnected = true;
    }
  }
  return { Valkey: MockValkey };
});

import type { ValkeyClient } from './valkey.ts';

/** In-memory fake of the Valkey command surface — no server needed. */
function createFakeValkeyClient(): ValkeyClient & { store: Map<string, string> } {
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
      const prefix = match.endsWith('*') ? match.slice(0, -1) : match;
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix));
      return (async function* () {
        if (keys.length > 0) yield keys;
      })();
    },
    disconnect: () => {},
  };
}

describe('CacheProvider', () => {
  let cache: InMemoryCacheProvider;

  beforeEach(() => {
    cache = new InMemoryCacheProvider();
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

describe('ValkeyCacheProvider', () => {
  it('should set and get values via JSON round-trip', async () => {
    const cache = new ValkeyCacheProvider(createFakeValkeyClient());
    await cache.set(['test', 'key'], { id: '1', tags: ['a', 'b'] });
    expect(await cache.get(['test', 'key'])).toEqual({ id: '1', tags: ['a', 'b'] });
  });

  it('should return null for non-existent keys', async () => {
    const cache = new ValkeyCacheProvider(createFakeValkeyClient());
    expect(await cache.get(['missing'])).toBeNull();
  });

  it('should delete keys and prefixes', async () => {
    const client = createFakeValkeyClient();
    const cache = new ValkeyCacheProvider(client);
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
    const client = createFakeValkeyClient();
    const seen: (string | number)[][] = [];
    const spying = {
      ...client,
      set: (key: string, value: string, ...args: (string | number)[]) => {
        seen.push([key, value, ...args]);
        return client.set(key, value);
      },
    };
    const cache = new ValkeyCacheProvider(spying);
    await cache.set(['ttl'], 'v', { ttlMs: 60_000 });
    expect(seen).toEqual([['ttl', '"v"', 'PX', 60_000]]);
  });
});

describe('createCacheProvider', () => {
  it('should create InMemoryCacheProvider for memory driver', async () => {
    const { createCacheProvider } = await import('./index.ts');
    const provider = createCacheProvider('memory');
    expect(provider).toBeInstanceOf(InMemoryCacheProvider);
  });

  it('should throw for unknown driver', async () => {
    const { createCacheProvider } = await import('./index.ts');
    expect(() => createCacheProvider('redis')).toThrow('Unknown cache driver');
  });

  it('should create ValkeyCacheProvider when a URL is given', async () => {
    const { Valkey } = await import('iovalkey');
    const provider = createCacheProvider('valkey', { valkeyUrl: 'valkey://localhost:6379' });
    expect(provider).toBeInstanceOf(ValkeyCacheProvider);
    expect((Valkey as unknown as { lastUrl: string }).lastUrl).toBe('valkey://localhost:6379');
    await provider.close?.();
  });

  it('should throw for valkey driver without a URL', async () => {
    expect(() => createCacheProvider('valkey')).toThrow('VALKEY_URL is required');
  });

  it('should reject the removed deno-kv driver', async () => {
    const { createCacheProvider } = await import('./index.ts');
    expect(() => createCacheProvider('deno-kv')).toThrow('Unknown cache driver');
  });
});
