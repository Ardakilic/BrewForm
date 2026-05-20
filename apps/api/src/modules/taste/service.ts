import * as model from './model.ts';
import type { CacheProvider } from '../../utils/cache/index.ts';

const TASTE_CACHE_KEY = ['cache', 'taste-notes'];
const TASTE_FLAT_CACHE_KEY = ['cache', 'taste-notes-flat'];
const TASTE_ROOT_MAP_CACHE_KEY = ['cache', 'taste-notes-root-map'];
const TASTE_CACHE_TTL = 2592000000; // 30 days

export async function getHierarchy(cache: CacheProvider) {
  const cached = await cache.get<any>(TASTE_CACHE_KEY);
  if (cached !== null && cached.length > 0) return cached;

  const hierarchy = await model.getHierarchy();
  if (hierarchy.length > 0) {
    await cache.set(TASTE_CACHE_KEY, hierarchy, { ttlMs: TASTE_CACHE_TTL });
  }
  return hierarchy;
}

export async function searchTasteNotes(query: string, _cache: CacheProvider) {
  if (query.length < 3) throw new Error('QUERY_TOO_SHORT');

  const allNotes = await model.searchByName(query);

  const flat = [...allNotes];
  const parentIds = new Set<string>();

  for (const note of flat) {
    if (note.parentId) {
      parentIds.add(note.parentId);
    }
  }

  for (const parentId of parentIds) {
    const children = await model.findChildren(parentId);
    for (const child of children) {
      if (!flat.find((n) => n.id === child.id)) {
        flat.push(child);
      }
    }
  }

  const uniqueNotes = Array.from(
    new Map(flat.map((n) => [n.id, n])).values(),
  );
  uniqueNotes.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));

  return uniqueNotes;
}

export async function getFlatList(cache: CacheProvider) {
  const cached = await cache.get<any>(TASTE_FLAT_CACHE_KEY);
  if (cached !== null && cached.length > 0) return cached;

  const allNotes = await model.findAll();
  if (allNotes.length > 0) {
    await cache.set(TASTE_FLAT_CACHE_KEY, allNotes, { ttlMs: TASTE_CACHE_TTL });
  }
  return allNotes;
}

export async function getTasteNoteRootMap(cache: CacheProvider): Promise<Record<string, string>> {
  const cached = await cache.get<Record<string, string>>(TASTE_ROOT_MAP_CACHE_KEY);
  if (cached !== null) return cached;

  const allNotes = await getFlatList(cache);
  const noteMap = new Map<string, any>();
  for (const note of allNotes) {
    noteMap.set(note.id, note);
  }

  const rootMap: Record<string, string> = {};
  for (const note of allNotes) {
    let current = noteMap.get(note.id);
    if (!current) continue;
    while (current.depth > 0) {
      if (!current.parentId) break;
      const parent = noteMap.get(current.parentId);
      if (!parent) break;
      current = parent;
    }
    rootMap[note.id] = current.name;
  }

  await cache.set(TASTE_ROOT_MAP_CACHE_KEY, rootMap, { ttlMs: TASTE_CACHE_TTL });
  return rootMap;
}

export async function createTasteNote(
  data: { name: string; parentId?: string; color?: string; definition?: string; depth: number },
  cache: CacheProvider,
) {
  const note = await model.create(data);
  await flushCache(cache);
  return note;
}

export async function updateTasteNote(
  id: string,
  data: { name?: string; color?: string; definition?: string },
  cache: CacheProvider,
) {
  const note = await model.update(id, data);
  await flushCache(cache);
  return note;
}

export async function deleteTasteNote(id: string, cache: CacheProvider) {
  await model.remove(id);
  await flushCache(cache);
}

async function flushCache(cache: CacheProvider) {
  await cache.delete(TASTE_CACHE_KEY);
  await cache.delete(TASTE_FLAT_CACHE_KEY);
  await cache.deleteByPrefix(['cache', 'taste']);
}
