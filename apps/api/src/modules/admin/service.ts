// deno-lint-ignore-file require-await
import * as model from './model.ts';
import type { CacheProvider } from '../../utils/cache/index.ts';

// --- Users ---

export async function listUsers(page: number, perPage: number, query?: string) {
  return model.listUsers(page, perPage, query);
}

export async function getUserDetail(userId: string) {
  return model.getUserById(userId);
}

export async function banUser(adminId: string, userId: string) {
  const user = await model.banUser(userId);
  await model.createAuditLog(adminId, 'BAN_USER', 'User', userId);
  return user;
}

export async function unbanUser(adminId: string, userId: string) {
  const user = await model.unbanUser(userId);
  await model.createAuditLog(adminId, 'UNBAN_USER', 'User', userId);
  return user;
}

export async function setUserAdminRole(adminId: string, userId: string, isAdmin: boolean) {
  const user = await model.setUserAdminRole(userId, isAdmin);
  await model.createAuditLog(adminId, isAdmin ? 'SET_ADMIN' : 'REMOVE_ADMIN', 'User', userId, `isAdmin: ${isAdmin}`);
  return user;
}

export async function adminCreateUser(adminId: string, data: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
  isAdmin?: boolean;
}) {
  const user = await model.adminCreateUser(data);
  await model.createAuditLog(adminId, 'CREATE_USER', 'User', (user as any).id, `username: ${data.username}`);
  return user;
}

export async function softDeleteUser(adminId: string, userId: string) {
  await model.softDeleteUser(userId);
  await model.createAuditLog(adminId, 'SOFT_DELETE_USER', 'User', userId);
}

// --- Recipes ---

export async function listAllRecipes(page: number, perPage: number, visibility?: string) {
  return model.listAllRecipes(page, perPage, visibility);
}

export async function updateRecipeVisibility(adminId: string, recipeId: string, visibility: string) {
  const recipe = await model.updateRecipeVisibility(recipeId, visibility);
  await model.createAuditLog(adminId, 'UPDATE_RECIPE_VISIBILITY', 'Recipe', recipeId, `visibility: ${visibility}`);
  return recipe;
}

export async function softDeleteRecipe(adminId: string, recipeId: string) {
  await model.softDeleteRecipe(recipeId);
  await model.createAuditLog(adminId, 'SOFT_DELETE_RECIPE', 'Recipe', recipeId);
}

// --- Equipment ---

export async function listEquipment(page: number, perPage: number) {
  return model.listEquipment(page, perPage);
}

export async function createEquipment(adminId: string, data: { name: string; type: string; brand?: string; model?: string; description?: string }) {
  const equipment = await model.createEquipment(data);
  await model.createAuditLog(adminId, 'CREATE_EQUIPMENT', 'Equipment', equipment.id);
  return equipment;
}

export async function updateEquipment(adminId: string, id: string, data: any) {
  const equipment = await model.updateEquipment(id, data);
  await model.createAuditLog(adminId, 'UPDATE_EQUIPMENT', 'Equipment', id);
  return equipment;
}

export async function deleteEquipment(adminId: string, id: string) {
  await model.deleteEquipment(id);
  await model.createAuditLog(adminId, 'DELETE_EQUIPMENT', 'Equipment', id);
}

// --- Vendors ---

export async function listVendors(page: number, perPage: number) {
  return model.listVendors(page, perPage);
}

export async function createVendor(adminId: string, data: { name: string; website?: string; description?: string }) {
  const vendor = await model.createVendor(data);
  await model.createAuditLog(adminId, 'CREATE_VENDOR', 'Vendor', vendor.id);
  return vendor;
}

export async function updateVendor(adminId: string, id: string, data: any) {
  const vendor = await model.updateVendor(id, data);
  await model.createAuditLog(adminId, 'UPDATE_VENDOR', 'Vendor', id);
  return vendor;
}

export async function deleteVendor(adminId: string, id: string) {
  await model.deleteVendor(id);
  await model.createAuditLog(adminId, 'DELETE_VENDOR', 'Vendor', id);
}

// --- Taste Notes (admin) ---

