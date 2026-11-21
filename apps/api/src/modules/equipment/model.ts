import { db } from '@brewform/db';
import {
  equipment,
  equipmentDeleteRequests,
  recipeEquipment,
  recipes,
  recipeVersions,
} from '@brewform/db/schema';
import { and, asc, count, desc, eq, ilike, isNull, or, type SQL, sql } from 'drizzle-orm';
import { visibleIdentity } from '../../utils/public-identity/index.ts';
import { normalizeSearchTerm, toContainsPattern } from '../../utils/search.ts';
import { listableRecipeCondition, maskUnlistableForkSources } from '../recipe/model.ts';

/** Find an equipment item by ID. Returns null if deleted or not found. */
export async function findById(id: string) {
  const result = await db
    .select()
    .from(equipment)
    .where(and(eq(equipment.id, id), isNull(equipment.deletedAt)))
    .limit(1);
  return result[0] ?? null;
}

/**
 * List non-deleted equipment matching an optional extra where clause,
 * paginated and ordered by name, with total count.
 */
export async function findMany(where: SQL | undefined, page: number, perPage: number) {
  const finalWhere = where ? and(where, isNull(equipment.deletedAt)) : isNull(equipment.deletedAt);
  const [items, totalResult] = await Promise.all([
    db
      .select()
      .from(equipment)
      .where(finalWhere)
      .orderBy(asc(equipment.name))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ count: count() }).from(equipment).where(finalWhere),
  ]);
  return { items, total: totalResult[0].count };
}

/**
 * Search non-deleted equipment by name, brand, or model (case-insensitive literal substring
 * match through `ilike(<col>, toContainsPattern(term))`), limited to 10 results. A term that is
 * empty after trimming returns `[]` without querying.
 */
export async function search(query: string) {
  const term = normalizeSearchTerm(query);
  if (term === '') return [];
  const pattern = toContainsPattern(term);
  return await db
    .select()
    .from(equipment)
    .where(
      and(
        isNull(equipment.deletedAt),
        or(
          ilike(equipment.name, pattern),
          ilike(equipment.brand, pattern),
          ilike(equipment.model, pattern),
        ),
      ),
    )
    .orderBy(asc(equipment.name))
    .limit(10);
}

/** Insert a new equipment item. */
export async function create(data: typeof equipment.$inferInsert) {
  const [result] = await db.insert(equipment).values(data).returning();
  return result;
}

/** Update an equipment item by ID (no soft-delete filter). Returns null if not found. */
export async function update(id: string, data: Partial<typeof equipment.$inferInsert>) {
  const [result] = await db.update(equipment).set(data).where(eq(equipment.id, id)).returning();
  return result ?? null;
}

/** Soft-delete an equipment item by setting its deletedAt timestamp. */
export async function softDelete(id: string) {
  const [result] = await db
    .update(equipment)
    .set({ deletedAt: new Date() })
    .where(and(eq(equipment.id, id), isNull(equipment.deletedAt)))
    .returning();
  return result ?? null;
}

/**
 * List non-deleted equipment with an optional type filter and an optional case-insensitive
 * literal substring match on name, brand or model (`ilike(<col>, toContainsPattern(term))`; an
 * empty term applies no filter), paginated and ordered by name, with total count.
 */
export async function findManyWithFilters(params: {
  type?: string;
  search?: string;
  page: number;
  perPage: number;
}) {
  const conditions = [isNull(equipment.deletedAt)];
  if (params.type) {
    conditions.push(eq(equipment.type, params.type as typeof equipment.type._.data));
  }
  const term = normalizeSearchTerm(params.search);
  if (term !== '') {
    const pattern = toContainsPattern(term);
    conditions.push(
      or(
        ilike(equipment.name, pattern),
        ilike(equipment.brand, pattern),
        ilike(equipment.model, pattern),
      )!,
    );
  }
  const where = and(...conditions)!;
  const offset = (params.page - 1) * params.perPage;
  const [items, totalResult] = await Promise.all([
    db
      .select()
      .from(equipment)
      .where(where)
      .orderBy(asc(equipment.name))
      .limit(params.perPage)
      .offset(offset),
    db.select({ count: count() }).from(equipment).where(where),
  ]);
  return { items, total: totalResult[0].count };
}

/**
 * List public, non-deleted recipes whose current version uses the given
 * equipment item, paginated with total count and author relation joined.
 *
 * The equipment page is a discovery surface (capability `recipe-visibility`), so
 * both the data and the count branch share one `recipeConditions =
 * listableRecipeCondition(null)` from the recipe model: `unlisted`, `draft` and
 * `private` recipes are never listed or counted, for any viewer. The rows pass
 * through `maskUnlistableForkSources`, so a fork of a non-public source carries
 * `forkedFromId: null`.
 * The `author` of a deleted account is `null` (`visibleIdentity`); the recipe stays listed.
 */
export async function getRecipesUsingEquipment(equipmentId: string, page: number, perPage: number) {
  const offset = (page - 1) * perPage;
  const recipeConditions = listableRecipeCondition(null);
  // NOTE: Drizzle's `exists()` combinator generates a subquery that references
  // the physical table name ("recipe_equipment"."recipe_version_id"), but the
  // relational `db.query.recipes.findMany` API aliases the outer table as
  // `"recipe" "recipes"`. The correlation against `recipes.currentVersionId`
  // therefore resolves to the wrong alias and Postgres rejects it with
  // "invalid reference to FROM-clause entry". The `sql` template tag below
  // resolves `${recipes.currentVersionId}` against the outer aliased query,
  // producing a correct correlated EXISTS clause. This is the same finding
  // documented in design Decision 1 of the Wave 2 proposal.
  const equipmentExists = sql`exists (select 1 from ${recipeEquipment} re where re.equipment_id = ${equipmentId} and re.recipe_version_id = ${recipes.currentVersionId})`;
  const [data, countResult] = await Promise.all([
    db.query.recipes.findMany({
      with: {
        author: {
          columns: { username: true, displayName: true, avatarUrl: true, deletedAt: true },
        },
      },
      where: and(recipeConditions, equipmentExists),
      orderBy: desc(recipes.createdAt),
      limit: perPage,
      offset,
    }),
    db
      .select({ count: sql<number>`count(distinct ${recipes.id})` })
      .from(recipes)
      .innerJoin(recipeVersions, eq(recipes.currentVersionId, recipeVersions.id))
      .innerJoin(recipeEquipment, eq(recipeVersions.id, recipeEquipment.recipeVersionId))
      .where(and(eq(recipeEquipment.equipmentId, equipmentId), recipeConditions)),
  ]);
  const rows = data.map((row) => ({ ...row, author: visibleIdentity(row.author) }));
  return { data: await maskUnlistableForkSources(rows), total: Number(countResult[0]?.count ?? 0) };
}

/** Insert an equipment delete request for admin review. */
export async function createDeleteRequest(data: typeof equipmentDeleteRequests.$inferInsert) {
  const [result] = await db.insert(equipmentDeleteRequests).values(data).returning();
  return result;
}
