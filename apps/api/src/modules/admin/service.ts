/**
 * Admin business-logic layer (service) for BrewForm.
 *
 * Wraps every model call with audit logging, permission checks
 * (e.g. admins cannot self-delete or self-edit), cache invalidation,
 * and email notifications. Pass-through functions exist so controllers
 * never call the model directly.
 *
 * This is the middle layer of the 3-layer admin module:
 * controllers -> service.ts (this file) -> model.ts
 */
import type { z } from 'zod';
import * as model from './model.ts';
import type { CacheProvider } from '../../utils/cache/index.ts';
import { sendWelcomeEmail } from '../auth/email.ts';
import { createLogger } from '../../utils/logger/index.ts';
import { coffeeVarieties } from '@brewform/db/schema';
import {
  BrewMethodCompatibilityCreateSchema,
  EquipmentUpdateSchema,
  VendorUpdateSchema,
} from '@brewform/shared/schemas';

const logger = createLogger('admin-service');

// --- Users ---

/** Pass-through: fetch a paginated list of non-deleted users with optional search. */
export async function listUsers(page: number, perPage: number, query?: string, requestId?: string) {
  const start = Date.now();
  logger.debug({ page, perPage, query, requestId }, 'listUsers started');
  const result = await model.listUsers(page, perPage, query);
  logger.debug(
    { page, perPage, total: result.total, requestId, durationMs: Date.now() - start },
    'listUsers completed',
  );
  return result;
}

/** Pass-through: fetch a single non-deleted user by ID. */
export async function getUserDetail(userId: string, requestId?: string) {
  const start = Date.now();
  logger.debug({ userId, requestId }, 'getUserDetail started');
  const result = await model.getUserById(userId);
  logger.debug(
    { userId, found: !!result, requestId, durationMs: Date.now() - start },
    'getUserDetail completed',
  );
  return result;
}

/** Ban a user and log the action. Throws if the user is not found. */
export async function banUser(adminId: string, userId: string, reason?: string) {
  logger.debug({ adminId, userId }, 'banUser started');
  const user = await model.banUser(userId);
  if (!user) throw new Error('USER_NOT_FOUND');
  const details = reason ? JSON.stringify({ reason }) : undefined;
  await model.createAuditLog(adminId, 'BAN_USER', 'User', userId, details);
  logger.debug({ adminId, userId }, 'banUser completed');
  return user;
}

/** Unban a user and log the action. Throws if the user is not found. */
export async function unbanUser(adminId: string, userId: string) {
  logger.debug({ adminId, userId }, 'unbanUser started');
  const user = await model.unbanUser(userId);
  if (!user) throw new Error('USER_NOT_FOUND');
  await model.createAuditLog(adminId, 'UNBAN_USER', 'User', userId, 'Ban context cleared');
  logger.debug({ adminId, userId }, 'unbanUser completed');
  return user;
}

/** Grant or revoke admin role for a user and log the action. */
export async function setUserAdminRole(adminId: string, userId: string, isAdmin: boolean) {
  logger.debug({ adminId, userId, isAdmin }, 'setUserAdminRole started');
  const user = await model.setUserAdminRole(userId, isAdmin);
  if (!user) throw new Error('USER_NOT_FOUND');
  await model.createAuditLog(
    adminId,
    isAdmin ? 'SET_ADMIN' : 'REMOVE_ADMIN',
    'User',
    userId,
    `isAdmin: ${isAdmin}`,
  );
  logger.debug({ adminId, userId }, 'setUserAdminRole completed');
  return user;
}

/**
 * Admin-created user account with hashed password.
 * Logs the action, sends a welcome email (best-effort), and handles unique constraint errors.
 */
export async function adminCreateUser(adminId: string, data: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
  bio?: string;
  isAdmin?: boolean;
  isBanned?: boolean;
}) {
  logger.debug({ adminId }, 'adminCreateUser started');
  const user = await model.adminCreateUser(data);
  await model.createAuditLog(
    adminId,
    'CREATE_USER',
    'User',
    user!.id,
    `username: ${data.username}`,
  );

  try {
    await sendWelcomeEmail(data.email, data.username);
  } catch (err) {
    logger.warn({ err }, 'Failed to send welcome email on admin create');
  }

  logger.debug({ adminId }, 'adminCreateUser completed');
  return user;
}

