import { db } from '@brewform/db';
import {
  equipment,
  equipmentDeleteRequests,
  recipeEquipment,
  recipes,
  recipeVersions,
} from '@brewform/db/schema';
import { and, asc, count, desc, eq, isNull, like, or, SQL, sql } from 'drizzle-orm';

export async function findById(id: string) {
  const result = await db.select().from(equipment).where(
    and(eq(equipment.id, id), isNull(equipment.deletedAt)),
  ).limit(1);
  return result[0] ?? null;
}

export async function findMany(where: SQL | undefined, page: number, perPage: number) {
  const finalWhere = where ? and(where, isNull(equipment.deletedAt)) : isNull(equipment.deletedAt);
  const [items, totalResult] = await Promise.all([
    db.select().from(equipment).where(finalWhere).orderBy(asc(equipment.name)).limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ count: count() }).from(equipment).where(finalWhere),
  ]);
  return { items, total: totalResult[0].count };
}

export async function search(query: string) {
  return db.select().from(equipment)
    .where(and(
      isNull(equipment.deletedAt),
      or(
        like(equipment.name, `%${query}%`),
        like(equipment.brand, `%${query}%`),
        like(equipment.model, `%${query}%`),
      ),
    ))
    .orderBy(asc(equipment.name))
    .limit(10);
}

export async function create(data: typeof equipment.$inferInsert) {
  const [result] = await db.insert(equipment).values(data).returning();
  return result;
}

export async function update(id: string, data: Partial<typeof equipment.$inferInsert>) {
  const [result] = await db.update(equipment).set(data).where(eq(equipment.id, id)).returning();
  return result ?? null;
}

export async function softDelete(id: string) {
  const [result] = await db.update(equipment).set({ deletedAt: new Date() }).where(
    and(eq(equipment.id, id), isNull(equipment.deletedAt)),
  ).returning();
  return result ?? null;
}

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
  if (params.search) {
    const pattern = `%${params.search}%`;
    conditions.push(
      or(
        like(equipment.name, pattern),
        like(equipment.brand, pattern),
        like(equipment.model, pattern),
      )!,
    );
  }
  const where = and(...conditions)!;
  const offset = (params.page - 1) * params.perPage;
  const [items, totalResult] = await Promise.all([
    db.select().from(equipment).where(where).orderBy(asc(equipment.name)).limit(params.perPage)
      .offset(offset),
    db.select({ count: count() }).from(equipment).where(where),
  ]);
  return { items, total: totalResult[0].count };
}

export async function getRecipesUsingEquipment(
  equipmentId: string,
  page: number,
  perPage: number,
) {
  const offset = (page - 1) * perPage;
  const [data, countResult] = await Promise.all([
    db.query.recipes.findMany({
      with: {
        author: { columns: { username: true, displayName: true, avatarUrl: true } },
      },
      where: and(
        eq(recipes.visibility, 'public'),
        isNull(recipes.deletedAt),
        sql`${recipes.currentVersionId} IN (
          SELECT re.recipe_version_id FROM recipe_equipment re
          WHERE re.equipment_id = ${equipmentId}
        )`,
      ),
      orderBy: desc(recipes.createdAt),
      limit: perPage,
      offset,
    }),
    db.select({ count: sql<number>`count(distinct ${recipes.id})` })
      .from(recipes)
      .innerJoin(recipeVersions, eq(recipes.currentVersionId, recipeVersions.id))
      .innerJoin(recipeEquipment, eq(recipeVersions.id, recipeEquipment.recipeVersionId))
      .where(
        and(
          eq(recipeEquipment.equipmentId, equipmentId),
          eq(recipes.visibility, 'public'),
          isNull(recipes.deletedAt),
        ),
      ),
  ]);
  return { data, total: Number(countResult[0]?.count ?? 0) };
}

export async function createDeleteRequest(
  data: typeof equipmentDeleteRequests.$inferInsert,
) {
  const [result] = await db.insert(equipmentDeleteRequests).values(data).returning();
  return result;
}
