import { describe, it, beforeEach } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { InMemoryCacheProvider } from '../../utils/cache/index.ts';

describe('Taste Model — Cache Provider Integration', () => {
  let cache: InMemoryCacheProvider;

  beforeEach(() => {
    cache = new InMemoryCacheProvider();
  });

  it('should store and retrieve cached taste hierarchy', async () => {
    const hierarchyData = [
      { id: '1', name: 'Fruity', parentId: null, depth: 0, children: [] },
      { id: '2', name: 'Berry', parentId: '1', depth: 1, children: [] },
    ];
    await cache.set(['cache', 'taste-notes'], hierarchyData, { ttlMs: 86400000 });
    const cached = await cache.get<typeof hierarchyData>(['cache', 'taste-notes']);
    expect(cached).toEqual(hierarchyData);
  });

  it('should store and retrieve cached flat list', async () => {
    const flatData = [
      { id: '1', name: 'Fruity', parentId: null, depth: 0 },
      { id: '2', name: 'Berry', parentId: '1', depth: 1 },
    ];
    await cache.set(['cache', 'taste-notes-flat'], flatData, { ttlMs: 86400000 });
    const cached = await cache.get<typeof flatData>(['cache', 'taste-notes-flat']);
    expect(cached).toEqual(flatData);
  });

  it('should flush taste cache by prefix', async () => {
    await cache.set(['cache', 'taste-notes'], 'data1');
    await cache.set(['cache', 'taste-notes-flat'], 'data2');
    await cache.set(['cache', 'taste-search', 'fru'], 'data3');

    await cache.deleteByPrefix(['cache']);

    expect(await cache.get(['cache', 'taste-notes'])).toBeNull();
    expect(await cache.get(['cache', 'taste-notes-flat'])).toBeNull();
    expect(await cache.get(['cache', 'taste-search', 'fru'])).toBeNull();
  });
});