export async function listTasteNotes(cache: CacheProvider) {
  const { getHierarchy } = await import('../taste/service.ts');
  return getHierarchy(cache);
}

export async function createTasteNote(adminId: string, data: { name: string; parentId?: string; color?: string; definition?: string; depth: number }, cache: CacheProvider) {
  const { createTasteNote } = await import('../taste/service.ts');
  const note = await createTasteNote(data, cache);
  await model.createAuditLog(adminId, 'CREATE_TASTE_NOTE', 'TasteNote', note.id, `name: ${data.name}`);
  return note;
}

export async function updateTasteNote(adminId: string, id: string, data: { name?: string; color?: string; definition?: string }, cache: CacheProvider) {
  const { updateTasteNote } = await import('../taste/service.ts');
  const note = await updateTasteNote(id, data, cache);
  await model.createAuditLog(adminId, 'UPDATE_TASTE_NOTE', 'TasteNote', id);
  return note;
}

export async function deleteTasteNote(adminId: string, id: string, cache: CacheProvider) {
  const { deleteTasteNote } = await import('../taste/service.ts');
  await deleteTasteNote(id, cache);
  await model.createAuditLog(adminId, 'DELETE_TASTE_NOTE', 'TasteNote', id);
}

// --- Brew Method Compatibility Matrix ---

export async function listCompatibilityRules() {
  return model.listCompatibilityRules();
}

export async function updateCompatibilityRule(adminId: string, id: string, compatible: boolean, cache: CacheProvider) {
  const rule = await model.updateCompatibilityRule(id, compatible);
  await model.createAuditLog(adminId, 'UPDATE_COMPATIBILITY_RULE', 'BrewMethodEquipmentRule', id, `compatible: ${compatible}`);
  await cache.deleteByPrefix(['cache', 'compatibility']);
  return rule;
}

export async function createCompatibilityRule(adminId: string, data: any, cache: CacheProvider) {
  const rule = await model.createCompatibilityRule(data);
  await model.createAuditLog(adminId, 'CREATE_COMPATIBILITY_RULE', 'BrewMethodEquipmentRule', rule.id);
  await cache.deleteByPrefix(['cache', 'compatibility']);
  return rule;
}

export async function deleteCompatibilityRule(adminId: string, id: string, cache: CacheProvider) {
  await model.deleteCompatibilityRule(id);
  await model.createAuditLog(adminId, 'DELETE_COMPATIBILITY_RULE', 'BrewMethodEquipmentRule', id);
  await cache.deleteByPrefix(['cache', 'compatibility']);
}

// --- Reports (admin) ---

export async function listReports(page: number, perPage: number, status?: string, entityType?: string) {
  return model.listReports(page, perPage, status, entityType);
}

export async function resolveReport(adminId: string, id: string) {
  const report = await model.resolveReport(id, adminId);
  await model.createAuditLog(adminId, 'RESOLVE_REPORT', 'Report', id);
  return report;
}

export async function dismissReport(adminId: string, id: string) {
  const report = await model.dismissReport(id, adminId);
  await model.createAuditLog(adminId, 'DISMISS_REPORT', 'Report', id);
  return report;
}

// --- Audit Logs ---

export async function listAuditLogs(page: number, perPage: number, entity?: string) {
  return model.listAuditLogs(page, perPage, entity);
}

// --- Cache Flush ---

export async function flushCache(cache: CacheProvider, keys: string[]) {
  if (keys.length === 0) {
    await cache.deleteByPrefix(['cache']);
  } else {
    for (const key of keys) {
      await cache.delete(['cache', key]);
    }
  }
  await model.createAuditLog('system', 'FLUSH_CACHE', 'Cache', undefined, keys.length > 0 ? keys.join(',') : 'ALL');
}

// --- Analytics ---

export async function getDashboardStats() {
  return model.getDashboardStats();
}

export async function getUserGrowth(days: number) {
  return model.getUserGrowth(days);
}

export async function getRecipeGrowth(days: number) {
  return model.getRecipeGrowth(days);
}

export async function getTopRecipes(limit: number) {
  return model.getTopRecipes(limit);
}

export async function getTopUsers(limit: number) {
  return model.getTopUsers(limit);
}