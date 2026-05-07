import { db } from '@brewform/db';
import { photos } from '@brewform/db/schema';
import { and, asc, eq, isNull } from 'drizzle-orm';

export async function findById(id: string) {
  const result = await db.select().from(photos).where(
    and(eq(photos.id, id), isNull(photos.deletedAt)),
  ).limit(1);
  return result[0] ?? null;
}

export async function findByRecipe(recipeId: string) {
  return db.select().from(photos)
    .where(and(eq(photos.recipeId, recipeId), isNull(photos.deletedAt)))
    .orderBy(asc(photos.sortOrder));
}

export async function create(data: typeof photos.$inferInsert) {
  const [result] = await db.insert(photos).values(data).returning();
  return result;
}

export async function softDelete(id: string) {
  const [result] = await db.update(photos).set({ deletedAt: new Date() }).where(eq(photos.id, id))
    .returning();
  return result ?? null;
}
