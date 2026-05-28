import { equipment } from '@brewform/db/schema';
import * as model from './model.ts';
import { createLogger } from '../../utils/logger/index.ts';
import { cacheProvider } from '../../utils/cache/singleton.ts';

const log = createLogger('equipment');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getEquipment(id: string) {
  log.debug({ id }, 'getEquipment started');
  const eq = await model.findById(id);
  if (!eq) throw new Error('EQUIPMENT_NOT_FOUND');
  log.debug({ id }, 'getEquipment completed');
  return eq;
}

export async function getEquipmentById(id: string) {
  log.debug({ id }, 'getEquipmentById started');
  const cacheKey = ['equipment-detail', id];
  const cached = await cacheProvider?.get<Record<string, unknown>>(cacheKey);
  if (cached) {
    log.debug({ id }, 'getEquipmentById cache hit');
    return cached;
  }
  const eq = await model.findById(id);
  if (!eq) {
    log.debug({ id }, 'getEquipmentById not found');
    return null;
  }
  await cacheProvider?.set(cacheKey, eq as unknown as Record<string, unknown>, {
    ttlMs: CACHE_TTL_MS,
  });
  log.debug({ id }, 'getEquipmentById completed');
  return eq;
}

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

export async function searchEquipment(query: string) {
  log.debug({ query }, 'searchEquipment started');
  const result = await model.search(query);
  log.debug({ query }, 'searchEquipment completed');
  return result;
}

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

export async function updateEquipment(
  userId: string,
  id: string,
  data: Partial<typeof equipment.$inferInsert>,
) {
  log.debug({ userId, id }, 'updateEquipment started');
  const eq = await model.findById(id);
  if (!eq) throw new Error('EQUIPMENT_NOT_FOUND');
  if (eq.createdBy !== userId) throw new Error('FORBIDDEN');
  log.debug({ userId, id }, 'updateEquipment completed');
  return model.update(id, data);
}

export async function deleteEquipment(userId: string, id: string) {
  log.debug({ userId, id }, 'deleteEquipment started');
  const eq = await model.findById(id);
  if (!eq) throw new Error('EQUIPMENT_NOT_FOUND');
  if (eq.createdBy !== userId) throw new Error('FORBIDDEN');
  await model.softDelete(id);
  log.debug({ userId, id }, 'deleteEquipment completed');
}

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
