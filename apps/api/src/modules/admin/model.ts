// deno-lint-ignore-file no-explicit-any require-await
import { prisma } from '@brewform/db';
import { hashSync } from 'bcryptjs';

// --- Users ---

export async function listUsers(page: number, perPage: number, query?: string) {
  const where: any = { deletedAt: null };
  if (query) {
    where.OR = [
      { email: { contains: query } },
      { username: { contains: query } },
      { displayName: { contains: query } },
    ];
  }
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, email: true, username: true, displayName: true,
        avatarUrl: true, isAdmin: true, isBanned: true, createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);
  return { users, total };
}

export async function getUserById(id: string) {
  return prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true, email: true, username: true, displayName: true,
      avatarUrl: true, bio: true, isAdmin: true, isBanned: true,
      onboardingCompleted: true, createdAt: true, updatedAt: true,
    },
  });
}

export async function banUser(userId: string) {
  return prisma.user.update({ where: { id: userId }, data: { isBanned: true } } as any);
}

export async function unbanUser(userId: string) {
  return prisma.user.update({ where: { id: userId }, data: { isBanned: false } } as any);
}

export async function setUserAdminRole(userId: string, isAdmin: boolean) {
  return prisma.user.update({ where: { id: userId }, data: { isAdmin } } as any);
}

export async function adminCreateUser(data: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
  isAdmin?: boolean;
}) {
  const passwordHash = hashSync(data.password, 10);
  return prisma.user.create({
    data: {
      email: data.email,
      username: data.username,
      passwordHash,
      displayName: data.displayName || null,
      isAdmin: data.isAdmin || false,
      preferences: { create: {} },
    },
    include: { preferences: true },
  } as any);
}

export async function softDeleteUser(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() },
  } as any);
}

// --- Recipes ---

export async function listAllRecipes(page: number, perPage: number, visibility?: string) {
  const where: any = { deletedAt: null };
  if (visibility) where.visibility = visibility;
  const [recipes, total] = await Promise.all([
    prisma.recipe.findMany({
      where,
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        author: { select: { id: true, username: true, displayName: true } },
        versions: { take: 1, orderBy: { versionNumber: 'desc' } },
      },
    }),
    prisma.recipe.count({ where }),
  ]);
  return { recipes, total };
}

export async function updateRecipeVisibility(recipeId: string, visibility: string) {
  return prisma.recipe.update({
    where: { id: recipeId },
    data: { visibility: visibility as any },
  });
}

export async function softDeleteRecipe(recipeId: string) {
  return prisma.recipe.update({
    where: { id: recipeId },
    data: { deletedAt: new Date() },
  });
}

// --- Equipment ---

export async function listEquipment(page: number, perPage: number) {
  const [equipment, total] = await Promise.all([
    prisma.equipment.findMany({
      where: { deletedAt: null },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.equipment.count({ where: { deletedAt: null } }),
  ]);
  return { equipment, total };
}

export async function createEquipment(data: { name: string; type: string; brand?: string; model?: string; description?: string }) {
  return prisma.equipment.create({ data: data as any });
}

export async function updateEquipment(id: string, data: any) {
  return prisma.equipment.update({ where: { id }, data });
}

export async function deleteEquipment(id: string) {
  return prisma.equipment.update({ where: { id }, data: { deletedAt: new Date() } } as any);
}

// --- Vendors ---

export async function listVendors(page: number, perPage: number) {
  const [vendors, total] = await Promise.all([
    prisma.vendor.findMany({
      where: { deletedAt: null },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.vendor.count({ where: { deletedAt: null } }),
  ]);
  return { vendors, total };
}

export async function createVendor(data: { name: string; website?: string; description?: string }) {
  return prisma.vendor.create({ data });
}

export async function updateVendor(id: string, data: any) {
  return prisma.vendor.update({ where: { id }, data });
}

export async function deleteVendor(id: string) {
  return prisma.vendor.update({ where: { id }, data: { deletedAt: new Date() } } as any);
}

// --- Brew Method Compatibility Rules ---

export async function listCompatibilityRules() {
  return prisma.brewMethodEquipmentRule.findMany({ orderBy: [{ brewMethod: 'asc' }, { equipmentType: 'asc' }] });
}

export async function updateCompatibilityRule(id: string, compatible: boolean) {
  return prisma.brewMethodEquipmentRule.update({ where: { id }, data: { compatible } });
}

export async function createCompatibilityRule(data: { brewMethod: string; equipmentType: string; compatible: boolean }) {
  return prisma.brewMethodEquipmentRule.create({ data: data as any });
}

export async function deleteCompatibilityRule(id: string) {
  return prisma.brewMethodEquipmentRule.delete({ where: { id } });
}

// --- Reports (admin view) ---

export async function listReports(page: number, perPage: number, status?: string, entityType?: string) {
  const where: any = {};
  if (status) where.status = status;
  if (entityType) where.entityType = entityType;
  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: 'desc' },
      include: { reporter: { select: { id: true, username: true, displayName: true } } },
    }),
    prisma.report.count({ where }),
  ]);
  return { reports, total };
}

