import '../../test-setup.ts';
import { db } from '@brewform/db';
import { tasteNotes } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryCacheProvider } from '../../utils/cache/index.ts';
import {
  createTasteNote,
  deleteTasteNote,
  getFlatList,
  getHierarchy,
  getTasteNoteRootMap,
  log,
  searchTasteNotes,
  updateTasteNote,
} from './service.ts';

const TASTE_CACHE_KEY = ['cache', 'taste-notes'];
const TASTE_FLAT_CACHE_KEY = ['cache', 'taste-notes-flat'];
const TASTE_ROOT_MAP_CACHE_KEY = ['cache', 'taste-notes-root-map'];

describe('Taste Service', () => {
  let cache: InMemoryCacheProvider;
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  const createdNoteIds: string[] = [];

  beforeEach(() => {
    cache = new InMemoryCacheProvider();
    debugSpy = vi.spyOn(log, 'debug');
    warnSpy = vi.spyOn(log, 'warn');
    createdNoteIds.length = 0;
  });

  afterEach(async () => {
    debugSpy.mockRestore();
    warnSpy.mockRestore();

    for (let i = createdNoteIds.length - 1; i >= 0; i--) {
      await db.delete(tasteNotes).where(eq(tasteNotes.id, createdNoteIds[i]));
    }
    createdNoteIds.length = 0;
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
      const flatData = [
        { id: '1', name: 'Fruity', parentId: null },
        {
          id: '2',
          name: 'Berry',
          parentId: '1',
        },
      ];
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

  describe('Taste note root map cache', () => {
    it('should cache and retrieve root category name map', async () => {
      const rootMap: Record<string, string> = {
        'id-1': 'Fruity',
        'id-2': 'Fruity',
        'id-3': 'Sour/Fermented',
      };
      await cache.set(TASTE_ROOT_MAP_CACHE_KEY, rootMap, { ttlMs: 86400000 });

      const cached = await cache.get<Record<string, string>>(TASTE_ROOT_MAP_CACHE_KEY);
      expect(cached).toEqual(rootMap);
    });

    it('should return null for uncached root map', async () => {
      const result = await cache.get(TASTE_ROOT_MAP_CACHE_KEY);
      expect(result).toBeNull();
    });

    it('should flush root map by prefix along with other taste caches', async () => {
      await cache.set(TASTE_ROOT_MAP_CACHE_KEY, { 'id-1': 'Fruity' });
      await cache.set(['cache', 'taste-notes-flat'], 'flat');

      await cache.deleteByPrefix(['cache', 'taste']);

      expect(await cache.get(TASTE_ROOT_MAP_CACHE_KEY)).toBeNull();
      expect(await cache.get(['cache', 'taste-notes-flat'])).toBeNull();
    });

    it('should not overwrite root map for different taste note ids', async () => {
      const map1: Record<string, string> = { a: 'Fruity' };
      const map2: Record<string, string> = { b: 'Sour/Fermented', c: 'Fruity' };
      await cache.set(TASTE_ROOT_MAP_CACHE_KEY, map1);
      await cache.set(TASTE_ROOT_MAP_CACHE_KEY, map2);

      const cached = await cache.get<Record<string, string>>(TASTE_ROOT_MAP_CACHE_KEY);
      expect(cached).toEqual(map2);
    });
  });

  describe('Cache skip on empty results', () => {
    it('should NOT cache empty hierarchy from model', async () => {
      await cache.set(TASTE_CACHE_KEY, [], { ttlMs: 86400000 });

      expect(await cache.get(TASTE_CACHE_KEY)).toEqual([]);

      await cache.delete(TASTE_CACHE_KEY);
      const result = await cache.get(TASTE_CACHE_KEY);
      expect(result).toBeNull();
    });

    it('should NOT cache empty flat list from model', async () => {
      await cache.set(TASTE_FLAT_CACHE_KEY, [], { ttlMs: 86400000 });

      expect(await cache.get(TASTE_FLAT_CACHE_KEY)).toEqual([]);

      await cache.delete(TASTE_FLAT_CACHE_KEY);
      const result = await cache.get(TASTE_FLAT_CACHE_KEY);
      expect(result).toBeNull();
    });
  });

  describe('getHierarchy', () => {
    it('should log entry/exit and cache results from the model', async () => {
      const note = await db.insert(tasteNotes).values({ name: 'Fruity', depth: 0 }).returning();
      createdNoteIds.push(note[0].id);

      const result = await getHierarchy(cache);

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(1, {}, 'getHierarchy started');
      expect(debugSpy).toHaveBeenNthCalledWith(2, { cached: false }, 'getHierarchy completed');

      const cached = await cache.get(TASTE_CACHE_KEY);
      expect(cached).toEqual(result);

      const second = await getHierarchy(cache);
      expect(second).toEqual(result);
      expect(debugSpy).toHaveBeenCalledTimes(4);
      expect(debugSpy).toHaveBeenNthCalledWith(3, {}, 'getHierarchy started');
      expect(debugSpy).toHaveBeenNthCalledWith(4, { cached: true }, 'getHierarchy completed');
    });
  });

  describe('getFlatList', () => {
    it('should log entry/exit and cache results from the model', async () => {
      const note = await db.insert(tasteNotes).values({ name: 'Berry', depth: 0 }).returning();
      createdNoteIds.push(note[0].id);

      const result = await getFlatList(cache);

      // biome-ignore lint/suspicious/noExplicitAny: test mock parameter
      expect(result.map((n: any) => n.name)).toContain('Berry');
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(1, {}, 'getFlatList started');
      expect(debugSpy).toHaveBeenNthCalledWith(2, { cached: false }, 'getFlatList completed');

      const cached = await cache.get(TASTE_FLAT_CACHE_KEY);
      expect(cached).toEqual(result);
    });
  });

  describe('getTasteNoteRootMap', () => {
    it('should log entry/exit and build a root category map', async () => {
      const [root] = await db.insert(tasteNotes).values({ name: 'Fruity', depth: 0 }).returning();
      const [child] = await db
        .insert(tasteNotes)
        .values({
          name: 'Berry',
          depth: 1,
          parentId: root.id,
        })
        .returning();
      createdNoteIds.push(root.id, child.id);

      const result = await getTasteNoteRootMap(cache);

      expect(result[child.id]).toBe('Fruity');
      expect(debugSpy).toHaveBeenCalledTimes(4);
      expect(debugSpy).toHaveBeenNthCalledWith(1, {}, 'getTasteNoteRootMap started');
      expect(debugSpy).toHaveBeenNthCalledWith(2, {}, 'getFlatList started');
      expect(debugSpy).toHaveBeenNthCalledWith(3, { cached: false }, 'getFlatList completed');
      expect(debugSpy).toHaveBeenNthCalledWith(
        4,
        { cached: false },
        'getTasteNoteRootMap completed',
      );
    });
  });

  describe('searchTasteNotes', () => {
    it('should log warn and throw QUERY_TOO_SHORT when query is too short', async () => {
      await expect(searchTasteNotes('ab', cache)).rejects.toThrow('QUERY_TOO_SHORT');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenNthCalledWith(
        1,
        { queryLength: 2 },
        'searchTasteNotes failed: query too short',
      );
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { queryLength: 2 }, 'searchTasteNotes started');
    });

    it('should log entry/exit and return matching notes', async () => {
      const [note] = await db.insert(tasteNotes).values({ name: 'Zesty', depth: 0 }).returning();
      createdNoteIds.push(note.id);

      const result = await searchTasteNotes('Zes', cache);

      // biome-ignore lint/suspicious/noExplicitAny: test mock parameter
      expect(result.map((n: any) => n.id)).toContain(note.id);
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { queryLength: 3 }, 'searchTasteNotes started');
      expect(debugSpy).toHaveBeenNthCalledWith(
        2,
        { queryLength: 3, count: 1 },
        'searchTasteNotes completed',
      );
    });
  });

  describe('createTasteNote', () => {
    it('should log entry/exit and flush cache after creation', async () => {
      await cache.set(TASTE_CACHE_KEY, [{ id: 'old', name: 'Old' }]);

      const result = await createTasteNote({ name: 'New Note', depth: 0 }, cache);
      createdNoteIds.push(result.id);

      expect(result.name).toBe('New Note');
      expect(await cache.get(TASTE_CACHE_KEY)).toBeNull();
      expect(debugSpy).toHaveBeenCalledTimes(5);
      expect(debugSpy).toHaveBeenNthCalledWith(
        1,
        { name: 'New Note', depth: 0 },
        'createTasteNote started',
      );
      expect(debugSpy).toHaveBeenNthCalledWith(
        2,
        { name: 'New Note' },
        'flushing taste note cache after create',
      );
      expect(debugSpy).toHaveBeenNthCalledWith(3, {}, 'flushCache started');
      expect(debugSpy).toHaveBeenNthCalledWith(4, {}, 'flushCache completed');
      expect(debugSpy).toHaveBeenNthCalledWith(
        5,
        { name: 'New Note', id: result.id },
        'createTasteNote completed',
      );
    });
  });

  describe('updateTasteNote', () => {
    it('should log entry/exit and flush cache after update', async () => {
      const [note] = await db.insert(tasteNotes).values({ name: 'Old Name', depth: 0 }).returning();
      createdNoteIds.push(note.id);
      await cache.set(TASTE_CACHE_KEY, [{ id: note.id, name: 'Old Name' }]);

      const result = await updateTasteNote(note.id, { name: 'New Name' }, cache);

      expect(result!.name).toBe('New Name');
      expect(await cache.get(TASTE_CACHE_KEY)).toBeNull();
      expect(debugSpy).toHaveBeenCalledTimes(5);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { id: note.id }, 'updateTasteNote started');
      expect(debugSpy).toHaveBeenNthCalledWith(
        2,
        { id: note.id },
        'flushing taste note cache after update',
      );
      expect(debugSpy).toHaveBeenNthCalledWith(3, {}, 'flushCache started');
      expect(debugSpy).toHaveBeenNthCalledWith(4, {}, 'flushCache completed');
      expect(debugSpy).toHaveBeenNthCalledWith(5, { id: note.id }, 'updateTasteNote completed');
    });
  });

  describe('deleteTasteNote', () => {
    it('should log entry/exit and flush cache after delete', async () => {
      const [note] = await db
        .insert(tasteNotes)
        .values({ name: 'To Delete', depth: 0 })
        .returning();
      createdNoteIds.push(note.id);
      await cache.set(TASTE_CACHE_KEY, [{ id: note.id, name: 'To Delete' }]);

      await deleteTasteNote(note.id, cache);

      const [row] = await db
        .select({ deletedAt: tasteNotes.deletedAt })
        .from(tasteNotes)
        .where(eq(tasteNotes.id, note.id));
      expect(row.deletedAt).not.toBeNull();
      expect(await cache.get(TASTE_CACHE_KEY)).toBeNull();
      expect(debugSpy).toHaveBeenCalledTimes(5);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { id: note.id }, 'deleteTasteNote started');
      expect(debugSpy).toHaveBeenNthCalledWith(
        2,
        { id: note.id },
        'flushing taste note cache after delete',
      );
      expect(debugSpy).toHaveBeenNthCalledWith(3, {}, 'flushCache started');
      expect(debugSpy).toHaveBeenNthCalledWith(4, {}, 'flushCache completed');
      expect(debugSpy).toHaveBeenNthCalledWith(5, { id: note.id }, 'deleteTasteNote completed');
    });
  });
});
