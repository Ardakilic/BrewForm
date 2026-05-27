/**
 * Photo database operations for BrewForm.
 *
 * Manages recipe photo records with soft-delete and sort-order-aware listing.
 */
import { db } from '@brewform/db';
import { photos } from '@brewform/db/schema';
import { and, asc, eq, isNull } from 'drizzle-orm';

/** Find a photo by ID. Returns null if deleted or not found. */
export async function findById(id: string) {
  const result = await db.select().from(photos).where(
    and(eq(photos.id, id), isNull(photos.deletedAt)),
  ).limit(1);
  return result[0] ?? null;
}

/** List all non-deleted photos for a recipe, ordered by sortOrder. */
export async function findByRecipe(recipeId: string) {
  return db.select().from(photos)
    .where(and(eq(photos.recipeId, recipeId), isNull(photos.deletedAt)))
    .orderBy(asc(photos.sortOrder));
}

/** Create a new photo record. */
export async function create(data: typeof photos.$inferInsert) {
  const [result] = await db.insert(photos).values(data).returning();
  return result;
}

/** Soft-delete a photo by setting its deletedAt timestamp. */
export async function softDelete(id: string) {
  const [result] = await db.update(photos).set({ deletedAt: new Date() }).where(
    and(eq(photos.id, id), isNull(photos.deletedAt)),
  )
    .returning();
  return result ?? null;
}
