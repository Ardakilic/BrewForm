/**
 * BrewForm Taste Notes Service
 * Handles taste notes retrieval and search with Redis caching
 */

import { getPrisma, softDeleteFilter } from '../../utils/database/index.js';
import { getRedis, cacheGetOrSet } from '../../utils/redis/index.js';
import { getLogger } from '../../utils/logger/index.js';

// Cache TTL for taste notes (24 hours since they rarely change)
const TASTE_NOTES_CACHE_TTL = 86400;
const TASTE_NOTES_CACHE_KEY = 'taste-notes:all';
const TASTE_NOTES_HIERARCHY_KEY = 'taste-notes:hierarchy';

export interface TasteNoteWithPath {
  id: string;
  name: string;
  slug: string;
  depth: number;
  colour: string | null;
  definition: string | null;
  parentId: string | null;
  fullPath: string; // e.g., "Fruity > Berry > Raspberry"
}

export interface TasteNoteHierarchy {
  id: string;
  name: string;
  slug: string;
  depth: number;
  colour: string | null;
  definition: string | null;
  children: TasteNoteHierarchy[];
}

/**
 * Build full path for a taste note by traversing up the hierarchy
 */
function buildFullPath(
  note: { id: string; name: string; parentId: string | null },
  notesMap: Map<string, { id: string; name: string; parentId: string | null }>
): string {
  const path: string[] = [note.name];
  let currentNote = note;

  while (currentNote.parentId) {
    const parent = notesMap.get(currentNote.parentId);
    if (!parent) break;
    path.unshift(parent.name);
    currentNote = parent;
  }

  return path.join(' > ');
}

/**
 * Get all taste notes with their full paths (cached)
 */
export async function getAllTasteNotesWithPaths(): Promise<TasteNoteWithPath[]> {
  return cacheGetOrSet(
    TASTE_NOTES_CACHE_KEY,
    async () => {
      const prisma = getPrisma();
      const logger = getLogger();

      const notes = await prisma.tasteNote.findMany({
        where: softDeleteFilter(),
        orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      });

      // Build a map for path construction
      type NoteType = { id: string; name: string; parentId: string | null };
      const notesMap = new Map<string, NoteType>(
        notes.map((n: NoteType) => [n.id, n])
      );

      // Add full paths
      const notesWithPaths: TasteNoteWithPath[] = notes.map((note: typeof notes[0]) => ({
        id: note.id,
        name: note.name,
        slug: note.slug,
        depth: note.depth,
        colour: note.colour,
        definition: note.definition,
        parentId: note.parentId,
        fullPath: buildFullPath(note, notesMap),
      }));

      logger.debug({ type: 'taste-notes', action: 'cache_miss', count: notesWithPaths.length });

      return notesWithPaths;
    },
    TASTE_NOTES_CACHE_TTL
  );
}

/**
 * Get hierarchical taste notes structure (cached)
 */
export async function getTasteNotesHierarchy(): Promise<TasteNoteHierarchy[]> {
  return cacheGetOrSet(
    TASTE_NOTES_HIERARCHY_KEY,
    async () => {
      const prisma = getPrisma();

      const notes = await prisma.tasteNote.findMany({
        where: softDeleteFilter(),
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });

      // Build hierarchy
      const notesMap = new Map<string, TasteNoteHierarchy>();
      const rootNotes: TasteNoteHierarchy[] = [];

      // First pass: create all nodes
      for (const note of notes) {
        notesMap.set(note.id, {
          id: note.id,
          name: note.name,
          slug: note.slug,
          depth: note.depth,
          colour: note.colour,
          definition: note.definition,
          children: [],
        });
      }

      // Second pass: build hierarchy
      for (const note of notes) {
        const node = notesMap.get(note.id);
        if (!node) continue;

        if (note.parentId) {
          const parent = notesMap.get(note.parentId);
          if (parent) {
            parent.children.push(node);
          }
        } else {
          rootNotes.push(node);
        }
      }

      return rootNotes;
    },
    TASTE_NOTES_CACHE_TTL
  );
}

/**
 * Search taste notes by query (case-insensitive)
 * Returns matching notes plus all their children if the match is a parent
 */
export async function searchTasteNotes(query: string): Promise<TasteNoteWithPath[]> {
  if (!query || query.length < 3) {
    return [];
  }

  const allNotes = await getAllTasteNotesWithPaths();
  const queryLower = query.toLowerCase();

  // Find all notes that match the query in name or fullPath
  const matchingIds = new Set<string>();
  const parentIdsToIncludeChildren = new Set<string>();

  for (const note of allNotes) {
    const nameMatches = note.name.toLowerCase().includes(queryLower);
    const pathMatches = note.fullPath.toLowerCase().includes(queryLower);

    if (nameMatches || pathMatches) {
      matchingIds.add(note.id);
      // If the match is in the name (not just inherited from path), include children
      if (nameMatches) {
        parentIdsToIncludeChildren.add(note.id);
      }
    }
  }

  // Add children of matching parent notes
  for (const note of allNotes) {
    if (note.parentId && parentIdsToIncludeChildren.has(note.parentId)) {
      matchingIds.add(note.id);
      // Also include grandchildren
      parentIdsToIncludeChildren.add(note.id);
    }
  }

  // Filter and sort results
  const results = allNotes.filter((note) => matchingIds.has(note.id));

  // Sort by: exact match first, then by depth, then alphabetically
  results.sort((a, b) => {
    const aExact = a.name.toLowerCase() === queryLower;
    const bExact = b.name.toLowerCase() === queryLower;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    const aStartsWith = a.name.toLowerCase().startsWith(queryLower);
    const bStartsWith = b.name.toLowerCase().startsWith(queryLower);
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;

    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.fullPath.localeCompare(b.fullPath);
  });

  return results;
}

/**
 * Get taste note by ID
 */
export async function getTasteNoteById(id: string): Promise<TasteNoteWithPath | null> {
  const allNotes = await getAllTasteNotesWithPaths();
  return allNotes.find((note) => note.id === id) || null;
}

/**
 * Get multiple taste notes by IDs
 */
export async function getTasteNotesByIds(ids: string[]): Promise<TasteNoteWithPath[]> {
  if (ids.length === 0) return [];
  const allNotes = await getAllTasteNotesWithPaths();
  const idSet = new Set(ids);
  return allNotes.filter((note) => idSet.has(note.id));
}

/**
 * Invalidate taste notes cache
 * Should be called when taste notes are modified in admin panel
 */
export async function invalidateTasteNotesCache(): Promise<void> {
  const redis = getRedis();
  const logger = getLogger();

  await Promise.all([
    redis.del(TASTE_NOTES_CACHE_KEY),
    redis.del(TASTE_NOTES_HIERARCHY_KEY),
  ]);

  logger.info({ type: 'taste-notes', action: 'cache_invalidated' });
}

export const tasteNoteService = {
  getAllTasteNotesWithPaths,
  getTasteNotesHierarchy,
  searchTasteNotes,
  getTasteNoteById,
  getTasteNotesByIds,
  invalidateTasteNotesCache,
};

export default tasteNoteService;
