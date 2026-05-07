import { db } from '@brewform/db';
import { beans } from '@brewform/db/schema';
import { and, count, desc, eq, isNull } from 'drizzle-orm';

export async function findById(id: string) {
  const result = await db.select().from(beans).where(and(eq(beans.id, id), isNull(beans.deletedAt)))
    .limit(1);
  return result[0] ?? null;
}

export async function findByUser(userId: string, page: number, perPage: number) {
  const where = and(eq(beans.userId, userId), isNull(beans.deletedAt));
  const [data, totalResult] = await Promise.all([
    db.select().from(beans).where(where).orderBy(desc(beans.createdAt)).limit(perPage).offset(
      (page - 1) * perPage,
    ),
    db.select({ count: count() }).from(beans).where(where),
  ]);
  return { beans: data, total: totalResult[0].count };
}

export async function create(data: typeof beans.$inferInsert) {
  const [result] = await db.insert(beans).values(data).returning();
  return result;
}

export async function update(id: string, data: Partial<typeof beans.$inferInsert>) {
  const [result] = await db.update(beans).set(data).where(
    and(eq(beans.id, id), isNull(beans.deletedAt)),
  ).returning();
  return result ?? null;
}

export async function softDelete(id: string) {
  const [result] = await db.update(beans).set({ deletedAt: new Date() }).where(
    and(eq(beans.id, id), isNull(beans.deletedAt)),
  ).returning();
  return result ?? null;
}
