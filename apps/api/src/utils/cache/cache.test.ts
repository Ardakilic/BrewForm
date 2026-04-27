import { beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { InMemoryCacheProvider } from './index.ts';

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

  it('should throw for deno-kv without kv instance', async () => {
    const { createCacheProvider } = await import('./index.ts');
    expect(() => createCacheProvider('deno-kv')).toThrow('Deno.Kv instance required');
  });
});
