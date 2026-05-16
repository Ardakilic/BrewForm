import { db } from '@brewform/db';
import {
  auditLogs,
  brewMethodEnum,
  brewMethodEquipmentRules,
  comments,
  equipment,
  equipmentTypeEnum,
  recipes,
  type RecipeVisibility,
  reports,
  userPreferences,
  users,
  vendors,
} from '@brewform/db/schema';
import { and, asc, count, desc, eq, gte, isNull, like, or } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';

export async function listUsers(page: number, perPage: number, query?: string) {
  const where = query
    ? and(
      isNull(users.deletedAt),
      or(
        like(users.email, `%${query}%`),
        like(users.username, `%${query}%`),
        like(users.displayName, `%${query}%`),
      ),
    )
    : isNull(users.deletedAt);
  const [data, totalResult] = await Promise.all([
    db.select({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      isAdmin: users.isAdmin,
      isBanned: users.isBanned,
      createdAt: users.createdAt,
    }).from(users).where(where).orderBy(desc(users.createdAt), asc(users.id)).limit(perPage).offset(
      (page - 1) * perPage,
    ),
    db.select({ count: count() }).from(users).where(where),
  ]);
  return { users: data, total: totalResult[0].count };
}

export async function getUserById(id: string) {
  const result = await db.select({
    id: users.id,
    email: users.email,
    username: users.username,
    displayName: users.displayName,
    avatarUrl: users.avatarUrl,
    bio: users.bio,
    isAdmin: users.isAdmin,
    isBanned: users.isBanned,
    onboardingCompleted: users.onboardingCompleted,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }).from(users).where(and(eq(users.id, id), isNull(users.deletedAt))).limit(1);
  return result[0] ?? null;
}

export async function banUser(userId: string) {
  const [result] = await db.update(users).set({ isBanned: true }).where(eq(users.id, userId))
    .returning();
  return result ?? null;
}

export async function unbanUser(userId: string) {
  const [result] = await db.update(users).set({ isBanned: false }).where(eq(users.id, userId))
    .returning();
  return result ?? null;
}

export async function setUserAdminRole(userId: string, isAdmin: boolean) {
  const [result] = await db.update(users).set({ isAdmin }).where(eq(users.id, userId)).returning();
  return result ?? null;
}

export async function adminCreateUser(data: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
  isAdmin?: boolean;
}) {
  const passwordHash = hashSync(data.password, 10);
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({
      email: data.email,
      username: data.username,
      passwordHash,
      displayName: data.displayName || null,
      isAdmin: data.isAdmin || false,
    }).returning();
    await tx.insert(userPreferences).values({ userId: user.id });
    return user;
  });
}

export async function softDeleteUser(userId: string) {
  const [result] = await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId))
    .returning();
  return result ?? null;
}

const RECIPE_VISIBILITIES: readonly string[] = ['draft', 'private', 'unlisted', 'public'];

function isValidVisibility(v: string): v is RecipeVisibility {
  return RECIPE_VISIBILITIES.includes(v);
}

export async function listAllRecipes(page: number, perPage: number, visibility?: string) {
  const where = visibility && isValidVisibility(visibility)
    ? and(isNull(recipes.deletedAt), eq(recipes.visibility, visibility))
    : isNull(recipes.deletedAt);
  const [data, totalResult] = await Promise.all([
    db.select().from(recipes).where(where).orderBy(desc(recipes.createdAt), asc(recipes.id)).limit(
      perPage,
    ).offset((page - 1) * perPage),
    db.select({ count: count() }).from(recipes).where(where),
  ]);
  return { recipes: data, total: totalResult[0].count };
}

export async function updateRecipeVisibility(recipeId: string, visibility: string) {
  if (!isValidVisibility(visibility)) {
    return null;
  }
  const [result] = await db.update(recipes).set({ visibility }).where(
    eq(recipes.id, recipeId),
  ).returning();
  return result ?? null;
}

export async function softDeleteRecipe(recipeId: string) {
  const [result] = await db.update(recipes).set({ deletedAt: new Date() }).where(
    eq(recipes.id, recipeId),
  ).returning();
  return result ?? null;
}

export async function listEquipment(page: number, perPage: number) {
  const where = isNull(equipment.deletedAt);
  const [data, totalResult] = await Promise.all([
    db.select().from(equipment).where(where).orderBy(desc(equipment.createdAt), asc(equipment.id))
      .limit(perPage).offset((page - 1) * perPage),
    db.select({ count: count() }).from(equipment).where(where),
  ]);
  return { equipment: data, total: totalResult[0].count };
}

