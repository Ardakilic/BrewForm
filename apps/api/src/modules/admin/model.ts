/**
 * Admin data-access layer (model) for BrewForm.
 *
 * Direct database queries and mutations for administrative operations
 * including user management, recipe moderation, equipment/vendor CRUD,
 * compatibility rules, report handling, audit logging, and dashboard analytics.
 * All user-facing deletes use soft-delete (sets `deletedAt`).
 *
 * This is the bottom layer of the 3-layer admin module:
 * controllers -> service.ts -> model.ts (this file)
 */
import { db } from '@brewform/db';
import {
  auditLogs,
  brewMethodEnum,
  brewMethodEquipmentRules,
  coffeeVarieties,
  comments,
  equipment,
  equipmentDeleteRequests,
  equipmentTypeEnum,
  recipes,
  recipeVersions,
  type RecipeVisibility,
  reports,
  userPreferences,
  users,
  vendors,
} from '@brewform/db/schema';
import { and, asc, count, desc, eq, gte, isNull, like, ne, or, sql } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';

/** Fetch a paginated list of non-deleted users, optionally filtered by email, username, or display name. */
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

/** Check whether an email is already taken by a non-deleted user, excluding an optional user ID. */
export async function isEmailTaken(email: string, excludeId?: string) {
  const conditions = [eq(users.email, email), isNull(users.deletedAt)];
  if (excludeId) conditions.push(ne(users.id, excludeId));
  const [result] = await db.select({ id: users.id }).from(users).where(and(...conditions)).limit(1);
  return !!result;
}

/** Check whether a username is already taken by a non-deleted user, excluding an optional user ID. */
export async function isUsernameTaken(username: string, excludeId?: string) {
  const conditions = [eq(users.username, username), isNull(users.deletedAt)];
  if (excludeId) conditions.push(ne(users.id, excludeId));
  const [result] = await db.select({ id: users.id }).from(users).where(and(...conditions)).limit(1);
  return !!result;
}

/** Fetch a single non-deleted user by ID. Returns null if not found. */
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

/** Ban a user by setting `isBanned = true`. Returns the updated user or null. */
export async function banUser(userId: string) {
  const [result] = await db.update(users).set({ isBanned: true }).where(eq(users.id, userId))
    .returning();
  return result ?? null;
}

/** Unban a user by setting `isBanned = false`. Returns the updated user or null. */
export async function unbanUser(userId: string) {
  const [result] = await db.update(users).set({ isBanned: false }).where(eq(users.id, userId))
    .returning();
  return result ?? null;
}

/** Set or clear the admin role for a user. Returns the updated user or null. */
export async function setUserAdminRole(userId: string, isAdmin: boolean) {
  const [result] = await db.update(users).set({ isAdmin }).where(eq(users.id, userId)).returning();
  return result ?? null;
}

/**
 * Create a new user with hashed password, user preferences, and unique constraint handling.
 * Runs inside a transaction. Throws EMAIL_ALREADY_EXISTS or USERNAME_ALREADY_EXISTS on conflict.
 */
export async function adminCreateUser(data: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
  bio?: string;
  isAdmin?: boolean;
  isBanned?: boolean;
}) {
  const passwordHash = hashSync(data.password, 10);
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({
        email: data.email,
        username: data.username,
        passwordHash,
        displayName: data.displayName || null,
        bio: data.bio || null,
        isAdmin: data.isAdmin || false,
        isBanned: data.isBanned || false,
      }).returning();
      await tx.insert(userPreferences).values({ userId: user.id });
      return user;
    });
  } catch (err) {
    const pgErr = err as { name?: string; code?: string; constraint?: string };
    if (pgErr.name === 'PostgresError' && pgErr.code === '23505') {
      if (pgErr.constraint?.includes('email')) throw new Error('EMAIL_ALREADY_EXISTS');
      if (pgErr.constraint?.includes('username')) throw new Error('USERNAME_ALREADY_EXISTS');
    }
    throw err;
  }
}

/**
 * Partially update a user's profile fields (including password re-hash).
 * Returns null if no fields were provided. Throws EMAIL_ALREADY_EXISTS or USERNAME_ALREADY_EXISTS on conflict.
 */
export async function adminUpdateUser(
  id: string,
  data: {
    email?: string;
    username?: string;
    password?: string;
    displayName?: string;
    bio?: string;
    isAdmin?: boolean;
    isBanned?: boolean;
  },
) {
  const updateData: Record<string, unknown> = {};
  if (data.email !== undefined) updateData.email = data.email;
  if (data.username !== undefined) updateData.username = data.username;
  if (data.password !== undefined) updateData.passwordHash = hashSync(data.password, 10);
  if (data.displayName !== undefined) updateData.displayName = data.displayName;
  if (data.bio !== undefined) updateData.bio = data.bio;
  if (data.isAdmin !== undefined) updateData.isAdmin = data.isAdmin;
  if (data.isBanned !== undefined) updateData.isBanned = data.isBanned;

  if (Object.keys(updateData).length === 0) return null;

  try {
    const [result] = await db.update(users).set(updateData).where(
      and(eq(users.id, id), isNull(users.deletedAt)),
    ).returning();
    return result ?? null;
  } catch (err) {
    const pgErr = err as { name?: string; code?: string; constraint?: string };
    if (pgErr.name === 'PostgresError' && pgErr.code === '23505') {
      if (pgErr.constraint?.includes('email')) throw new Error('EMAIL_ALREADY_EXISTS');
      if (pgErr.constraint?.includes('username')) throw new Error('USERNAME_ALREADY_EXISTS');
    }
    throw err;
  }
}

