/**
 * Vendor business logic for BrewForm.
 *
 * Orchestrates vendor CRUD with search support. Update and delete operations
 * verify the record exists before mutating.
 */
import * as model from './model.ts';

/** List all non-deleted vendors with pagination. */
export async function listVendors(page: number, perPage: number) {
  return model.findMany(page, perPage);
}

/** Search non-deleted vendors by name (LIKE match), limited to 10 results. */
export async function searchVendors(query: string) {
  return model.search(query);
}

/** Get a vendor by ID. Throws VENDOR_NOT_FOUND if it doesn't exist. */
export async function getVendor(id: string) {
  const vendor = await model.findById(id);
  if (!vendor) throw new Error('VENDOR_NOT_FOUND');
  return vendor;
}

/** Create a new vendor. */
export async function createVendor(data: any) {
  return model.create(data);
}

/**
 * Update a vendor by ID.
 *
 * @throws VENDOR_NOT_FOUND if the vendor doesn't exist
 */
export async function updateVendor(_userId: string, id: string, data: any) {
  const vendor = await model.findById(id);
  if (!vendor) throw new Error('VENDOR_NOT_FOUND');
  return model.update(id, data);
}

/**
 * Soft-delete a vendor by ID.
 *
 * @throws VENDOR_NOT_FOUND if the vendor doesn't exist
 */
export async function deleteVendor(id: string) {
  const vendor = await model.findById(id);
  if (!vendor) throw new Error('VENDOR_NOT_FOUND');
  await model.softDelete(id);
}
