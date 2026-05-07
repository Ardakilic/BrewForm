import { db } from '@brewform/db';
import { recipes, recipeVersions } from '@brewform/db/schema';
import { and, asc, count, desc, eq, inArray, isNull, like, or, SQL } from 'drizzle-orm';

export async function searchRecipes(
  filters: any,
  page: number,
  perPage: number,
  _sortBy: string = 'createdAt',
  sortOrder: string = 'desc',
) {
  const conditions: SQL[] = [isNull(recipes.deletedAt)];

  if (filters.q) {
    const term = `%${filters.q}%`;
    conditions.push(
      or(
        like(recipes.title, term),
        inArray(
          recipes.id,
          db.select({ id: recipeVersions.recipeId }).from(recipeVersions)
            .where(
              or(like(recipeVersions.productName, term), like(recipeVersions.coffeeBrand, term)),
            ),
        ),
      ) as SQL,
    );
  }

  if (filters.brewMethod) {
    conditions.push(
      inArray(
        recipes.id,
        db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
          eq(recipeVersions.brewMethod, filters.brewMethod),
        ),
      ) as SQL,
    );
  }

  if (filters.drinkType) {
    conditions.push(
      inArray(
        recipes.id,
        db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
          eq(recipeVersions.drinkType, filters.drinkType),
        ),
      ) as SQL,
    );
  }

  if (filters.authorId) {
    conditions.push(eq(recipes.authorId, filters.authorId) as SQL);
  }

  conditions.push(eq(recipes.visibility, filters.visibility || 'public') as SQL);

  if (filters.grinder) {
    conditions.push(
      inArray(
        recipes.id,
        db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
          like(recipeVersions.grinder, `%${filters.grinder}%`),
        ),
      ) as SQL,
    );
  }

  const where = conditions.length > 1 ? and(...conditions) : conditions[0];

  const allowedSortColumns: Record<string, any> = {
    createdAt: recipes.createdAt,
    likeCount: recipes.likeCount,
    commentCount: recipes.commentCount,
    forkCount: recipes.forkCount,
    updatedAt: recipes.updatedAt,
    title: recipes.title,
    featured: recipes.featured,
  };

  const sortColumn = allowedSortColumns[_sortBy] ?? recipes.createdAt;
  const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

  const [data, totalResult] = await Promise.all([
    db.select().from(recipes).where(where).orderBy(orderBy).limit(perPage).offset(
      (page - 1) * perPage,
    ),
    db.select({ count: count() }).from(recipes).where(where),
  ]);

  return { recipes: data, total: totalResult[0].count };
}
