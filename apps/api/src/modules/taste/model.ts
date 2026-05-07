import { db } from '@brewform/db';
import { tasteNotes } from '@brewform/db/schema';
import { asc, eq, like } from 'drizzle-orm';

export async function findAll() {
  return db.select().from(tasteNotes).orderBy(asc(tasteNotes.depth), asc(tasteNotes.name));
}

export async function findChildren(parentId: string) {
  return db.select().from(tasteNotes).where(eq(tasteNotes.parentId, parentId)).orderBy(
    asc(tasteNotes.name),
  );
}

export async function searchByName(query: string) {
  return db.select().from(tasteNotes)
    .where(like(tasteNotes.name, `%${query}%`))
    .orderBy(asc(tasteNotes.depth), asc(tasteNotes.name))
    .limit(50);
}

export async function getHierarchy() {
  const allNotes = await db.select().from(tasteNotes)
    .orderBy(asc(tasteNotes.depth), asc(tasteNotes.name));

  const nodeMap = new Map<string, any>();
  for (const note of allNotes) {
    nodeMap.set(note.id, { ...note, children: [] });
  }

  const roots: any[] = [];
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

export async function findById(id: string) {
  const result = await db.select().from(tasteNotes).where(eq(tasteNotes.id, id)).limit(1);
  return result[0] ?? null;
}

export async function create(data: typeof tasteNotes.$inferInsert) {
  const [result] = await db.insert(tasteNotes).values(data).returning();
  return result;
}

export async function update(id: string, data: Partial<typeof tasteNotes.$inferInsert>) {
  const [result] = await db.update(tasteNotes).set(data).where(eq(tasteNotes.id, id)).returning();
  return result ?? null;
}

export async function remove(id: string) {
  const [result] = await db.delete(tasteNotes).where(eq(tasteNotes.id, id)).returning();
  return result ?? null;
}
