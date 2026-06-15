/**
 * Equipment setup business logic for BrewForm.
 *
 * Orchestrates setup CRUD with ownership checks, automatic default-flag
 * management (only one default per user), and a dedicated setDefault operation.
 */
import * as model from './model.ts';
import { createLogger } from '../../utils/logger/index.ts';

export const log = createLogger('setup-service');

/** List paginated setups for the authenticated user. */
export async function listSetups(userId: string, page: number, perPage: number) {
  log.debug({ userId, page, perPage }, 'listSetups started');
  const result = await model.findByUser(userId, page, perPage);
  log.debug({ userId, page, perPage, total: result.total }, 'listSetups completed');
  return result;
}

/** Get a setup by ID. Throws SETUP_NOT_FOUND if it doesn't exist. */
export async function getSetup(id: string) {
  log.debug({ id }, 'getSetup started');
  const setup = await model.findById(id);
  if (!setup) {
    log.error({ id }, 'getSetup failed: setup not found');
    throw new Error('SETUP_NOT_FOUND');
  }
  log.debug({ id }, 'getSetup completed');
  return setup;
}

/**
 * Create a new setup for the user.
 *
 * If isDefault is true, clears any existing default setup for this user first.
 */
export async function createSetup(userId: string, data: any) {
  log.debug({ userId }, 'createSetup started');
  if (data.isDefault) {
    log.debug({ userId }, 'createSetup clearing defaults for user');
    await model.clearDefaultForUser(userId);
  }
  const result = await model.create({ ...data, userId });
  log.debug({ userId, setupId: result.id }, 'createSetup completed');
  return result;
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
  log.debug({ userId, id }, 'updateSetup started');
  const setup = await model.findById(id);
  if (!setup) {
    log.error({ id, userId }, 'updateSetup failed: setup not found');
    throw new Error('SETUP_NOT_FOUND');
  }
  if (setup.userId !== userId) {
    log.warn({ id, userId, ownerId: setup.userId }, 'updateSetup failed: forbidden');
    throw new Error('FORBIDDEN');
  }

  if (data.isDefault) {
    log.debug({ userId }, 'updateSetup clearing defaults for user');
    await model.clearDefaultForUser(userId);
  }
  const updated = await model.update(id, data);
  if (!updated) {
    log.error({ id, userId }, 'updateSetup failed: setup not found');
    throw new Error('SETUP_NOT_FOUND');
  }
  log.debug({ userId, id }, 'updateSetup completed');
  return updated;
}

/**
 * Soft-delete a setup. Only the owner may delete.
 *
 * @throws SETUP_NOT_FOUND if the setup doesn't exist
 * @throws FORBIDDEN if the user doesn't own the setup
 */
export async function deleteSetup(userId: string, id: string) {
  log.debug({ userId, id }, 'deleteSetup started');
  const setup = await model.findById(id);
  if (!setup) {
    log.error({ id, userId }, 'deleteSetup failed: setup not found');
    throw new Error('SETUP_NOT_FOUND');
  }
  if (setup.userId !== userId) {
    log.warn({ id, userId, ownerId: setup.userId }, 'deleteSetup failed: forbidden');
    throw new Error('FORBIDDEN');
  }
  const deleted = await model.softDelete(id);
  if (!deleted) {
    log.error({ id, userId }, 'deleteSetup failed: setup not found');
    throw new Error('SETUP_NOT_FOUND');
  }
  log.debug({ userId, id }, 'deleteSetup completed');
}

/**
 * Mark a setup as the user's default.
 *
 * Clears any existing default first, then sets isDefault=true on the target.
 * @throws SETUP_NOT_FOUND if the setup doesn't exist
 * @throws FORBIDDEN if the user doesn't own the setup
 */
export async function setDefault(userId: string, id: string) {
  log.debug({ userId, id }, 'setDefault started');
  const setup = await model.findById(id);
  if (!setup) {
    log.error({ id, userId }, 'setDefault failed: setup not found');
    throw new Error('SETUP_NOT_FOUND');
  }
  if (setup.userId !== userId) {
    log.warn({ id, userId, ownerId: setup.userId }, 'setDefault failed: forbidden');
    throw new Error('FORBIDDEN');
  }

  log.debug({ userId }, 'setDefault clearing defaults for user');
  await model.clearDefaultForUser(userId);
  const result = await model.update(id, { isDefault: true });
  log.debug({ userId, id }, 'setDefault completed');
  return result;
}
