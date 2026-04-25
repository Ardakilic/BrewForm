import * as model from './model.ts';

export async function listSetups(userId: string, page: number, perPage: number) {
  return model.findByUser(userId, page, perPage);
}

export async function getSetup(id: string) {
  const setup = await model.findById(id);
  if (!setup) throw new Error('SETUP_NOT_FOUND');
  return setup;
}

export async function createSetup(userId: string, data: any) {
  if (data.isDefault) {
    await model.clearDefaultForUser(userId);
  }
  return model.create({ ...data, userId });
}

export async function updateSetup(userId: string, id: string, data: any) {
  const setup = await model.findById(id);
  if (!setup) throw new Error('SETUP_NOT_FOUND');
  if (setup.userId !== userId) throw new Error('FORBIDDEN');

  if (data.isDefault) {
    await model.clearDefaultForUser(userId);
  }
  return model.update(id, data);
}

export async function deleteSetup(userId: string, id: string) {
  const setup = await model.findById(id);
  if (!setup) throw new Error('SETUP_NOT_FOUND');
  if (setup.userId !== userId) throw new Error('FORBIDDEN');
  await model.softDelete(id);
}

export async function setDefault(userId: string, id: string) {
  const setup = await model.findById(id);
  if (!setup) throw new Error('SETUP_NOT_FOUND');
  if (setup.userId !== userId) throw new Error('FORBIDDEN');

  await model.clearDefaultForUser(userId);
  return model.update(id, { isDefault: true });
}