/**
 * Partially update a target user's profile. Admin cannot edit themselves.
 * Logs each changed field and re-hashes password if provided.
 * Throws SELF_EDIT_FORBIDDEN or USER_NOT_FOUND.
 */
export async function adminUpdateUser(adminId: string, targetUserId: string, data: {
  email?: string;
  username?: string;
  password?: string;
  displayName?: string;
  bio?: string;
  isAdmin?: boolean;
  isBanned?: boolean;
}) {
  if (adminId === targetUserId) {
    throw new Error('SELF_EDIT_FORBIDDEN');
  }
  logger.debug({ adminId, targetUserId }, 'adminUpdateUser started');
  const user = await model.adminUpdateUser(targetUserId, data);
  if (!user) throw new Error('USER_NOT_FOUND');

  const changeDetails: string[] = [];
  if (data.email !== undefined) changeDetails.push(`email: ${data.email}`);
  if (data.username !== undefined) changeDetails.push(`username: ${data.username}`);
  if (data.password !== undefined) changeDetails.push('password: <changed>');
  if (data.displayName !== undefined) changeDetails.push(`displayName: ${data.displayName}`);
  if (data.bio !== undefined) changeDetails.push('bio: <changed>');
  if (data.isAdmin !== undefined) changeDetails.push(`isAdmin: ${data.isAdmin}`);
  if (data.isBanned !== undefined) changeDetails.push(`isBanned: ${data.isBanned}`);

  await model.createAuditLog(
    adminId,
    'UPDATE_USER',
    'User',
    targetUserId,
    changeDetails.join(', '),
  );

  logger.debug({ adminId, targetUserId }, 'adminUpdateUser completed');
  return user;
}

/** Soft-delete a user and log the action. Admin cannot delete themselves. */
export async function softDeleteUser(adminId: string, userId: string) {
  logger.debug({ adminId, userId }, 'softDeleteUser started');
  if (adminId === userId) {
    throw new Error('SELF_DELETE_FORBIDDEN');
  }
  await model.softDeleteUser(userId);
  await model.createAuditLog(adminId, 'SOFT_DELETE_USER', 'User', userId);
  logger.debug({ adminId, userId }, 'softDeleteUser completed');
}

// --- Recipes ---

/** Pass-through: list all non-deleted recipes with optional visibility filter. */
export async function listAllRecipes(
  page: number,
  perPage: number,
  visibility?: string,
  requestId?: string,
) {
  const start = Date.now();
  logger.debug({ page, perPage, visibility, requestId }, 'listAllRecipes started');
  const result = await model.listAllRecipes(page, perPage, visibility);
  logger.debug(
    { page, perPage, total: result.total, requestId, durationMs: Date.now() - start },
    'listAllRecipes completed',
  );
  return result;
}

/** Update a recipe's visibility and log the action. Returns null if the visibility is invalid. */
export async function updateRecipeVisibility(
  adminId: string,
  recipeId: string,
  visibility: string,
) {
  logger.debug({ adminId, recipeId, visibility }, 'updateRecipeVisibility started');
  const recipe = await model.updateRecipeVisibility(recipeId, visibility);
  if (!recipe) return null;
  await model.createAuditLog(
    adminId,
    'UPDATE_RECIPE_VISIBILITY',
    'Recipe',
    recipeId,
    `visibility: ${visibility}`,
  );
  logger.debug({ adminId, recipeId }, 'updateRecipeVisibility completed');
  return recipe;
}

/** Soft-delete a recipe and log the action. */
export async function softDeleteRecipe(adminId: string, recipeId: string) {
  logger.debug({ adminId, recipeId }, 'softDeleteRecipe started');
  await model.softDeleteRecipe(recipeId);
  await model.createAuditLog(adminId, 'SOFT_DELETE_RECIPE', 'Recipe', recipeId);
  logger.debug({ adminId, recipeId }, 'softDeleteRecipe completed');
}

// --- Equipment ---

/** Pass-through: list all non-deleted equipment entries. */
export async function listEquipment(page: number, perPage: number, requestId?: string) {
  const start = Date.now();
  logger.debug({ page, perPage, requestId }, 'listEquipment started');
  const result = await model.listEquipment(page, perPage);
  logger.debug(
    { page, perPage, total: result.total, requestId, durationMs: Date.now() - start },
    'listEquipment completed',
  );
  return result;
}

