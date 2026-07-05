import { equipment } from '@brewform/db/schema';
import * as model from './model.ts';
import { createLogger } from '../../utils/logger/index.ts';
import { cacheProvider } from '../../utils/cache/singleton.ts';

/**
 * Equipment service.
 *
 * Provides CRUD operations, search, deletion requests, and recipe lookups for brewing equipment.
 */
const log = createLogger('equipment');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Get equipment by ID with 24h cache. Returns null if not found.
 */
export async function getEquipment(id: string) {
  log.debug({ id }, 'getEquipment started');
  const eq = await model.findById(id);
  if (!eq) throw new Error('EQUIPMENT_NOT_FOUND');
  log.debug({ id }, 'getEquipment completed');
  return eq;
}

/**
 * Get equipment by ID, caching the result for 24 hours.
 */
export async function getEquipmentById(id: string) {
  log.debug({ id }, 'getEquipmentById started');
  const cacheKey = ['equipment-detail', id];
  const cached = await cacheProvider?.get<typeof equipment.$inferSelect>(cacheKey);
  if (cached) {
    log.debug({ id }, 'getEquipmentById cache hit');
    return cached;
  }
  const eq = await model.findById(id);
  if (!eq) {
    log.debug({ id }, 'getEquipmentById not found');
    return null;
  }
  await cacheProvider?.set(cacheKey, eq, {
    ttlMs: CACHE_TTL_MS,
  });
  log.debug({ id }, 'getEquipmentById completed');
  return eq;
}

/**
 * List equipment with optional type/search filters and pagination.
 */
export async function listEquipmentWithFilters(params: {
  type?: string;
  search?: string;
  page: number;
  perPage: number;
}) {
  log.debug({}, 'listEquipmentWithFilters started');
  const result = await model.findManyWithFilters(params);
  log.debug({}, 'listEquipmentWithFilters completed');
  return result;
}

/**
 * Search equipment by free-text query.
 */
export async function searchEquipment(query: string) {
  log.debug({ query }, 'searchEquipment started');
  const result = await model.search(query);
  log.debug({ query }, 'searchEquipment completed');
  return result;
}

/**
 * Create a new equipment record owned by the given user.
 */
export async function createEquipment(
  userId: string,
  data: typeof equipment.$inferInsert,
) {
  log.debug({ userId }, 'createEquipment started');
  const result = await model.create({
    ...data,
    createdBy: userId,
  });
  log.debug({ userId }, 'createEquipment completed');
  return result;
}

/**
 * Update an equipment record.
 *
 * @param userId - ID of the requesting user.
 * @param id - Equipment ID.
 * @param data - Fields to update.
 * @throws {Error} EQUIPMENT_NOT_FOUND if the equipment doesn't exist.
 * @throws {Error} FORBIDDEN if the user is not the creator.
 */
export async function updateEquipment(
  userId: string,
  id: string,
  data: Partial<typeof equipment.$inferInsert>,
) {
  log.debug({ userId, id }, 'updateEquipment started');
  const eq = await model.findById(id);
  if (!eq) throw new Error('EQUIPMENT_NOT_FOUND');
  if (eq.createdBy !== userId) throw new Error('FORBIDDEN');
  await cacheProvider?.delete(['equipment-detail', id]);
  const result = await model.update(id, data);
  log.debug({ userId, id }, 'updateEquipment completed');
  return result;
}

/**
 * Soft-delete an equipment record.
 *
 * @param userId - ID of the requesting user.
 * @param id - Equipment ID.
 * @throws {Error} EQUIPMENT_NOT_FOUND if the equipment doesn't exist.
 * @throws {Error} FORBIDDEN if the user is not the creator.
 */
export async function deleteEquipment(userId: string, id: string) {
  log.debug({ userId, id }, 'deleteEquipment started');
  const eq = await model.findById(id);
  if (!eq) throw new Error('EQUIPMENT_NOT_FOUND');
  if (eq.createdBy !== userId) throw new Error('FORBIDDEN');
  await cacheProvider?.delete(['equipment-detail', id]);
  await model.softDelete(id);
  log.debug({ userId, id }, 'deleteEquipment completed');
}

/**
 * Submit a deletion request for a piece of equipment.
 *
 * @param equipmentId - Equipment ID.
 * @param userId - ID of the requesting user.
 * @param reason - Optional reason for the deletion request.
 */
export async function requestEquipmentDeletion(
  equipmentId: string,
  userId: string,
  reason?: string,
) {
  log.debug({ equipmentId, userId }, 'requestEquipmentDeletion started');
  const eq = await model.findById(equipmentId);
  if (!eq) throw new Error('EQUIPMENT_NOT_FOUND');
  log.debug({ equipmentId, userId }, 'requestEquipmentDeletion completed');
  return model.createDeleteRequest({
    equipmentId,
    requestedById: userId,
    reason: reason ?? null,
  });
}

/**
 * Get recipes that use the given equipment, paginated.
 */
export async function getRecipesForEquipment(
  equipmentId: string,
  page: number,
  perPage: number,
) {
  log.debug({ equipmentId, page, perPage }, 'getRecipesForEquipment started');
  const result = await model.getRecipesUsingEquipment(equipmentId, page, perPage);
  log.debug({ equipmentId }, 'getRecipesForEquipment completed');
  return result;
}
