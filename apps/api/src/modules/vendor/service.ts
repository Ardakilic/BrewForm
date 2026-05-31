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

/**
 * Create a new vendor, recording the creating user.
 *
 * @param userId - The ID of the user creating the vendor
 * @param data   - Vendor fields (name, website, description)
 */
export async function createVendor(userId: string, data: any) {
  return model.create({ ...data, createdBy: userId });
}

/**
 * Update a vendor by ID. Only the creator (or an admin) may update.
 *
 * @param userId  - The ID of the requesting user
 * @param id      - Vendor ID to update
 * @param data    - Fields to patch (name, website, description)
 * @param isAdmin - Whether the requesting user is an admin
 * @throws VENDOR_NOT_FOUND if the vendor doesn't exist
 * @throws FORBIDDEN if the user is neither the creator nor an admin
 */
export async function updateVendor(
  userId: string,
  id: string,
  data: any,
  isAdmin: boolean = false,
) {
  const vendor = await model.findById(id);
  if (!vendor) throw new Error('VENDOR_NOT_FOUND');
  if (vendor.createdBy !== userId && !isAdmin) throw new Error('FORBIDDEN');
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
