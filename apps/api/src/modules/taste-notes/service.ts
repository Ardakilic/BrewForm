/**
 * BrewForm Taste Notes Service
 * Handles taste notes retrieval and search
 */

import { getPrisma, softDeleteFilter } from '../../utils/database/index.ts';
import { getLogger } from '../../utils/logger/index.ts';
import { cacheGetOrSet, CacheKeys, invalidateCache } from '../../utils/cache/index.ts';
import { getConfig } from '../../config/index.ts';

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
  notesMap: Map<string, { id: string; name: string; parentId: string | null }>,
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
 * Get all taste notes with their full paths (cached for 24h)
 */
export async function getAllTasteNotesWithPaths(): Promise<
  TasteNoteWithPath[]
> {
  const prisma = getPrisma();
  const logger = getLogger();
  const cfg = getConfig();

  return await cacheGetOrSet(
    CacheKeys.tasteNotesAll(),
    async () => {
      const notes = await prisma.tasteNote.findMany({
        where: softDeleteFilter(),
        orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      });

      // Build a map for path construction
      type NoteType = { id: string; name: string; parentId: string | null };
      const notesMap = new Map<string, NoteType>(
        notes.map((n: NoteType) => [n.id, n]),
      );

      // Add full paths
      const notesWithPaths: TasteNoteWithPath[] = notes.map((
        note: typeof notes[0],
      ) => ({
        id: note.id,
        name: note.name,
        slug: note.slug,
        depth: note.depth,
        colour: note.colour,
        definition: note.definition,
        parentId: note.parentId,
        fullPath: buildFullPath(note, notesMap),
      }));

      logger.debug({
        type: 'taste-notes',
        action: 'fetched',
        count: notesWithPaths.length,
      });

      return notesWithPaths;
    },
    { ttlSeconds: cfg.cacheTtlTasteNotes },
  );
}

/**
 * Invalidate all taste notes caches (called by admin panel)
 */
export async function invalidateTasteNotesCache(): Promise<number> {
  return await invalidateCache(['taste-notes']);
}

/**
 * Get hierarchical taste notes structure (cached for 24h)
 */
export async function getTasteNotesHierarchy(): Promise<TasteNoteHierarchy[]> {
  const prisma = getPrisma();
  const cfg = getConfig();

  return await cacheGetOrSet(
    CacheKeys.tasteNotesHierarchy(),
    async () => {
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
    { ttlSeconds: cfg.cacheTtlTasteNotes },
  );
}

/**
 * Search taste notes by query (case-insensitive)
 * Returns matching notes plus all their children if the match is a parent
 */
export async function searchTasteNotes(
  query: string,
): Promise<TasteNoteWithPath[]> {
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
export async function getTasteNoteById(
  id: string,
): Promise<TasteNoteWithPath | null> {
  const allNotes = await getAllTasteNotesWithPaths();
  return allNotes.find((note) => note.id === id) || null;
}

/**
 * Get multiple taste notes by IDs
 */
export async function getTasteNotesByIds(
  ids: string[],
): Promise<TasteNoteWithPath[]> {
  if (ids.length === 0) return [];
  const allNotes = await getAllTasteNotesWithPaths();
  const idSet = new Set(ids);
  return allNotes.filter((note) => idSet.has(note.id));
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
