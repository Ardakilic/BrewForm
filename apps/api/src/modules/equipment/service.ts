import * as model from './model.ts';

export async function getEquipment(id: string) {
  const equipment = await model.findById(id);
  if (!equipment) throw new Error('EQUIPMENT_NOT_FOUND');
  return equipment;
}

export async function listEquipment(type: string | undefined, page: number, perPage: number) {
  const where: any = {};
  if (type) where.type = type;
  return model.findMany(where, page, perPage);
}

export async function searchEquipment(query: string) {
  return model.search(query);
}

export async function createEquipment(userId: string, data: any) {
  return model.create({
    ...data,
    createdBy: userId,
  });
}

export async function updateEquipment(userId: string, id: string, data: any) {
  const equipment = await model.findById(id);
  if (!equipment) throw new Error('EQUIPMENT_NOT_FOUND');
  if (equipment.createdBy !== userId) throw new Error('FORBIDDEN');
  return model.update(id, data);
}

export async function deleteEquipment(userId: string, id: string) {
  const equipment = await model.findById(id);
  if (!equipment) throw new Error('EQUIPMENT_NOT_FOUND');
  if (equipment.createdBy !== userId) throw new Error('FORBIDDEN');
  await model.softDelete(id);
}