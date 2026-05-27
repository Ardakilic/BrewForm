import { equipment } from '@brewform/db/schema';
import * as model from './model.ts';
import { cacheProvider } from '../../utils/cache/singleton.ts';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getEquipment(id: string) {
  const eq = await model.findById(id);
  if (!eq) throw new Error('EQUIPMENT_NOT_FOUND');
  return eq;
}

export async function getEquipmentById(id: string) {
  const cacheKey = ['equipment-detail', id];
  const cached = await cacheProvider?.get<Record<string, unknown>>(cacheKey);
  if (cached) return cached;
  const eq = await model.findById(id);
  if (!eq) return null;
  await cacheProvider?.set(cacheKey, eq as unknown as Record<string, unknown>, {
    ttlMs: CACHE_TTL_MS,
  });
  return eq;
}

export async function listEquipmentWithFilters(params: {
  type?: string;
  search?: string;
  page: number;
  perPage: number;
}) {
  return model.findManyWithFilters(params);
}

export async function searchEquipment(query: string) {
  return model.search(query);
}

export async function createEquipment(
  userId: string,
  data: typeof equipment.$inferInsert,
) {
  return model.create({
    ...data,
    createdBy: userId,
  });
}

export async function updateEquipment(
  userId: string,
  id: string,
  data: Partial<typeof equipment.$inferInsert>,
) {
  const eq = await model.findById(id);
  if (!eq) throw new Error('EQUIPMENT_NOT_FOUND');
  if (eq.createdBy !== userId) throw new Error('FORBIDDEN');
  return model.update(id, data);
}

export async function deleteEquipment(userId: string, id: string) {
  const eq = await model.findById(id);
  if (!eq) throw new Error('EQUIPMENT_NOT_FOUND');
  if (eq.createdBy !== userId) throw new Error('FORBIDDEN');
  await model.softDelete(id);
}

export async function requestEquipmentDeletion(
  equipmentId: string,
  userId: string,
  reason?: string,
) {
  const eq = await model.findById(equipmentId);
  if (!eq) throw new Error('EQUIPMENT_NOT_FOUND');
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
  return model.getRecipesUsingEquipment(equipmentId, page, perPage);
}
