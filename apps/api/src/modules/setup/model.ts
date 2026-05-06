import { db } from '@brewform/db';
import { setups } from '@brewform/db/schema';
import { and, count, desc, eq, isNull } from 'drizzle-orm';

export async function findById(id: string) {
  const result = await db.select().from(setups).where(
    and(eq(setups.id, id), isNull(setups.deletedAt)),
  ).limit(1);
  return result[0] ?? null;
}

export async function findByUser(userId: string, page: number, perPage: number) {
  const where = and(eq(setups.userId, userId), isNull(setups.deletedAt));
  const [data, totalResult] = await Promise.all([
    db.select().from(setups).where(where).orderBy(desc(setups.createdAt)).limit(perPage).offset(
      (page - 1) * perPage,
    ),
    db.select({ count: count() }).from(setups).where(where),
  ]);
  return { setups: data, total: totalResult[0].count };
}

export async function create(data: typeof setups.$inferInsert) {
  const [result] = await db.insert(setups).values(data).returning();
  return result;
}

export async function update(id: string, data: Partial<typeof setups.$inferInsert>) {
  const [result] = await db.update(setups).set(data).where(eq(setups.id, id)).returning();
  return result ?? null;
}

export async function softDelete(id: string) {
  const [result] = await db.update(setups).set({ deletedAt: new Date() }).where(eq(setups.id, id))
    .returning();
  return result ?? null;
}

export async function clearDefaultForUser(userId: string) {
  await db.update(setups).set({ isDefault: false }).where(
    and(eq(setups.userId, userId), eq(setups.isDefault, true)),
  );
}
