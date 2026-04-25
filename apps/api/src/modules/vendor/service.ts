import * as model from './model.ts';

export async function listVendors(page: number, perPage: number) {
  return model.findMany(page, perPage);
}

export async function searchVendors(query: string) {
  return model.search(query);
}

export async function getVendor(id: string) {
  const vendor = await model.findById(id);
  if (!vendor) throw new Error('VENDOR_NOT_FOUND');
  return vendor;
}

export async function createVendor(data: any) {
  return model.create(data);
}

export async function updateVendor(userId: string, id: string, data: any) {
  const vendor = await model.findById(id);
  if (!vendor) throw new Error('VENDOR_NOT_FOUND');
  return model.update(id, data);
}

export async function deleteVendor(id: string) {
  const vendor = await model.findById(id);
  if (!vendor) throw new Error('VENDOR_NOT_FOUND');
  await model.softDelete(id);
}