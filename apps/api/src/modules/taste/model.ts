import { db } from '@brewform/db';
import { tasteNotes } from '@brewform/db/schema';
import { and, asc, eq, isNull, like } from 'drizzle-orm';

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
  const roots = await db.select().from(tasteNotes)
    .where(and(isNull(tasteNotes.parentId), eq(tasteNotes.depth, 0)))
    .orderBy(asc(tasteNotes.name));

  const result = [];
  for (const root of roots) {
    const children = await db.select().from(tasteNotes)
      .where(eq(tasteNotes.parentId, root.id))
      .orderBy(asc(tasteNotes.name));

    const childrenWithGrandchildren = [];
    for (const child of children) {
      const grandchildren = await db.select().from(tasteNotes)
        .where(eq(tasteNotes.parentId, child.id))
        .orderBy(asc(tasteNotes.name));
      childrenWithGrandchildren.push({ ...child, children: grandchildren });
    }
    result.push({ ...root, children: childrenWithGrandchildren });
  }
  return result;
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
