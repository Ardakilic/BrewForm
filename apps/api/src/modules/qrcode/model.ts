/**
 * QR code recipe lookup for BrewForm.
 *
 * Looks up a recipe by slug for QR code generation, returning only the ID and
 * visibility fields needed to gate public access.
 */
import { db } from '@brewform/db';
import { recipes } from '@brewform/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

/** Find a recipe by slug, returning only ID and visibility for QR code gating. */
export async function findBySlug(slug: string) {
  const result = await db.select({ id: recipes.id, visibility: recipes.visibility })
    .from(recipes)
    .where(and(eq(recipes.slug, slug), isNull(recipes.deletedAt)))
    .limit(1);
  return result[0] ?? null;
}
