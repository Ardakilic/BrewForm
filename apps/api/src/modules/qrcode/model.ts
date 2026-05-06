import { db } from '@brewform/db';
import { recipes } from '@brewform/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

export async function findBySlug(slug: string) {
  const result = await db.select({ id: recipes.id, visibility: recipes.visibility })
    .from(recipes)
    .where(and(eq(recipes.slug, slug), isNull(recipes.deletedAt)))
    .limit(1);
  return result[0] ?? null;
}
