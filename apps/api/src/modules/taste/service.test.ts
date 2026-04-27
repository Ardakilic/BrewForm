import { describe, it, beforeEach } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { InMemoryCacheProvider } from '../../utils/cache/index.ts';
import type { CacheProvider } from '../../utils/cache/index.ts';

const TASTE_CACHE_KEY = ['cache', 'taste-notes'];
const TASTE_FLAT_CACHE_KEY = ['cache', 'taste-notes-flat'];

describe('Taste Service', () => {
  let cache: InMemoryCacheProvider;

  beforeEach(() => {
    cache = new InMemoryCacheProvider();
  });

  describe('Cache integration', () => {
    it('should cache and retrieve hierarchy data', async () => {
      const hierarchyData = [{ id: '1', name: 'Fruity', children: [] }];
      await cache.set(TASTE_CACHE_KEY, hierarchyData, { ttlMs: 86400000 });

      const cached = await cache.get<typeof hierarchyData>(TASTE_CACHE_KEY);
      expect(cached).toEqual(hierarchyData);
    });

    it('should return null for uncached data', async () => {
      const result = await cache.get(TASTE_CACHE_KEY);
      expect(result).toBeNull();
    });

    it('should cache and retrieve flat list data', async () => {
      const flatData = [{ id: '1', name: 'Fruity', parentId: null }, { id: '2', name: 'Berry', parentId: '1' }];
      await cache.set(TASTE_FLAT_CACHE_KEY, flatData, { ttlMs: 86400000 });

      const cached = await cache.get<typeof flatData>(TASTE_FLAT_CACHE_KEY);
      expect(cached).toEqual(flatData);
    });
  });

  describe('Cache flushing on admin changes', () => {
    it('should flush hierarchy cache', async () => {
      await cache.set(TASTE_CACHE_KEY, { data: 'cached' });
      await cache.delete(TASTE_CACHE_KEY);
      const result = await cache.get(TASTE_CACHE_KEY);
      expect(result).toBeNull();
    });

    it('should flush flat list cache', async () => {
      await cache.set(TASTE_FLAT_CACHE_KEY, { data: 'flat' });
      await cache.delete(TASTE_FLAT_CACHE_KEY);
      const result = await cache.get(TASTE_FLAT_CACHE_KEY);
      expect(result).toBeNull();
    });

    it('should flush all taste caches by prefix', async () => {
      await cache.set(['cache', 'taste-notes'], 'hierarchy');
      await cache.set(['cache', 'taste-notes-flat'], 'flat');
      await cache.set(['cache', 'taste-search'], 'search');
      await cache.set(['other', 'data'], 'unchanged');

      await cache.deleteByPrefix(['cache']);

      expect(await cache.get(['cache', 'taste-notes'])).toBeNull();
      expect(await cache.get(['cache', 'taste-notes-flat'])).toBeNull();
      expect(await cache.get(['cache', 'taste-search'])).toBeNull();
      expect(await cache.get(['other', 'data'])).toBe('unchanged');
    });
  });
});