/** Create an equipment record and log the action. */
export async function createEquipment(
  adminId: string,
  data: { name: string; type: string; brand?: string; model?: string; description?: string },
) {
  logger.debug({ adminId }, 'createEquipment started');
  const equipment = await model.createEquipment(data);
  await model.createAuditLog(adminId, 'CREATE_EQUIPMENT', 'Equipment', equipment.id);
  logger.debug({ adminId }, 'createEquipment completed');
  return equipment;
}

/** Update an equipment record and log the action. */
export async function updateEquipment(
  adminId: string,
  id: string,
  data: z.infer<typeof EquipmentUpdateSchema>,
) {
  logger.debug({ adminId, id }, 'updateEquipment started');
  const equipment = await model.updateEquipment(id, data);
  await model.createAuditLog(adminId, 'UPDATE_EQUIPMENT', 'Equipment', id);
  logger.debug({ adminId, id }, 'updateEquipment completed');
  return equipment;
}

/** Soft-delete an equipment record and log the action. */
export async function deleteEquipment(adminId: string, id: string) {
  logger.debug({ adminId, id }, 'deleteEquipment started');
  const result = await model.deleteEquipment(id);
  if (result) {
    await model.createAuditLog(adminId, 'DELETE_EQUIPMENT', 'Equipment', id);
  }
  logger.debug({ adminId, id, didDelete: !!result }, 'deleteEquipment completed');
}

// --- Vendors ---

/** Pass-through: list all non-deleted vendors. */
export async function listVendors(page: number, perPage: number, requestId?: string) {
  const start = Date.now();
  logger.debug({ page, perPage, requestId }, 'listVendors started');
  const result = await model.listVendors(page, perPage);
  logger.debug(
    { page, perPage, total: result.total, requestId, durationMs: Date.now() - start },
    'listVendors completed',
  );
  return result;
}

/** Create a vendor and log the action. */
export async function createVendor(
  adminId: string,
  data: { name: string; website?: string; description?: string },
) {
  logger.debug({ adminId }, 'createVendor started');
  const vendor = await model.createVendor({ ...data, createdBy: adminId });
  await model.createAuditLog(adminId, 'CREATE_VENDOR', 'Vendor', vendor.id);
  logger.debug({ adminId }, 'createVendor completed');
  return vendor;
}

/** Update a vendor and log the action. */
export async function updateVendor(
  adminId: string,
  id: string,
  data: z.infer<typeof VendorUpdateSchema>,
) {
  logger.debug({ adminId, id }, 'updateVendor started');
  const vendor = await model.updateVendor(id, data);
  await model.createAuditLog(adminId, 'UPDATE_VENDOR', 'Vendor', id);
  logger.debug({ adminId, id }, 'updateVendor completed');
  return vendor;
}

/** Soft-delete a vendor and log the action. */
export async function deleteVendor(adminId: string, id: string) {
  logger.debug({ adminId, id }, 'deleteVendor started');
  const result = await model.deleteVendor(id);
  if (result) {
    await model.createAuditLog(adminId, 'DELETE_VENDOR', 'Vendor', id);
  }
  logger.debug({ adminId, id, didDelete: !!result }, 'deleteVendor completed');
}

// --- Taste Notes (admin) ---

/** Delegates to the taste module to return the full taste note hierarchy (cached). */
export async function listTasteNotes(cache: CacheProvider, requestId?: string) {
  const start = Date.now();
  logger.debug({ requestId }, 'listTasteNotes started');
  const { getHierarchy } = await import('../taste/service.ts');
  const result = await getHierarchy(cache);
  logger.debug(
    { found: !!result, requestId, durationMs: Date.now() - start },
    'listTasteNotes completed',
  );
  return result;
}

/** Delegates to the taste module to create a note and logs the action. */
export async function createTasteNote(
  adminId: string,
  data: { name: string; parentId?: string; color?: string; definition?: string; depth: number },
  cache: CacheProvider,
) {
  logger.debug({ adminId }, 'createTasteNote started');
  const { createTasteNote } = await import('../taste/service.ts');
  const note = await createTasteNote(data, cache);
  await model.createAuditLog(
    adminId,
    'CREATE_TASTE_NOTE',
    'TasteNote',
    note.id,
    `name: ${data.name}`,
  );
  logger.debug({ adminId }, 'createTasteNote completed');
  return note;
}