/** Soft-delete a user by setting `deletedAt`. Returns the updated user or null. */
export async function softDeleteUser(userId: string) {
  const [result] = await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId))
    .returning();
  return result ?? null;
}

const RECIPE_VISIBILITIES: readonly string[] = ['draft', 'private', 'unlisted', 'public'];

function isValidVisibility(v: string): v is RecipeVisibility {
  return RECIPE_VISIBILITIES.includes(v);
}

/** List all non-deleted recipes with optional visibility filter, ordered by newest first. */
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

/** Update a recipe's visibility. Returns null if the visibility value is invalid. */
export async function updateRecipeVisibility(recipeId: string, visibility: string) {
  if (!isValidVisibility(visibility)) {
    return null;
  }
  const [result] = await db.update(recipes).set({ visibility }).where(
    eq(recipes.id, recipeId),
  ).returning();
  return result ?? null;
}

/** Soft-delete a recipe by setting `deletedAt`. Returns the updated recipe or null. */
export async function softDeleteRecipe(recipeId: string) {
  const [result] = await db.update(recipes).set({ deletedAt: new Date() }).where(
    eq(recipes.id, recipeId),
  ).returning();
  return result ?? null;
}

/** List all non-deleted equipment entries, paginated and ordered by newest first. */
export async function listEquipment(page: number, perPage: number) {
  const where = isNull(equipment.deletedAt);
  const [data, totalResult] = await Promise.all([
    db.select().from(equipment).where(where).orderBy(desc(equipment.createdAt), asc(equipment.id))
      .limit(perPage).offset((page - 1) * perPage),
    db.select({ count: count() }).from(equipment).where(where),
  ]);
  return { equipment: data, total: totalResult[0].count };
}

/** Create a new equipment record. Throws if the type is not a valid equipment type enum value. */
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

/** Partially update an equipment record. Only valid enum values for type are applied. Returns the updated record or null. */
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

/** Soft-delete an equipment record by setting `deletedAt`. Returns the updated record or null. */
export async function deleteEquipment(id: string) {
  const [result] = await db.update(equipment).set({ deletedAt: new Date() }).where(
    eq(equipment.id, id),
  ).returning();
  return result ?? null;
}

/** List all non-deleted vendors, paginated and ordered by newest first. */
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

/** Create a new vendor. */
export async function createVendor(data: { name: string; website?: string; description?: string }) {
  const [result] = await db.insert(vendors).values(data).returning();
  return result;
}

/** Partially update a vendor's name, website, or description. */
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

/** Soft-delete a vendor by setting `deletedAt`. Returns the updated vendor or null. */
export async function deleteVendor(id: string) {
  const [result] = await db.update(vendors).set({ deletedAt: new Date() }).where(eq(vendors.id, id))
    .returning();
  return result ?? null;
}

/** List all brew method ↔ equipment type compatibility rules. */
export async function listCompatibilityRules() {
  return db.select().from(brewMethodEquipmentRules).orderBy(
    asc(brewMethodEquipmentRules.brewMethod),
    asc(brewMethodEquipmentRules.equipmentType),
  );
}

/** Update the compatible flag on a brew method ↔ equipment type rule. */
export async function updateCompatibilityRule(id: string, compatible: boolean) {
  const [result] = await db.update(brewMethodEquipmentRules).set({ compatible }).where(
    eq(brewMethodEquipmentRules.id, id),
  ).returning();
  return result ?? null;
}

/** Create a compatibility rule. Throws if the brew method or equipment type is not a valid enum value. */
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

/** Hard-delete a compatibility rule (no soft-delete on this table). */
export async function deleteCompatibilityRule(id: string) {
  await db.delete(brewMethodEquipmentRules).where(eq(brewMethodEquipmentRules.id, id));
}

/** List reports with optional filters for status and entity type, paginated. */
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

/** Mark a report as resolved, recording who resolved it and when. */
export async function resolveReport(id: string, resolvedBy: string) {
  const [result] = await db.update(reports)
    .set({ status: 'resolved', resolvedBy, resolvedAt: new Date() })
    .where(eq(reports.id, id))
    .returning();
  return result ?? null;
}

/** Mark a report as dismissed, recording who dismissed it and when. */
export async function dismissReport(id: string, resolvedBy: string) {
  const [result] = await db.update(reports)
    .set({ status: 'dismissed', resolvedBy, resolvedAt: new Date() })
    .where(eq(reports.id, id))
    .returning();
  return result ?? null;
}

/** Insert an audit log entry recording an admin action on an entity. */
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

/** List audit log entries with optional entity filter, paginated newest first. */
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

