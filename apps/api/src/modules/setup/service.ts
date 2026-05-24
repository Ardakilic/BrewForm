/**
 * Equipment setup business logic for BrewForm.
 *
 * Orchestrates setup CRUD with ownership checks, automatic default-flag
 * management (only one default per user), and a dedicated setDefault operation.
 */
import * as model from './model.ts';

/** List paginated setups for the authenticated user. */
export async function listSetups(userId: string, page: number, perPage: number) {
  return model.findByUser(userId, page, perPage);
}

/** Get a setup by ID. Throws SETUP_NOT_FOUND if it doesn't exist. */
export async function getSetup(id: string) {
  const setup = await model.findById(id);
  if (!setup) throw new Error('SETUP_NOT_FOUND');
  return setup;
}

/**
 * Create a new setup for the user.
 *
 * If isDefault is true, clears any existing default setup for this user first.
 */
export async function createSetup(userId: string, data: any) {
  if (data.isDefault) {
    await model.clearDefaultForUser(userId);
  }
  return model.create({ ...data, userId });
}

/** User-editable fields for a setup update. */
export interface UpdateSetupPayload {
  name?: string;
  brewerDetails?: string | null;
  grinder?: string | null;
  portafilterId?: string | null;
  basketId?: string | null;
  puckScreenId?: string | null;
  paperFilterId?: string | null;
  tamperId?: string | null;
  isDefault?: boolean;
}

/**
 * Update a setup. Only the owner may update.
 *
 * If isDefault is true, clears any existing default setup for this user first.
 * @throws SETUP_NOT_FOUND if the setup doesn't exist
 * @throws FORBIDDEN if the user doesn't own the setup
 */
export async function updateSetup(userId: string, id: string, data: UpdateSetupPayload) {
  const setup = await model.findById(id);
  if (!setup) throw new Error('SETUP_NOT_FOUND');
  if (setup.userId !== userId) throw new Error('FORBIDDEN');

  if (data.isDefault) {
    await model.clearDefaultForUser(userId);
  }
  const updated = await model.update(id, data);
  if (!updated) throw new Error('SETUP_NOT_FOUND');
  return updated;
}

/**
 * Soft-delete a setup. Only the owner may delete.
 *
 * @throws SETUP_NOT_FOUND if the setup doesn't exist
 * @throws FORBIDDEN if the user doesn't own the setup
 */
export async function deleteSetup(userId: string, id: string) {
  const setup = await model.findById(id);
  if (!setup) throw new Error('SETUP_NOT_FOUND');
  if (setup.userId !== userId) throw new Error('FORBIDDEN');
  const deleted = await model.softDelete(id);
  if (!deleted) throw new Error('SETUP_NOT_FOUND');
}

/**
 * Mark a setup as the user's default.
 *
 * Clears any existing default first, then sets isDefault=true on the target.
 * @throws SETUP_NOT_FOUND if the setup doesn't exist
 * @throws FORBIDDEN if the user doesn't own the setup
 */
export async function setDefault(userId: string, id: string) {
  const setup = await model.findById(id);
  if (!setup) throw new Error('SETUP_NOT_FOUND');
  if (setup.userId !== userId) throw new Error('FORBIDDEN');

  await model.clearDefaultForUser(userId);
  return model.update(id, { isDefault: true });
}