/** Delegates to the taste module to update a note and logs the action. */
export async function updateTasteNote(
  adminId: string,
  id: string,
  data: { name?: string; color?: string; definition?: string },
  cache: CacheProvider,
) {
  logger.debug({ adminId, id }, 'updateTasteNote started');
  const { updateTasteNote } = await import('../taste/service.ts');
  const note = await updateTasteNote(id, data, cache);
  await model.createAuditLog(adminId, 'UPDATE_TASTE_NOTE', 'TasteNote', id);
  logger.debug({ adminId, id }, 'updateTasteNote completed');
  return note;
}

/** Delegates to the taste module to delete a note and logs the action. */
export async function deleteTasteNote(adminId: string, id: string, cache: CacheProvider) {
  logger.debug({ adminId, id }, 'deleteTasteNote started');
  const { deleteTasteNote } = await import('../taste/service.ts');
  await deleteTasteNote(id, cache);
  await model.createAuditLog(adminId, 'DELETE_TASTE_NOTE', 'TasteNote', id);
  logger.debug({ adminId, id }, 'deleteTasteNote completed');
}

// --- Brew Method Compatibility Matrix ---

/** Pass-through: list all brew method compatibility rules. */
export async function listCompatibilityRules(requestId?: string) {
  const start = Date.now();
  logger.debug({ requestId }, 'listCompatibilityRules started');
  const result = await model.listCompatibilityRules();
  logger.debug(
    { count: result.length, requestId, durationMs: Date.now() - start },
    'listCompatibilityRules completed',
  );
  return result;
}

/** Update a compatibility rule, log the action, and invalidate the compatibility cache. */
export async function updateCompatibilityRule(
  adminId: string,
  id: string,
  compatible: boolean,
  cache: CacheProvider,
) {
  logger.debug({ adminId, id, compatible }, 'updateCompatibilityRule started');
  const rule = await model.updateCompatibilityRule(id, compatible);
  await model.createAuditLog(
    adminId,
    'UPDATE_COMPATIBILITY_RULE',
    'BrewMethodEquipmentRule',
    id,
    `compatible: ${compatible}`,
  );
  await cache.deleteByPrefix(['cache', 'compatibility']);
  logger.debug({ adminId, id }, 'updateCompatibilityRule completed');
  return rule;
}

/** Create a compatibility rule, log the action, and invalidate the compatibility cache. */
export async function createCompatibilityRule(
  adminId: string,
  data: z.infer<typeof BrewMethodCompatibilityCreateSchema>,
  cache: CacheProvider,
) {
  logger.debug({ adminId }, 'createCompatibilityRule started');
  const rule = await model.createCompatibilityRule(data);
  await model.createAuditLog(
    adminId,
    'CREATE_COMPATIBILITY_RULE',
    'BrewMethodEquipmentRule',
    rule.id,
  );
  await cache.deleteByPrefix(['cache', 'compatibility']);
  logger.debug({ adminId }, 'createCompatibilityRule completed');
  return rule;
}

/** Hard-delete a compatibility rule, log the action, and invalidate the compatibility cache. */
export async function deleteCompatibilityRule(adminId: string, id: string, cache: CacheProvider) {
  logger.debug({ adminId, id }, 'deleteCompatibilityRule started');
  await model.deleteCompatibilityRule(id);
  await model.createAuditLog(adminId, 'DELETE_COMPATIBILITY_RULE', 'BrewMethodEquipmentRule', id);
  await cache.deleteByPrefix(['cache', 'compatibility']);
  logger.debug({ adminId, id }, 'deleteCompatibilityRule completed');
}

// --- Reports (admin) ---

/** Pass-through: list reports with optional status and entity type filters. */
export async function listReports(
  page: number,
  perPage: number,
  status?: string,
  entityType?: string,
  requestId?: string,
) {
  const start = Date.now();
  logger.debug({ page, perPage, status, entityType, requestId }, 'listReports started');
  const result = await model.listReports(page, perPage, status, entityType);
  logger.debug(
    { page, perPage, total: result.total, requestId, durationMs: Date.now() - start },
    'listReports completed',
  );
  return result;
}

/** Resolve a report and log the action. */
export async function resolveReport(adminId: string, id: string) {
  logger.debug({ adminId, id }, 'resolveReport started');
  const report = await model.resolveReport(id, adminId);
  await model.createAuditLog(adminId, 'RESOLVE_REPORT', 'Report', id);
  logger.debug({ adminId, id }, 'resolveReport completed');
  return report;
}

