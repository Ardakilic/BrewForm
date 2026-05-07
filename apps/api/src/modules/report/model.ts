import { db } from '@brewform/db';
import { reports } from '@brewform/db/schema';
import { count, desc, eq } from 'drizzle-orm';

export async function create(
  reporterId: string,
  entityType: string,
  entityId: string,
  reason: string,
) {
  const [result] = await db.insert(reports).values({ reporterId, entityType, entityId, reason })
    .returning();
  return result;
}

export async function findById(id: string) {
  const result = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  return result[0] ?? null;
}

export async function findMany(status: string | undefined, page: number, perPage: number) {
  let where = undefined;
  if (status) {
    where = eq(reports.status, status);
  }
  const [data, totalResult] = await Promise.all([
    db.select().from(reports).where(where).orderBy(desc(reports.createdAt)).limit(perPage).offset(
      (page - 1) * perPage,
    ),
    db.select({ count: count() }).from(reports).where(where),
  ]);
  return { reports: data, total: totalResult[0].count };
}

export async function resolve(id: string, resolvedBy: string) {
  const [result] = await db.update(reports)
    .set({ status: 'resolved', resolvedBy, resolvedAt: new Date() })
    .where(eq(reports.id, id))
    .returning();
  return result ?? null;
}
