/**
 * Taste note database operations for BrewForm.
 *
 * Manages the hierarchical taste-note taxonomy. Supports flat listing, child
 * lookup, name-based search, tree-building (getHierarchy), and full CRUD
 * operations on individual taste notes.
 */
import { db } from '@brewform/db';
import { tasteNotes } from '@brewform/db/schema';
import { and, asc, eq, isNull, like } from 'drizzle-orm';

/** A taste-note row with its nested children, used by getHierarchy. */
type TasteNoteNode = typeof tasteNotes.$inferSelect & {
  children: TasteNoteNode[];
};

/** Get all taste notes ordered by depth then name. */
export function findAll() {
  return db.select().from(tasteNotes).where(isNull(tasteNotes.deletedAt))
    .orderBy(asc(tasteNotes.depth), asc(tasteNotes.name));
}

/** Get all child taste notes for a given parent, ordered by name. */
export function findChildren(parentId: string) {
  return db.select().from(tasteNotes)
    .where(and(eq(tasteNotes.parentId, parentId), isNull(tasteNotes.deletedAt)))
    .orderBy(asc(tasteNotes.name));
}

/** Search taste notes by name (LIKE match), limited to 50 results. */
export function searchByName(query: string) {
  return db.select().from(tasteNotes)
    .where(and(like(tasteNotes.name, `%${query}%`), isNull(tasteNotes.deletedAt)))
    .orderBy(asc(tasteNotes.depth), asc(tasteNotes.name))
    .limit(50);
}

/**
 * Build the full taste-note hierarchy tree.
 *
 * Assembles all notes into a nested tree structure where depth-0 notes are
 * roots and each note carries its children array.
 * @returns Array of root-level taste notes with nested children
 */
export async function getHierarchy() {
  const allNotes = await db.select().from(tasteNotes)
    .where(isNull(tasteNotes.deletedAt))
    .orderBy(asc(tasteNotes.depth), asc(tasteNotes.name));

  const nodeMap = new Map<string, TasteNoteNode>();
  for (const note of allNotes) {
    nodeMap.set(note.id, { ...note, children: [] });
  }

  const roots: TasteNoteNode[] = [];
  for (const note of allNotes) {
    const node = nodeMap.get(note.id)!;
    if (note.parentId == null && note.depth === 0) {
      roots.push(node);
    } else if (note.parentId && nodeMap.has(note.parentId)) {
      nodeMap.get(note.parentId)!.children.push(node);
    }
  }

  return roots;
}

/** Find a single taste note by ID. */
export async function findById(id: string) {
  const result = await db.select().from(tasteNotes).where(
    and(eq(tasteNotes.id, id), isNull(tasteNotes.deletedAt)),
  ).limit(1);
  return result[0] ?? null;
}

/** Create a new taste note. */
export async function create(data: typeof tasteNotes.$inferInsert) {
  const [result] = await db.insert(tasteNotes).values(data).returning();
  return result;
}

/** Update a taste note by ID. Returns null if not found. */
export async function update(id: string, data: Partial<typeof tasteNotes.$inferInsert>) {
  const [result] = await db.update(tasteNotes).set(data).where(eq(tasteNotes.id, id)).returning();
  return result ?? null;
}

/** Soft-delete a taste note by ID. */
export async function softDelete(id: string) {
  const [result] = await db.update(tasteNotes).set({ deletedAt: new Date() })
    .where(and(eq(tasteNotes.id, id), isNull(tasteNotes.deletedAt))).returning();
  return result ?? null;
}
