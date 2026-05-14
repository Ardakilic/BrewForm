/**
 * Utility module for transforming taste note data into SCAA radar chart data.
 * Based on the SCAA 2016 Flavor Wheel with 7 top-level categories.
 */

export const SCAA_CATEGORIES = [
  'Floral',
  'Fruity',
  'Sweet',
  'Nutty/Cocoa',
  'Spices',
  'Roasted',
  'Other',
] as const;

export type ScaaCategory = typeof SCAA_CATEGORIES[number];

export interface TasteNoteForChart {
  tasteNoteId: string;
  intensity: number; // 1-3
  name: string;
  parentId: string | null;
  depth: number;
  // The root category name (depth=0 ancestor)
  rootCategoryName?: string;
}

/**
 * Maps a taste note's root category name to one of the 7 SCAA categories.
 * Handles case-insensitive matching and common variations.
 * - "Nutty", "Cocoa", or "Nutty/Cocoa" all map to "Nutty/Cocoa"
 * - Unknown names fall back to "Other"
 */
export function mapToScaaCategory(rootName: string): ScaaCategory {
  const normalized = rootName.trim().toLowerCase();

  if (normalized === 'floral') return 'Floral';
  if (normalized === 'fruity') return 'Fruity';
  if (normalized === 'sweet') return 'Sweet';
  if (
    normalized === 'nutty/cocoa' ||
    normalized === 'nutty' ||
    normalized === 'cocoa'
  ) {
    return 'Nutty/Cocoa';
  }
  if (normalized === 'spices') return 'Spices';
  if (normalized === 'roasted') return 'Roasted';
  if (normalized === 'other') return 'Other';

  return 'Other';
}

/**
 * Aggregates taste note intensities by SCAA top-level category.
 * Returns a record with all 7 categories, with 0 for categories with no notes.
 *
 * @param notes - Array of taste notes with hierarchy info (rootCategoryName must be set)
 */
export function aggregateByCategory(
  notes: TasteNoteForChart[],
): Record<ScaaCategory, number> {
  const result = Object.fromEntries(
    SCAA_CATEGORIES.map((cat) => [cat, 0]),
  ) as Record<ScaaCategory, number>;

  for (const note of notes) {
    const rootName = note.rootCategoryName ?? note.name;
    const category = mapToScaaCategory(rootName);
    result[category] += note.intensity;
  }

  return result;
}

/**
 * Resolves the root category name for a taste note by walking up the parent chain.
 * If the note is already at depth=0, returns its own name.
 * If the note is at depth=1 or 2, walks up to find the depth=0 ancestor.
 *
 * @param noteId - The taste note ID to resolve
 * @param allNotes - All taste notes (flat list with parentId) for hierarchy traversal
 * @returns The name of the depth=0 ancestor, or null if the note is not found
 */
export function resolveRootCategory(
  noteId: string,
  allNotes: Array<{ id: string; name: string; parentId: string | null; depth: number }>,
): string | null {
  const noteMap = new Map(allNotes.map((n) => [n.id, n]));

  let current = noteMap.get(noteId);
  if (!current) return null;

  // Walk up the parent chain until we reach depth=0
  while (current.depth > 0) {
    if (current.parentId === null) {
      // Orphaned node — treat as root
      break;
    }
    const parent = noteMap.get(current.parentId);
    if (!parent) {
      // Parent not found in the provided list — stop here
      break;
    }
    current = parent;
  }

  return current.name;
}