/** Dismiss a report and log the action. */
export async function dismissReport(adminId: string, id: string) {
  logger.debug({ adminId, id }, 'dismissReport started');
  const report = await model.dismissReport(id, adminId);
  await model.createAuditLog(adminId, 'DISMISS_REPORT', 'Report', id);
  logger.debug({ adminId, id }, 'dismissReport completed');
  return report;
}

// --- Audit Logs ---

/** Pass-through: list audit log entries with optional entity filter. */
export async function listAuditLogs(
  page: number,
  perPage: number,
  entity?: string,
  requestId?: string,
) {
  const start = Date.now();
  logger.debug({ page, perPage, entity, requestId }, 'listAuditLogs started');
  const result = await model.listAuditLogs(page, perPage, entity);
  logger.debug(
    { page, perPage, total: result.total, requestId, durationMs: Date.now() - start },
    'listAuditLogs completed',
  );
  return result;
}

// --- Cache Flush ---

/**
 * Flush the entire cache or specific keys via cache provider.
 * Logs the action with key details (or 'ALL' if no keys specified).
 */
export async function flushCache(cache: CacheProvider, keys: string[]) {
  logger.debug({}, 'flushCache started');
  if (keys.length === 0) {
    await cache.deleteByPrefix(['cache']);
  } else {
    for (const key of keys) {
      await cache.delete(['cache', key]);
    }
  }
  await model.createAuditLog(
    'system',
    'FLUSH_CACHE',
    'Cache',
    undefined,
    keys.length > 0 ? keys.join(',') : 'ALL',
  );
  logger.debug({}, 'flushCache completed');
}

// --- Analytics ---

/** Pass-through: aggregate dashboard statistics (users, recipes, comments, reports, etc.). */
export async function getDashboardStats(requestId?: string) {
  const start = Date.now();
  logger.debug({ requestId }, 'getDashboardStats started');
  const result = await model.getDashboardStats();
  logger.debug(
    { found: !!result, requestId, durationMs: Date.now() - start },
    'getDashboardStats completed',
  );
  return result;
}

/** Pass-through: fetch user creation dates over N days for growth charting. */
export async function getUserGrowth(days: number, requestId?: string) {
  const start = Date.now();
  logger.debug({ days, requestId }, 'getUserGrowth started');
  const result = await model.getUserGrowth(days);
  logger.debug(
    { days, count: result.length, requestId, durationMs: Date.now() - start },
    'getUserGrowth completed',
  );
  return result;
}

/** Pass-through: fetch recipe creation dates over N days for growth charting. */
export async function getRecipeGrowth(days: number, requestId?: string) {
  const start = Date.now();
  logger.debug({ days, requestId }, 'getRecipeGrowth started');
  const result = await model.getRecipeGrowth(days);
  logger.debug(
    { days, count: result.length, requestId, durationMs: Date.now() - start },
    'getRecipeGrowth completed',
  );
  return result;
}

/** Pass-through: fetch top public recipes by like count. */
export async function getTopRecipes(limit: number, requestId?: string) {
  const start = Date.now();
  logger.debug({ limit, requestId }, 'getTopRecipes started');
  const result = await model.getTopRecipes(limit);
  logger.debug(
    { limit, count: result.length, requestId, durationMs: Date.now() - start },
    'getTopRecipes completed',
  );
  return result;
}

/** Pass-through: fetch top users ranked by recipe count. */
export async function getTopUsers(limit: number, requestId?: string) {
  const start = Date.now();
  logger.debug({ limit, requestId }, 'getTopUsers started');
  const result = await model.getTopUsers(limit);
  logger.debug(
    { limit, count: result.length, requestId, durationMs: Date.now() - start },
    'getTopUsers completed',
  );
  return result;
}

// --- Coffee Varieties (admin) ---

/** Pass-through: list all non-deleted coffee varieties with optional filters. */
export async function listCoffeeVarieties(
  page: number,
  perPage: number,
  category?: string,
  search?: string,
  requestId?: string,
) {
  const start = Date.now();
  logger.debug({ page, perPage, category, search, requestId }, 'listCoffeeVarieties started');
  const result = await model.listCoffeeVarieties(page, perPage, category, search);
  logger.debug(
    { page, perPage, total: result.total, requestId, durationMs: Date.now() - start },
    'listCoffeeVarieties completed',
  );
  return result;
}

