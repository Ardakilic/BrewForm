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
// deno-lint-ignore-file require-await
import * as model from './model.ts';
import type { CacheProvider } from '../../utils/cache/index.ts';
import { sendWelcomeEmail } from '../auth/email.ts';
import { createLogger } from '../../utils/logger/index.ts';
import { coffeeVarieties } from '@brewform/db/schema';

const logger = createLogger('admin-service');

// --- Users ---

/** Pass-through: fetch a paginated list of non-deleted users with optional search. */
export async function listUsers(page: number, perPage: number, query?: string) {
  return model.listUsers(page, perPage, query);
}

/** Pass-through: fetch a single non-deleted user by ID. */
export async function getUserDetail(userId: string) {
  return model.getUserById(userId);
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
export async function listAllRecipes(page: number, perPage: number, visibility?: string) {
  return model.listAllRecipes(page, perPage, visibility);
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
export async function listEquipment(page: number, perPage: number) {
  return model.listEquipment(page, perPage);
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
export async function updateEquipment(adminId: string, id: string, data: any) {
  logger.debug({ adminId, id }, 'updateEquipment started');
  const equipment = await model.updateEquipment(id, data);
  await model.createAuditLog(adminId, 'UPDATE_EQUIPMENT', 'Equipment', id);
  logger.debug({ adminId, id }, 'updateEquipment completed');
  return equipment;
}

/** Soft-delete an equipment record and log the action. */
export async function deleteEquipment(adminId: string, id: string) {
  logger.debug({ adminId, id }, 'deleteEquipment started');
  await model.deleteEquipment(id);
  await model.createAuditLog(adminId, 'DELETE_EQUIPMENT', 'Equipment', id);
  logger.debug({ adminId, id }, 'deleteEquipment completed');
}

// --- Vendors ---

/** Pass-through: list all non-deleted vendors. */
export async function listVendors(page: number, perPage: number) {
  return model.listVendors(page, perPage);
}

/** Create a vendor and log the action. */
export async function createVendor(
  adminId: string,
  data: { name: string; website?: string; description?: string },
) {
  logger.debug({ adminId }, 'createVendor started');
  const vendor = await model.createVendor(data);
  await model.createAuditLog(adminId, 'CREATE_VENDOR', 'Vendor', vendor.id);
  logger.debug({ adminId }, 'createVendor completed');
  return vendor;
}

/** Update a vendor and log the action. */
export async function updateVendor(adminId: string, id: string, data: any) {
  logger.debug({ adminId, id }, 'updateVendor started');
  const vendor = await model.updateVendor(id, data);
  await model.createAuditLog(adminId, 'UPDATE_VENDOR', 'Vendor', id);
  logger.debug({ adminId, id }, 'updateVendor completed');
  return vendor;
}

/** Soft-delete a vendor and log the action. */
export async function deleteVendor(adminId: string, id: string) {
  logger.debug({ adminId, id }, 'deleteVendor started');
  await model.deleteVendor(id);
  await model.createAuditLog(adminId, 'DELETE_VENDOR', 'Vendor', id);
  logger.debug({ adminId, id }, 'deleteVendor completed');
}

// --- Taste Notes (admin) ---

/** Delegates to the taste module to return the full taste note hierarchy (cached). */
export async function listTasteNotes(cache: CacheProvider) {
  const { getHierarchy } = await import('../taste/service.ts');
  return getHierarchy(cache);
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
export async function listCompatibilityRules() {
  return model.listCompatibilityRules();
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
export async function createCompatibilityRule(adminId: string, data: any, cache: CacheProvider) {
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
) {
  return model.listReports(page, perPage, status, entityType);
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
export async function listAuditLogs(page: number, perPage: number, entity?: string) {
  return model.listAuditLogs(page, perPage, entity);
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
export async function getDashboardStats() {
  return model.getDashboardStats();
}

/** Pass-through: fetch user creation dates over N days for growth charting. */
export async function getUserGrowth(days: number) {
  return model.getUserGrowth(days);
}

/** Pass-through: fetch recipe creation dates over N days for growth charting. */
export async function getRecipeGrowth(days: number) {
  return model.getRecipeGrowth(days);
}

/** Pass-through: fetch top public recipes by like count. */
export async function getTopRecipes(limit: number) {
  return model.getTopRecipes(limit);
}

/** Pass-through: fetch top users ranked by recipe count. */
export async function getTopUsers(limit: number) {
  return model.getTopUsers(limit);
}

// --- Coffee Varieties (admin) ---

/** Pass-through: list all non-deleted coffee varieties with optional filters. */
export async function listCoffeeVarieties(
  page: number,
  perPage: number,
  category?: string,
  search?: string,
) {
  return model.listCoffeeVarieties(page, perPage, category, search);
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
export async function getVarietyRecipeCount(varietyId: string) {
  return model.getVarietyRecipeCount(varietyId);
}

// --- Equipment Delete Requests (admin) ---

/** Pass-through: list equipment delete requests with optional status filter. */
export async function listEquipmentDeleteRequests(
  page: number,
  perPage: number,
  status?: string,
) {
  return model.listEquipmentDeleteRequests(page, perPage, status);
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
