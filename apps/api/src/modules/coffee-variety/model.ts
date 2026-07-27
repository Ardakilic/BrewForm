import type { CoffeeVarietyCategory } from '@brewform/shared';
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@brewform/db';
import { coffeeVarieties, recipes, recipeVersions } from '@brewform/db/schema';

/** Find a non-deleted coffee variety by ID. */
export function findById(id: string) {
  return db.query.coffeeVarieties.findFirst({
    where: and(eq(coffeeVarieties.id, id), isNull(coffeeVarieties.deletedAt)),
  });
}

/**
 * List non-deleted coffee varieties with optional category and search filters
 * (name/species/origin ILIKE), paginated and ordered by name, with total count.
 */
export async function findMany(params: {
  category?: string;
  search?: string;
  page: number;
  perPage: number;
}) {
  const conditions = [isNull(coffeeVarieties.deletedAt)];

  if (params.category) {
    conditions.push(eq(coffeeVarieties.category, params.category as CoffeeVarietyCategory));
  }
  if (params.search) {
    const searchPattern = `%${params.search}%`;
    conditions.push(
      or(
        ilike(coffeeVarieties.name, searchPattern),
        ilike(coffeeVarieties.species, searchPattern),
        ilike(coffeeVarieties.origin, searchPattern),
      )!,
    );
  }

  const where = and(...conditions)!;
  const offset = (params.page - 1) * params.perPage;

  const [data, countResult] = await Promise.all([
    db.select().from(coffeeVarieties).where(where)
      .orderBy(asc(coffeeVarieties.name))
      .limit(params.perPage).offset(offset),
    db.select({ count: count() }).from(coffeeVarieties).where(where),
  ]);

  return { data, total: countResult[0]?.count ?? 0 };
}

/** Insert a new coffee variety. */
export async function create(data: typeof coffeeVarieties.$inferInsert) {
  const [result] = await db.insert(coffeeVarieties).values(data).returning();
  return result;
}

/** Update a non-deleted coffee variety, bumping updatedAt. */
export async function update(id: string, data: Partial<typeof coffeeVarieties.$inferInsert>) {
  const [result] = await db.update(coffeeVarieties)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(coffeeVarieties.id, id), isNull(coffeeVarieties.deletedAt)))
    .returning();
  return result;
}

/** Soft-delete a coffee variety by setting its deletedAt timestamp. */
export async function softDelete(id: string) {
  const [result] = await db.update(coffeeVarieties)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(coffeeVarieties.id, id), isNull(coffeeVarieties.deletedAt)))
    .returning();
  return result;
}

/**
 * List public, non-deleted recipes whose current version uses the given
 * variety, paginated with total count and author/photo relations joined.
 */
export async function getRecipesUsingVariety(
  varietyId: string,
  page: number,
  perPage: number,
) {
  const offset = (page - 1) * perPage;

  const [data, countResult] = await Promise.all([
    db.query.recipes.findMany({
      with: {
        author: { columns: { username: true, displayName: true, avatarUrl: true } },
        versions: {
          with: { versionPhotos: { with: { photo: true } } },
          orderBy: desc(recipeVersions.createdAt),
        },
      },
      where: and(
        eq(recipes.visibility, 'public'),
        isNull(recipes.deletedAt),
        inArray(
          recipes.currentVersionId,
          db.select({ id: recipeVersions.id }).from(recipeVersions).where(
            eq(recipeVersions.coffeeVarietyId, varietyId),
          ),
        ),
      ),
      orderBy: desc(recipes.createdAt),
      limit: perPage,
      offset,
    }),
    db.select({ count: sql<number>`count(distinct ${recipes.id})` })
      .from(recipes)
      .innerJoin(recipeVersions, eq(recipes.currentVersionId, recipeVersions.id))
      .where(
        and(
          eq(recipeVersions.coffeeVarietyId, varietyId),
          eq(recipes.visibility, 'public'),
          isNull(recipes.deletedAt),
        ),
      ),
  ]);

  return { data, total: Number(countResult[0]?.count ?? 0) };
}