export async function createEquipment(
  data: { name: string; type: string; brand?: string; model?: string; description?: string },
) {
  if (
    !equipmentTypeEnum.enumValues.includes(data.type as typeof equipmentTypeEnum.enumValues[number])
  ) {
    throw new Error('Invalid equipment type');
  }
  const [result] = await db.insert(equipment).values(data as typeof equipment.$inferInsert)
    .returning();
  return result;
}

export async function updateEquipment(
  id: string,
  data: Partial<
    Pick<typeof equipment.$inferInsert, 'name' | 'type' | 'brand' | 'model' | 'description'>
  >,
) {
  const sanitized: Partial<
    Pick<typeof equipment.$inferInsert, 'name' | 'type' | 'brand' | 'model' | 'description'>
  > = {};
  if (data.name !== undefined) sanitized.name = data.name;
  if (data.type !== undefined && equipmentTypeEnum.enumValues.includes(data.type)) {
    sanitized.type = data.type;
  }
  if (data.brand !== undefined) sanitized.brand = data.brand;
  if (data.model !== undefined) sanitized.model = data.model;
  if (data.description !== undefined) sanitized.description = data.description;

  const [result] = await db.update(equipment).set(sanitized).where(eq(equipment.id, id))
    .returning();
  return result ?? null;
}

export async function deleteEquipment(id: string) {
  const [result] = await db.update(equipment).set({ deletedAt: new Date() }).where(
    eq(equipment.id, id),
  ).returning();
  return result ?? null;
}

export async function listVendors(page: number, perPage: number) {
  const where = isNull(vendors.deletedAt);
  const [data, totalResult] = await Promise.all([
    db.select().from(vendors).where(where).orderBy(desc(vendors.createdAt), asc(vendors.id)).limit(
      perPage,
    ).offset((page - 1) * perPage),
    db.select({ count: count() }).from(vendors).where(where),
  ]);
  return { vendors: data, total: totalResult[0].count };
}

export async function createVendor(data: { name: string; website?: string; description?: string }) {
  const [result] = await db.insert(vendors).values(data).returning();
  return result;
}

export async function updateVendor(
  id: string,
  data: Partial<Pick<typeof vendors.$inferInsert, 'name' | 'website' | 'description'>>,
) {
  const sanitized: Partial<Pick<typeof vendors.$inferInsert, 'name' | 'website' | 'description'>> =
    {};
  if (data.name !== undefined) sanitized.name = data.name;
  if (data.website !== undefined) sanitized.website = data.website;
  if (data.description !== undefined) sanitized.description = data.description;

  const [result] = await db.update(vendors).set(sanitized).where(eq(vendors.id, id)).returning();
  return result ?? null;
}

export async function deleteVendor(id: string) {
  const [result] = await db.update(vendors).set({ deletedAt: new Date() }).where(eq(vendors.id, id))
    .returning();
  return result ?? null;
}

export async function listCompatibilityRules() {
  return db.select().from(brewMethodEquipmentRules).orderBy(
    asc(brewMethodEquipmentRules.brewMethod),
    asc(brewMethodEquipmentRules.equipmentType),
  );
}

export async function updateCompatibilityRule(id: string, compatible: boolean) {
  const [result] = await db.update(brewMethodEquipmentRules).set({ compatible }).where(
    eq(brewMethodEquipmentRules.id, id),
  ).returning();
  return result ?? null;
}

export async function createCompatibilityRule(
  data: { brewMethod: string; equipmentType: string; compatible: boolean },
) {
  if (
    !brewMethodEnum.enumValues.includes(data.brewMethod as typeof brewMethodEnum.enumValues[number])
  ) {
    throw new Error('Invalid brew method');
  }
  if (
    !equipmentTypeEnum.enumValues.includes(
      data.equipmentType as typeof equipmentTypeEnum.enumValues[number],
    )
  ) {
    throw new Error('Invalid equipment type');
  }
  const [result] = await db.insert(brewMethodEquipmentRules).values(
    data as typeof brewMethodEquipmentRules.$inferInsert,
  ).returning();
  return result;
}

export async function deleteCompatibilityRule(id: string) {
  await db.delete(brewMethodEquipmentRules).where(eq(brewMethodEquipmentRules.id, id));
}

