import { db } from '@brewform/db';
import { coffeeVarieties, recipes, recipeVersions } from '@brewform/db/schema';
import type { CoffeeVarietyCategory } from '@brewform/shared';
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { normalizeSearchTerm, toContainsPattern } from '../../utils/search.ts';
import { listableRecipeCondition, maskUnlistableForkSources } from '../recipe/model.ts';

/** Find a non-deleted coffee variety by ID. */
export async function findById(id: string) {
  return await db.query.coffeeVarieties.findFirst({
    where: and(eq(coffeeVarieties.id, id), isNull(coffeeVarieties.deletedAt)),
  });
}

/**
 * List non-deleted coffee varieties with optional category and search filters
 * (a case-insensitive literal substring match on name, species or origin through
 * `ilike(<col>, toContainsPattern(term))`; an empty term applies no filter), paginated
 * and ordered by name, with total count.
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
  const term = normalizeSearchTerm(params.search);
  if (term !== '') {
    const pattern = toContainsPattern(term);
    conditions.push(
      or(
        ilike(coffeeVarieties.name, pattern),
        ilike(coffeeVarieties.species, pattern),
        ilike(coffeeVarieties.origin, pattern),
      )!,
    );
  }

  const where = and(...conditions)!;
  const offset = (params.page - 1) * params.perPage;

  const [data, countResult] = await Promise.all([
    db
      .select()
      .from(coffeeVarieties)
      .where(where)
      .orderBy(asc(coffeeVarieties.name))
      .limit(params.perPage)
      .offset(offset),
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
  const [result] = await db
    .update(coffeeVarieties)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(coffeeVarieties.id, id), isNull(coffeeVarieties.deletedAt)))
    .returning();
  return result;
}

/** Soft-delete a coffee variety by setting its deletedAt timestamp. */
export async function softDelete(id: string) {
  const [result] = await db
    .update(coffeeVarieties)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(coffeeVarieties.id, id), isNull(coffeeVarieties.deletedAt)))
    .returning();
  return result;
}

/**
 * List public, non-deleted recipes whose current version uses the given
 * variety, paginated with total count and author/photo relations joined.
 *
 * The coffee-variety page is a discovery surface (capability
 * `recipe-visibility`), so both the data and the count branch filter with
 * `listableRecipeCondition(null)` from the recipe model: `unlisted`, `draft`
 * and `private` recipes are never listed or counted, for any viewer. The rows
 * pass through `maskUnlistableForkSources`, so a fork of a non-public source
 * carries `forkedFromId: null`.
 */
export async function getRecipesUsingVariety(varietyId: string, page: number, perPage: number) {
  const offset = (page - 1) * perPage;
  const recipeConditions = listableRecipeCondition(null);

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
        recipeConditions,
        inArray(
          recipes.currentVersionId,
          db
            .select({ id: recipeVersions.id })
            .from(recipeVersions)
            .where(eq(recipeVersions.coffeeVarietyId, varietyId)),
        ),
      ),
      orderBy: desc(recipes.createdAt),
      limit: perPage,
      offset,
    }),
    db
      .select({ count: sql<number>`count(distinct ${recipes.id})` })
      .from(recipes)
      .innerJoin(recipeVersions, eq(recipes.currentVersionId, recipeVersions.id))
      .where(and(eq(recipeVersions.coffeeVarietyId, varietyId), recipeConditions)),
  ]);

  return { data: await maskUnlistableForkSources(data), total: Number(countResult[0]?.count ?? 0) };
}
