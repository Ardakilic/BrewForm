import { db } from '@brewform/db';
import { vendors } from '@brewform/db/schema';
import { and, asc, count, eq, isNull, like } from 'drizzle-orm';

export async function findById(id: string) {
  const result = await db.select().from(vendors).where(
    and(eq(vendors.id, id), isNull(vendors.deletedAt)),
  ).limit(1);
  return result[0] ?? null;
}

export async function findMany(page: number, perPage: number) {
  const where = isNull(vendors.deletedAt);
  const [data, totalResult] = await Promise.all([
    db.select().from(vendors).where(where).orderBy(asc(vendors.name)).limit(perPage).offset(
      (page - 1) * perPage,
    ),
    db.select({ count: count() }).from(vendors).where(where),
  ]);
  return { vendors: data, total: totalResult[0].count };
}

export async function search(query: string) {
  return db.select().from(vendors)
    .where(and(isNull(vendors.deletedAt), like(vendors.name, `%${query}%`)))
    .orderBy(asc(vendors.name))
    .limit(10);
}

export async function create(data: typeof vendors.$inferInsert) {
  const [result] = await db.insert(vendors).values(data).returning();
  return result;
}

export async function update(id: string, data: Partial<typeof vendors.$inferInsert>) {
  const [result] = await db.update(vendors).set(data).where(eq(vendors.id, id)).returning();
  return result ?? null;
}

export async function softDelete(id: string) {
  const [result] = await db.update(vendors).set({ deletedAt: new Date() }).where(eq(vendors.id, id))
    .returning();
  return result ?? null;
}