export async function resolveReport(id: string, resolvedBy: string) {
  return prisma.report.update({
    where: { id },
    data: { status: 'resolved', resolvedBy, resolvedAt: new Date() },
  } as any);
}

export async function dismissReport(id: string, resolvedBy: string) {
  return prisma.report.update({
    where: { id },
    data: { status: 'dismissed', resolvedBy, resolvedAt: new Date() },
  } as any);
}

// --- Audit Logs ---

export async function createAuditLog(adminId: string, action: string, entity: string, entityId?: string, details?: string) {
  return prisma.auditLog.create({
    data: { adminId, action, entity, entityId, details },
  });
}

export async function listAuditLogs(page: number, perPage: number, entity?: string) {
  const where: any = {};
  if (entity) where.entity = entity;
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: 'desc' },
      include: { admin: { select: { id: true, username: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { logs, total };
}

// --- Analytics ---

export async function getDashboardStats() {
  const [
    totalUsers,
    totalRecipes,
    totalComments,
    totalReports,
    pendingReports,
    newUsersToday,
    newRecipesToday,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.recipe.count({ where: { deletedAt: null } }),
    prisma.comment.count({ where: { deletedAt: null } }),
    prisma.report.count(),
    prisma.report.count({ where: { status: 'pending' } }),
    prisma.user.count({
      where: {
        deletedAt: null,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
    prisma.recipe.count({
      where: {
        deletedAt: null,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
  ]);

  return {
    totalUsers,
    totalRecipes,
    totalComments,
    totalReports,
    pendingReports,
    newUsersToday,
    newRecipesToday,
  };
}

export async function getUserGrowth(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const users = await prisma.user.findMany({
    where: { deletedAt: null, createdAt: { gte: since } },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  return users.map((u) => ({ date: u.createdAt.toISOString().split('T')[0] }));
}

export async function getRecipeGrowth(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const recipes = await prisma.recipe.findMany({
    where: { deletedAt: null, createdAt: { gte: since } },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  return recipes.map((r) => ({ date: r.createdAt.toISOString().split('T')[0] }));
}

export async function getTopRecipes(limit: number) {
  return prisma.recipe.findMany({
    where: { deletedAt: null, visibility: 'public' },
    select: {
      id: true, slug: true, title: true, likeCount: true, commentCount: true, forkCount: true, createdAt: true,
      author: { select: { id: true, username: true, displayName: true } },
    },
    orderBy: { likeCount: 'desc' },
    take: limit,
  });
}

export async function getTopUsers(limit: number) {
  return prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true, username: true, displayName: true, avatarUrl: true,
      _count: { select: { recipes: { where: { deletedAt: null } } } },
    },
    orderBy: { recipes: { _count: 'desc' } },
    take: limit,
  } as any);
}