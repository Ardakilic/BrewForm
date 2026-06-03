/**
 * Vendor business logic for BrewForm.
 *
 * Orchestrates vendor CRUD with search support. Update and delete operations
 * verify the record exists before mutating.
 */
import type { z } from 'zod';
import * as model from './model.ts';
import { VendorCreateSchema, VendorUpdateSchema } from '@brewform/shared/schemas';
import { createLogger } from '../../utils/logger/index.ts';

const log = createLogger('vendor-service');

/** List all non-deleted vendors with pagination. */
export async function listVendors(page: number, perPage: number) {
  log.debug({ page, perPage }, 'listVendors started');
  const result = await model.findMany(page, perPage);
  log.debug({ page, perPage }, 'listVendors completed');
  return result;
}

/** Search non-deleted vendors by name (LIKE match), limited to 10 results. */
export async function searchVendors(query: string) {
  log.debug({ query }, 'searchVendors started');
  const result = await model.search(query);
  log.debug({ query }, 'searchVendors completed');
  return result;
}

/** Get a vendor by ID. Throws VENDOR_NOT_FOUND if it doesn't exist. */
export async function getVendor(id: string) {
  log.debug({ vendorId: id }, 'getVendor started');
  const vendor = await model.findById(id);
  if (!vendor) throw new Error('VENDOR_NOT_FOUND');
  log.debug({ vendorId: id }, 'getVendor completed');
  return vendor;
}

/**
 * Create a new vendor, recording the creating user.
 *
 * @param userId - The ID of the user creating the vendor
 * @param data   - Vendor fields (name, website, description)
 */
export async function createVendor(
  userId: string,
  data: z.infer<typeof VendorCreateSchema>,
) {
  log.debug({ userId }, 'createVendor started');
  const result = await model.create({ ...data, createdBy: userId });
  log.debug({ userId, vendorId: result.id }, 'createVendor completed');
  return result;
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
  data: z.infer<typeof VendorUpdateSchema>,
  isAdmin: boolean = false,
) {
  log.debug({ userId, vendorId: id, isAdmin }, 'updateVendor started');
  const vendor = await model.findById(id);
  if (!vendor) throw new Error('VENDOR_NOT_FOUND');
  if (vendor.createdBy !== userId && !isAdmin) throw new Error('FORBIDDEN');
  const result = await model.update(id, data);
  log.debug({ userId, vendorId: id }, 'updateVendor completed');
  return result;
}

/**
 * Soft-delete a vendor by ID.
 *
 * @throws VENDOR_NOT_FOUND if the vendor doesn't exist
 */
export async function deleteVendor(id: string) {
  log.debug({ vendorId: id }, 'deleteVendor started');
  const vendor = await model.findById(id);
  if (!vendor) throw new Error('VENDOR_NOT_FOUND');
  await model.softDelete(id);
  log.debug({ vendorId: id }, 'deleteVendor completed');
}