export async function listReports(
  page: number,
  perPage: number,
  status?: string,
  entityType?: string,
) {
  let where = undefined;
  if (status) where = eq(reports.status, status);
  if (entityType) {
    where = where
      ? and(where, eq(reports.entityType, entityType))
      : eq(reports.entityType, entityType);
  }
  const [data, totalResult] = await Promise.all([
    db.select().from(reports).where(where).orderBy(desc(reports.createdAt)).limit(perPage).offset(
      (page - 1) * perPage,
    ),
    db.select({ count: count() }).from(reports).where(where),
  ]);
  return { reports: data, total: totalResult[0].count };
}

export async function resolveReport(id: string, resolvedBy: string) {
  const [result] = await db.update(reports)
    .set({ status: 'resolved', resolvedBy, resolvedAt: new Date() })
    .where(eq(reports.id, id))
    .returning();
  return result ?? null;
}

export async function dismissReport(id: string, resolvedBy: string) {
  const [result] = await db.update(reports)
    .set({ status: 'dismissed', resolvedBy, resolvedAt: new Date() })
    .where(eq(reports.id, id))
    .returning();
  return result ?? null;
}

export async function createAuditLog(
  adminId: string,
  action: string,
  entity: string,
  entityId?: string,
  details?: string,
) {
  const [result] = await db.insert(auditLogs).values({ adminId, action, entity, entityId, details })
    .returning();
  return result;
}

export async function listAuditLogs(page: number, perPage: number, entity?: string) {
  let where = undefined;
  if (entity) where = eq(auditLogs.entity, entity);
  const [data, totalResult] = await Promise.all([
    db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ count: count() }).from(auditLogs).where(where),
  ]);
  return { logs: data, total: totalResult[0].count };
}

export async function getDashboardStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalUsersResult,
    totalRecipesResult,
    totalCommentsResult,
    totalReportsResult,
    pendingReportsResult,
    newUsersTodayResult,
    newRecipesTodayResult,
  ] = await Promise.all([
    db.select({ count: count() }).from(users).where(isNull(users.deletedAt)),
    db.select({ count: count() }).from(recipes).where(isNull(recipes.deletedAt)),
    db.select({ count: count() }).from(comments).where(isNull(comments.deletedAt)),
    db.select({ count: count() }).from(reports),
    db.select({ count: count() }).from(reports).where(eq(reports.status, 'pending')),
    db.select({ count: count() }).from(users).where(
      and(isNull(users.deletedAt), gte(users.createdAt, today)),
    ),
    db.select({ count: count() }).from(recipes).where(
      and(isNull(recipes.deletedAt), gte(recipes.createdAt, today)),
    ),
  ]);

  return {
    totalUsers: totalUsersResult[0].count,
    totalRecipes: totalRecipesResult[0].count,
    totalComments: totalCommentsResult[0].count,
    totalReports: totalReportsResult[0].count,
    pendingReports: pendingReportsResult[0].count,
    newUsersToday: newUsersTodayResult[0].count,
    newRecipesToday: newRecipesTodayResult[0].count,
  };
}

export async function getUserGrowth(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const data = await db.select({ createdAt: users.createdAt })
    .from(users)
    .where(and(isNull(users.deletedAt), gte(users.createdAt, since)))
    .orderBy(asc(users.createdAt));
  return data.map((u) => ({ date: u.createdAt.toISOString().split('T')[0] }));
}

export async function getRecipeGrowth(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const data = await db.select({ createdAt: recipes.createdAt })
    .from(recipes)
    .where(and(isNull(recipes.deletedAt), gte(recipes.createdAt, since)))
    .orderBy(asc(recipes.createdAt));
  return data.map((r) => ({ date: r.createdAt.toISOString().split('T')[0] }));
}

export async function getTopRecipes(limit: number) {
  return db.select().from(recipes)
    .where(and(isNull(recipes.deletedAt), eq(recipes.visibility, 'public')))
    .orderBy(desc(recipes.likeCount))
    .limit(limit);
}

export async function getTopUsers(limit: number) {
  const result = await db.select({
    id: users.id,
    username: users.username,
    displayName: users.displayName,
    avatarUrl: users.avatarUrl,
    recipeCount: count(recipes.id),
  })
    .from(users)
    .leftJoin(recipes, and(eq(users.id, recipes.authorId), isNull(recipes.deletedAt)))
    .where(isNull(users.deletedAt))
    .groupBy(users.id)
    .orderBy(desc(count(recipes.id)))
    .limit(limit);

  return result.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl,
    _count: { recipes: r.recipeCount },
  }));
}