/** Create a coffee variety and log the action. */
export async function createCoffeeVariety(
  adminId: string,
  data: typeof coffeeVarieties.$inferInsert,
) {
  logger.debug({ adminId }, 'createCoffeeVariety started');
  const variety = await model.createCoffeeVariety(data);
  await model.createAuditLog(
    adminId,
    'CREATE_COFFEE_VARIETY',
    'CoffeeVariety',
    variety.id,
    `name: ${data.name}`,
  );
  logger.debug({ adminId }, 'createCoffeeVariety completed');
  return variety;
}

/** Update a coffee variety and log the action. Throws if variety is not found. */
export async function updateCoffeeVariety(
  adminId: string,
  id: string,
  data: Partial<typeof coffeeVarieties.$inferInsert>,
) {
  logger.debug({ adminId, id }, 'updateCoffeeVariety started');
  const variety = await model.updateCoffeeVariety(id, data);
  if (!variety) throw new Error('COFFEE_VARIETY_NOT_FOUND');
  await model.createAuditLog(adminId, 'UPDATE_COFFEE_VARIETY', 'CoffeeVariety', id);
  logger.debug({ adminId, id }, 'updateCoffeeVariety completed');
  return variety;
}

/** Soft-delete a coffee variety and log the action. Throws if variety is not found. */
export async function deleteCoffeeVariety(adminId: string, id: string) {
  logger.debug({ adminId, id }, 'deleteCoffeeVariety started');
  const variety = await model.deleteCoffeeVariety(id);
  if (!variety) throw new Error('COFFEE_VARIETY_NOT_FOUND');
  await model.createAuditLog(adminId, 'DELETE_COFFEE_VARIETY', 'CoffeeVariety', id);
  logger.debug({ adminId, id }, 'deleteCoffeeVariety completed');
}

/** Pass-through: count recipes using a coffee variety. */
export async function getVarietyRecipeCount(varietyId: string, requestId?: string) {
  const start = Date.now();
  logger.debug({ varietyId, requestId }, 'getVarietyRecipeCount started');
  const result = await model.getVarietyRecipeCount(varietyId);
  logger.debug(
    { varietyId, count: result, requestId, durationMs: Date.now() - start },
    'getVarietyRecipeCount completed',
  );
  return result;
}

// --- Equipment Delete Requests (admin) ---

/** Pass-through: list equipment delete requests with optional status filter. */
export async function listEquipmentDeleteRequests(
  page: number,
  perPage: number,
  status?: string,
  requestId?: string,
) {
  const start = Date.now();
  logger.debug({ page, perPage, status, requestId }, 'listEquipmentDeleteRequests started');
  const result = await model.listEquipmentDeleteRequests(page, perPage, status);
  logger.debug(
    { page, perPage, total: result.total, requestId, durationMs: Date.now() - start },
    'listEquipmentDeleteRequests completed',
  );
  return result;
}

/** Approve an equipment delete request, soft-delete the equipment, and log the action. */
export async function approveEquipmentDeleteRequest(adminId: string, requestId: string) {
  logger.debug({ adminId, requestId }, 'approveEquipmentDeleteRequest started');
  const request = await model.approveEquipmentDeleteRequest(requestId, adminId);
  if (!request) throw new Error('DELETE_REQUEST_NOT_FOUND');
  await model.createAuditLog(
    adminId,
    'APPROVE_EQUIPMENT_DELETE',
    'EquipmentDeleteRequest',
    requestId,
    `equipmentId: ${request.equipmentId}`,
  );
  logger.debug({ adminId, requestId }, 'approveEquipmentDeleteRequest completed');
  return request;
}

/** Reject an equipment delete request and log the action. */
export async function rejectEquipmentDeleteRequest(adminId: string, requestId: string) {
  logger.debug({ adminId, requestId }, 'rejectEquipmentDeleteRequest started');
  const request = await model.rejectEquipmentDeleteRequest(requestId, adminId);
  if (!request) throw new Error('DELETE_REQUEST_NOT_FOUND');
  await model.createAuditLog(
    adminId,
    'REJECT_EQUIPMENT_DELETE',
    'EquipmentDeleteRequest',
    requestId,
  );
  logger.debug({ adminId, requestId }, 'rejectEquipmentDeleteRequest completed');
  return request;
}
