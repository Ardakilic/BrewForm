/**
 * QR code recipe lookup for BrewForm.
 *
 * Looks up a recipe by slug for QR code generation, returning only the ID,
 * visibility and author fields the service needs to apply `canViewRecipe`.
 */
import { db } from '@brewform/db';
import { recipes } from '@brewform/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

/**
 * Find a non-deleted recipe by slug, returning only `id`, `visibility` and `authorId` (the
 * shape `canViewRecipe` reads) for QR code gating. Returns null when not found.
 */
export async function findBySlug(slug: string) {
  const result = await db
    .select({ id: recipes.id, visibility: recipes.visibility, authorId: recipes.authorId })
    .from(recipes)
    .where(and(eq(recipes.slug, slug), isNull(recipes.deletedAt)))
    .limit(1);
  return result[0] ?? null;
}