/**
 * Aggregate dashboard statistics: total users, recipes, comments, reports,
 * pending reports, new users today, and new recipes today.
 */
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

/** Fetch user creation dates over the past N days for growth charting. */
export async function getUserGrowth(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const data = await db.select({ createdAt: users.createdAt })
    .from(users)
    .where(and(isNull(users.deletedAt), gte(users.createdAt, since)))
    .orderBy(asc(users.createdAt));
  return data.map((u) => ({ date: u.createdAt.toISOString().split('T')[0] }));
}

/** Fetch recipe creation dates over the past N days for growth charting. */
export async function getRecipeGrowth(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const data = await db.select({ createdAt: recipes.createdAt })
    .from(recipes)
    .where(and(isNull(recipes.deletedAt), gte(recipes.createdAt, since)))
    .orderBy(asc(recipes.createdAt));
  return data.map((r) => ({ date: r.createdAt.toISOString().split('T')[0] }));
}

/** Fetch the top public recipes ordered by like count, limited to N results. */
export async function getTopRecipes(limit: number) {
  return db.select().from(recipes)
    .where(and(isNull(recipes.deletedAt), eq(recipes.visibility, 'public')))
    .orderBy(desc(recipes.likeCount))
    .limit(limit);
}

/** Fetch the top users ranked by recipe count, limited to N results. */
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

// --- Coffee Varieties ---

export async function listCoffeeVarieties(
  page: number,
  perPage: number,
  category?: string,
  search?: string,
) {
  const conditions = [isNull(coffeeVarieties.deletedAt)];

  if (category) {
    conditions.push(
      eq(coffeeVarieties.category, category as typeof coffeeVarieties.category._.data),
    );
  }
  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(
      or(
        like(coffeeVarieties.name, searchPattern),
        like(coffeeVarieties.species, searchPattern),
        like(coffeeVarieties.origin, searchPattern),
      )!,
    );
  }

  const where = and(...conditions)!;
  const offset = (page - 1) * perPage;

  const [data, countResult] = await Promise.all([
    db.select().from(coffeeVarieties).where(where)
      .orderBy(asc(coffeeVarieties.name))
      .limit(perPage).offset(offset),
    db.select({ count: count() }).from(coffeeVarieties).where(where),
  ]);

  return { varieties: data, total: countResult[0].count };
}

export async function createCoffeeVariety(data: typeof coffeeVarieties.$inferInsert) {
  const [result] = await db.insert(coffeeVarieties).values(data).returning();
  return result;
}

export async function updateCoffeeVariety(
  id: string,
  data: Partial<typeof coffeeVarieties.$inferInsert>,
) {
  const [result] = await db.update(coffeeVarieties)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(coffeeVarieties.id, id), isNull(coffeeVarieties.deletedAt)))
    .returning();
  return result ?? null;
}

export async function deleteCoffeeVariety(id: string) {
  const [result] = await db.update(coffeeVarieties)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(coffeeVarieties.id, id))
    .returning();
  return result ?? null;
}

export async function getVarietyRecipeCount(varietyId: string) {
  const [result] = await db.select({ count: sql<number>`count(distinct ${recipes.id})` })
    .from(recipes)
    .innerJoin(recipeVersions, eq(recipes.currentVersionId, recipeVersions.id))
    .where(
      and(
        eq(recipeVersions.coffeeVarietyId, varietyId),
        isNull(recipes.deletedAt),
      ),
    );
  return Number(result?.count ?? 0);
}

// --- Equipment Delete Requests ---

export async function listEquipmentDeleteRequests(
  page: number,
  perPage: number,
  status?: string,
) {
  const conditions = [];
  if (status) {
    conditions.push(
      eq(equipmentDeleteRequests.status, status as typeof equipmentDeleteRequests.status._.data),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (page - 1) * perPage;

  const [data, countResult] = await Promise.all([
    db.query.equipmentDeleteRequests.findMany({
      where,
      with: {
        equipment: true,
        requestedBy: { columns: { id: true, username: true, displayName: true } },
        reviewedBy: { columns: { id: true, username: true, displayName: true } },
      },
      orderBy: desc(equipmentDeleteRequests.createdAt),
      limit: perPage,
      offset,
    }),
    db.select({ count: count() }).from(equipmentDeleteRequests).where(where),
  ]);

  return { requests: data, total: countResult[0].count };
}

export async function approveEquipmentDeleteRequest(id: string, adminId: string) {
  return await db.transaction(async (tx) => {
    const [request] = await tx.update(equipmentDeleteRequests)
      .set({ status: 'approved', reviewedById: adminId, reviewedAt: new Date() })
      .where(eq(equipmentDeleteRequests.id, id))
      .returning();
    if (!request) return null;

    await tx.update(equipment)
      .set({ deletedAt: new Date() })
      .where(eq(equipment.id, request.equipmentId));

    return request;
  });
}

export async function rejectEquipmentDeleteRequest(id: string, adminId: string) {
  const [request] = await db.update(equipmentDeleteRequests)
    .set({ status: 'rejected', reviewedById: adminId, reviewedAt: new Date() })
    .where(eq(equipmentDeleteRequests.id, id))
    .returning();
  return request ?? null;
}
