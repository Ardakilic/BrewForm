import { db } from '@brewform/db';
import { equipment } from '@brewform/db/schema';
import { and, asc, count, eq, isNull, like, or, SQL } from 'drizzle-orm';

export async function findById(id: string) {
  const result = await db.select().from(equipment).where(
    and(eq(equipment.id, id), isNull(equipment.deletedAt)),
  ).limit(1);
  return result[0] ?? null;
}

export async function findMany(where: SQL | undefined, page: number, perPage: number) {
  const finalWhere = where ? and(where, isNull(equipment.deletedAt)) : isNull(equipment.deletedAt);
  const [items, totalResult] = await Promise.all([
    db.select().from(equipment).where(finalWhere).orderBy(asc(equipment.name)).limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ count: count() }).from(equipment).where(finalWhere),
  ]);
  return { items, total: totalResult[0].count };
}

export async function search(query: string) {
  return db.select().from(equipment)
    .where(and(
      isNull(equipment.deletedAt),
      or(
        like(equipment.name, `%${query}%`),
        like(equipment.brand, `%${query}%`),
        like(equipment.model, `%${query}%`),
      ),
    ))
    .orderBy(asc(equipment.name))
    .limit(10);
}

export async function create(data: typeof equipment.$inferInsert) {
  const [result] = await db.insert(equipment).values(data).returning();
  return result;
}

export async function update(id: string, data: Partial<typeof equipment.$inferInsert>) {
  const [result] = await db.update(equipment).set(data).where(eq(equipment.id, id)).returning();
  return result ?? null;
}

export async function softDelete(id: string) {
  const [result] = await db.update(equipment).set({ deletedAt: new Date() }).where(
    eq(equipment.id, id),
  ).returning();
  return result ?? null;
}
