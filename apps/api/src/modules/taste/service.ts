/**
 * Taste note business logic for BrewForm.
 *
 * Provides cached taste-note queries (hierarchy, flat list, root-node map)
 * with a 30-day TTL. Supports full-text search with sibling expansion,
 * and CRUD operations that flush the cache on mutation.
 */
import * as model from './model.ts';
import type { CacheProvider } from '../../utils/cache/index.ts';
import { createLogger } from '../../utils/logger/index.ts';

/**
 * Taste note service.
 *
 * Provides taste-note hierarchy, flat-list, search, and root-map lookups (cache-backed) plus CRUD.
 */
export const log = createLogger('taste-service');

const TASTE_CACHE_KEY = ['cache', 'taste-notes'];
const TASTE_FLAT_CACHE_KEY = ['cache', 'taste-notes-flat'];
const TASTE_ROOT_MAP_CACHE_KEY = ['cache', 'taste-notes-root-map'];
const TASTE_CACHE_TTL = 2592000000; // 30 days

/**
 * Get the full taste-note hierarchy with 30-day caching.
 *
 * @param cache - CacheProvider instance for caching
 * @returns Nested tree of taste notes
 */
export async function getHierarchy(cache: CacheProvider) {
  log.debug({}, 'getHierarchy started');
  const cached = await cache.get<Awaited<ReturnType<typeof model.getHierarchy>>>(TASTE_CACHE_KEY);
  if (cached !== null && cached.length > 0) {
    log.debug({ cached: true }, 'getHierarchy completed');
    return cached;
  }

  const hierarchy = await model.getHierarchy();
  if (hierarchy.length > 0) {
    await cache.set(TASTE_CACHE_KEY, hierarchy, { ttlMs: TASTE_CACHE_TTL });
  }
  log.debug({ cached: false }, 'getHierarchy completed');
  return hierarchy;
}

/**
 * Search taste notes by name with sibling expansion.
 *
 * Returns all matching notes plus their siblings (same parent) to preserve
 * context. Requires at least 3 characters.
 * @throws QUERY_TOO_SHORT if query is less than 3 characters
 */
export async function searchTasteNotes(query: string, _cache: CacheProvider) {
  log.debug({ queryLength: query.length }, 'searchTasteNotes started');
  if (query.length < 3) {
    log.warn({ queryLength: query.length }, 'searchTasteNotes failed: query too short');
    throw new Error('QUERY_TOO_SHORT');
  }

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

  log.debug(
    { queryLength: query.length, count: uniqueNotes.length },
    'searchTasteNotes completed',
  );
  return uniqueNotes;
}

/** Get the flat list of all taste notes with 30-day caching. */
export async function getFlatList(cache: CacheProvider) {
  log.debug({}, 'getFlatList started');
  const cached = await cache.get<Awaited<ReturnType<typeof model.findAll>>>(TASTE_FLAT_CACHE_KEY);
  if (cached !== null && cached.length > 0) {
    log.debug({ cached: true }, 'getFlatList completed');
    return cached;
  }

  const allNotes = await model.findAll();
  if (allNotes.length > 0) {
    await cache.set(TASTE_FLAT_CACHE_KEY, allNotes, { ttlMs: TASTE_CACHE_TTL });
  }
  log.debug({ cached: false }, 'getFlatList completed');
  return allNotes;
}

/**
 * Build a map from each taste note ID to its root category name.
 *
 * Walks up the parent chain for every note to find the depth-0 root.
 * @returns Record mapping note ID to root category name
 */
export async function getTasteNoteRootMap(cache: CacheProvider): Promise<Record<string, string>> {
  log.debug({}, 'getTasteNoteRootMap started');
  const cached = await cache.get<Record<string, string>>(TASTE_ROOT_MAP_CACHE_KEY);
  if (cached !== null) {
    log.debug({ cached: true }, 'getTasteNoteRootMap completed');
    return cached;
  }

  const allNotes = await getFlatList(cache);
  const noteMap = new Map<string, Awaited<ReturnType<typeof model.findAll>>[number]>();
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
  log.debug({ cached: false }, 'getTasteNoteRootMap completed');
  return rootMap;
}

/** Create a new taste note and flush the cache. */
export async function createTasteNote(
  data: { name: string; parentId?: string; color?: string; definition?: string; depth: number },
  cache: CacheProvider,
) {
  log.debug({ name: data.name, depth: data.depth }, 'createTasteNote started');
  const note = await model.create(data);
  log.debug({ name: data.name }, 'flushing taste note cache after create');
  await flushCache(cache);
  log.debug({ name: data.name, id: note.id }, 'createTasteNote completed');
  return note;
}

/** Update a taste note by ID and flush the cache. */
export async function updateTasteNote(
  id: string,
  data: { name?: string; color?: string; definition?: string },
  cache: CacheProvider,
) {
  log.debug({ id }, 'updateTasteNote started');
  const note = await model.update(id, data);
  log.debug({ id }, 'flushing taste note cache after update');
  await flushCache(cache);
  log.debug({ id }, 'updateTasteNote completed');
  return note;
}

/** Delete a taste note by ID and flush the cache. */
export async function deleteTasteNote(id: string, cache: CacheProvider) {
  log.debug({ id }, 'deleteTasteNote started');
  await model.update(id, { deletedAt: new Date() });
  log.debug({ id }, 'flushing taste note cache after delete');
  await flushCache(cache);
  log.debug({ id }, 'deleteTasteNote completed');
}

/** Invalidate all taste-note cache entries. */
async function flushCache(cache: CacheProvider) {
  log.debug({}, 'flushCache started');
  await cache.delete(TASTE_CACHE_KEY);
  await cache.delete(TASTE_FLAT_CACHE_KEY);
  await cache.deleteByPrefix(['cache', 'taste']);
  log.debug({}, 'flushCache completed');
}
