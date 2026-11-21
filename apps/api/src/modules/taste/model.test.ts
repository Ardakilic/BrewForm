import '../../test-setup.ts';
import { db } from '@brewform/db';
import { tasteNotes } from '@brewform/db/schema';
import { inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { InMemoryCacheProvider } from '../../utils/cache/index.ts';
import { closeTestCaches, testCache } from '../../utils/cache/test-helpers.ts';
import * as model from './model.ts';

// Close every provider created with testCache() so no sweep timer leaks.
afterEach(closeTestCaches);

describe('Taste Model — Cache Provider Integration', () => {
  let cache: InMemoryCacheProvider;

  beforeEach(() => {
    cache = testCache();
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

describe('searchByName (DB)', () => {
  const noteIds: string[] = [];

  /** Insert a root taste note and register it for cleanup. */
  async function insertNote(name: string): Promise<string> {
    const id = crypto.randomUUID();
    noteIds.push(id);
    await db.insert(tasteNotes).values({ id, name, depth: 0 });
    return id;
  }

  afterEach(async () => {
    if (noteIds.length > 0) await db.delete(tasteNotes).where(inArray(tasteNotes.id, noteIds));
    noteIds.length = 0;
  });

  it('matches the name ignoring letter case', async () => {
    const tag = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
    const id = await insertNote(`Fruity${tag}`);
    const results = await model.searchByName(`fruity${tag}`);
    expect(results.map((r) => r.id)).toEqual([id]);
  });

  it('matches a percent sign literally (D99.61)', async () => {
    const tag = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
    const id = await insertNote(`100%${tag}`);
    await insertNote(`1000${tag}`);
    const results = await model.searchByName(`100%${tag}`);
    expect(results.map((r) => r.id)).toEqual([id]);
  });

  it('returns no rows for a whitespace-only query', async () => {
    expect(await model.searchByName('   ')).toEqual([]);
  });
});
