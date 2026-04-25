import * as model from './model.ts';
import type { CacheProvider } from '../../utils/cache/index.ts';

const TASTE_CACHE_KEY = ['cache', 'taste-notes'];
const TASTE_FLAT_CACHE_KEY = ['cache', 'taste-notes-flat'];
const TASTE_CACHE_TTL = 86400000;

export async function getHierarchy(cache: CacheProvider) {
  const cached = await cache.get<any>(TASTE_CACHE_KEY);
  if (cached) return cached;

  const hierarchy = await model.getHierarchy();
  await cache.set(TASTE_CACHE_KEY, hierarchy, { ttlMs: TASTE_CACHE_TTL });
  return hierarchy;
}

export async function searchTasteNotes(query: string, cache: CacheProvider) {
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
  if (cached) return cached;

  const allNotes = await model.findAll();
  await cache.set(TASTE_FLAT_CACHE_KEY, allNotes, { ttlMs: TASTE_CACHE_TTL });
  return allNotes;
}

export async function createTasteNote(data: { name: string; parentId?: string; color?: string; definition?: string; depth: number }, cache: CacheProvider) {
  const note = await model.create(data);
  await flushCache(cache);
  return note;
}

export async function updateTasteNote(id: string, data: { name?: string; color?: string; definition?: string }, cache: CacheProvider) {
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