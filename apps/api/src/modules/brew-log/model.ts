import { db } from '@brewform/db';
import { brewLogs, recipes } from '@brewform/db/schema';
import {
  and,
  avg,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  isNull,
  max,
  min,
  type SQL,
} from 'drizzle-orm';

/**
 * A brew-log list row: all `brewLogs` columns plus the joined recipe's
 * `title` and `slug` (as `recipeTitle` / `recipeSlug`).
 */
export type BrewLogListRow = typeof brewLogs.$inferSelect & {
  recipeTitle: string;
  recipeSlug: string;
};

const listColumns = {
  id: brewLogs.id,
  userId: brewLogs.userId,
  recipeId: brewLogs.recipeId,
  recipeVersionId: brewLogs.recipeVersionId,
  brewedAt: brewLogs.brewedAt,
  yieldActual: brewLogs.yieldActual,
  doseActual: brewLogs.doseActual,
  notes: brewLogs.notes,
  personalRating: brewLogs.personalRating,
  createdAt: brewLogs.createdAt,
  updatedAt: brewLogs.updatedAt,
  deletedAt: brewLogs.deletedAt,
  recipeTitle: recipes.title,
  recipeSlug: recipes.slug,
};

const joinRecipe = eq(brewLogs.recipeId, recipes.id);

/**
 * Shared paginated list query: brew logs joined to their recipe (title/slug),
 * newest brews first, with the total count fetched in parallel.
 */
async function list(
  where: SQL | undefined,
  page: number,
  perPage: number,
): Promise<{ brewLogs: BrewLogListRow[]; total: number }> {
  const [rows, totalResult] = await Promise.all([
    db
      .select(listColumns)
      .from(brewLogs)
      .innerJoin(recipes, joinRecipe)
      .where(where)
      .orderBy(desc(brewLogs.brewedAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ count: count() }).from(brewLogs).innerJoin(recipes, joinRecipe).where(where),
  ]);
  return { brewLogs: rows, total: totalResult[0].count };
}

/**
 * Fetch a single brew log by UUID, excluding soft-deleted rows and logs whose
 * recipe has been soft-deleted.
 */
export async function findById(id: string) {
  const [row] = await db
    .select({ log: brewLogs })
    .from(brewLogs)
    .innerJoin(recipes, and(eq(brewLogs.recipeId, recipes.id), isNull(recipes.deletedAt)))
    .where(and(eq(brewLogs.id, id), isNull(brewLogs.deletedAt)));
  return row?.log;
}

/**
 * Fetch a user's brew logs, paginated, newest brews first, joined to the
 * recipe title/slug. Soft-deleted logs AND logs of soft-deleted recipes are
 * excluded. Returns `{ brewLogs, total }`.
 */
export function findByUserId(
  userId: string,
  page: number,
  perPage: number,
): Promise<{ brewLogs: BrewLogListRow[]; total: number }> {
  return list(
    and(eq(brewLogs.userId, userId), isNull(brewLogs.deletedAt), isNull(recipes.deletedAt)),
    page,
    perPage,
  );
}

/**
 * Fetch a user's brew logs for one recipe, paginated, newest brews first,
 * joined to the recipe title/slug. Soft-deleted logs AND soft-deleted recipes
 * are excluded. Returns `{ brewLogs, total }`.
 */
export function findByRecipeIdAndUser(
  recipeId: string,
  userId: string,
  page: number,
  perPage: number,
): Promise<{ brewLogs: BrewLogListRow[]; total: number }> {
  return list(
    and(
      eq(brewLogs.recipeId, recipeId),
      eq(brewLogs.userId, userId),
      isNull(brewLogs.deletedAt),
      isNull(recipes.deletedAt),
    ),
    page,
    perPage,
  );
}

/** Insert a new brew log row and return it. */
export async function create(data: typeof brewLogs.$inferInsert) {
  const [row] = await db.insert(brewLogs).values(data).returning();
  return row;
}

/**
 * Patch an active brew log owned by `userId` with partial data. Ownership and
 * active-row predicates are applied in the UPDATE itself (atomic — no separate
 * read-then-write). Returns the updated row, or null when no matching active
 * row exists.
 */
export async function update(
  id: string,
  userId: string,
  data: Partial<typeof brewLogs.$inferInsert>,
) {
  const [row] = await db
    .update(brewLogs)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(brewLogs.id, id), eq(brewLogs.userId, userId), isNull(brewLogs.deletedAt)))
    .returning();
  return row ?? null;
}

/**
 * Soft-delete an active brew log owned by `userId` by setting deletedAt.
 * Ownership and active-row predicates are applied in the UPDATE itself
 * (atomic). Returns the updated row, or null when no matching active row
 * exists.
 */
export async function softDelete(id: string, userId: string) {
  const [row] = await db
    .update(brewLogs)
    .set({ deletedAt: new Date() })
    .where(and(eq(brewLogs.id, id), eq(brewLogs.userId, userId), isNull(brewLogs.deletedAt)))
    .returning();
  return row ?? null;
}

/**
 * Aggregate brew stats for one recipe: the count of non-deleted brew logs of
 * the non-deleted recipe, and the average of non-null `personalRating` values
 * (null when no brew has a rating). The average is rounded to one decimal.
 */
export async function getRecipeBrewStats(recipeId: string) {
  const [row] = await db
    .select({ brewCount: count(brewLogs.id), avgRating: avg(brewLogs.personalRating) })
    .from(brewLogs)
    .innerJoin(recipes, joinRecipe)
    .where(
      and(eq(brewLogs.recipeId, recipeId), isNull(brewLogs.deletedAt), isNull(recipes.deletedAt)),
    );
  const avgBrewRating = row.avgRating === null ? null : Math.round(Number(row.avgRating) * 10) / 10;
  return { recipeId, brewCount: row.brewCount, avgBrewRating };
}

/**
 * Aggregate journal stats for one user over non-deleted brew logs of
 * non-deleted recipes: total brews, brews in the last 30 days, distinct
 * recipes brewed, and first/last brew timestamps as ISO strings (null when
 * the user has no brews).
 */
export async function getUserBrewStats(userId: string) {
  const where = and(
    eq(brewLogs.userId, userId),
    isNull(brewLogs.deletedAt),
    isNull(recipes.deletedAt),
  );
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [totals, recent] = await Promise.all([
    db
      .select({
        totalBrews: count(brewLogs.id),
        distinctRecipeCount: countDistinct(brewLogs.recipeId),
        firstBrewedAt: min(brewLogs.brewedAt),
        lastBrewedAt: max(brewLogs.brewedAt),
      })
      .from(brewLogs)
      .innerJoin(recipes, joinRecipe)
      .where(where),
    db
      .select({ last30Days: count(brewLogs.id) })
      .from(brewLogs)
      .innerJoin(recipes, joinRecipe)
      .where(and(where, gte(brewLogs.brewedAt, cutoff))),
  ]);
  return {
    totalBrews: totals[0].totalBrews,
    last30Days: recent[0].last30Days,
    distinctRecipeCount: totals[0].distinctRecipeCount,
    firstBrewedAt: totals[0].firstBrewedAt?.toISOString() ?? null,
    lastBrewedAt: totals[0].lastBrewedAt?.toISOString() ?? null,
  };
}
