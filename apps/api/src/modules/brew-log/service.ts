import * as model from './model.ts';
import type { BrewLogCreate, BrewLogUpdate } from '@brewform/shared/schemas';
import { createLogger } from '../../utils/logger/index.ts';
import * as recipeModel from '../recipe/model.ts';

/** Module logger (exported for test spies — mirrors collection/service.ts). */
export const logger = createLogger('brew-log-service');

/**
 * Create a brew log for the authenticated user.
 *
 * The recipe must exist and be visible to the user (public, or authored by
 * the user); non-public recipes of other users are reported as not found.
 * When `recipeVersionId` is given it must belong to that recipe. `brewedAt`
 * defaults to now.
 *
 * @param userId - The authenticated user's UUID.
 * @param data   - Brew log creation payload.
 * @throws 'RECIPE_NOT_FOUND' if the recipe is missing, soft-deleted, or not visible to the user.
 * @throws 'RECIPE_VERSION_MISMATCH' if the version does not belong to the recipe.
 * @returns The created brew log row.
 */
export async function createBrewLog(userId: string, data: BrewLogCreate) {
  logger.debug({ userId, recipeId: data.recipeId }, 'createBrewLog started');
  try {
    const recipe = await recipeModel.findById(data.recipeId);
    if (!recipe || (recipe.visibility !== 'public' && recipe.authorId !== userId)) {
      throw new Error('RECIPE_NOT_FOUND');
    }
    if (data.recipeVersionId) {
      const version = await recipeModel.fetchRecipeVersionWithRelations(data.recipeVersionId);
      if (!version || version.recipeId !== data.recipeId) {
        throw new Error('RECIPE_VERSION_MISMATCH');
      }
    }
    const created = await model.create({
      userId,
      recipeId: data.recipeId,
      recipeVersionId: data.recipeVersionId,
      brewedAt: data.brewedAt ? new Date(data.brewedAt) : new Date(),
      yieldActual: data.yieldActual,
      doseActual: data.doseActual,
      notes: data.notes,
      personalRating: data.personalRating,
    });
    logger.debug({ userId, brewLogId: created.id }, 'createBrewLog completed');
    return created;
  } catch (err) {
    logger.error({ err, userId, recipeId: data.recipeId }, 'createBrewLog failed');
    throw err;
  }
}

/**
 * Get one of the authenticated user's brew logs. Only the owner can read it;
 * a missing or foreign log is reported as not found.
 *
 * @param userId - The authenticated user's UUID.
 * @param id     - The brew log's UUID.
 * @throws 'BREW_LOG_NOT_FOUND' if the log does not exist or belongs to another user.
 * @returns The brew log row.
 */
export async function getBrewLog(userId: string, id: string) {
  logger.debug({ userId, id }, 'getBrewLog started');
  try {
    const log = await model.findById(id);
    if (!log || log.userId !== userId) throw new Error('BREW_LOG_NOT_FOUND');
    logger.debug({ userId, id }, 'getBrewLog completed');
    return log;
  } catch (err) {
    logger.error({ err, userId, id }, 'getBrewLog failed');
    throw err;
  }
}

/**
 * Update a brew log. Only the owner can update it; a missing or foreign log
 * is reported as not found. Explicit nulls clear the corresponding field.
 *
 * @param userId - The authenticated user's UUID.
 * @param id     - The brew log's UUID.
 * @param data   - Partial update payload (at least one field).
 * @throws 'BREW_LOG_NOT_FOUND' if the log does not exist or belongs to another user.
 * @returns The updated brew log row.
 */
export async function updateBrewLog(userId: string, id: string, data: BrewLogUpdate) {
  logger.debug({ userId, id }, 'updateBrewLog started');
  try {
    const updated = await model.update(id, userId, {
      ...data,
      brewedAt: data.brewedAt !== undefined ? new Date(data.brewedAt) : undefined,
    });
    if (!updated) throw new Error('BREW_LOG_NOT_FOUND');
    logger.debug({ userId, id }, 'updateBrewLog completed');
    return updated;
  } catch (err) {
    logger.error({ err, userId, id }, 'updateBrewLog failed');
    throw err;
  }
}

/**
 * Soft-delete a brew log. Only the owner can delete it; a missing or foreign
 * log is reported as not found.
 *
 * @param userId - The authenticated user's UUID.
 * @param id     - The brew log's UUID.
 * @throws 'BREW_LOG_NOT_FOUND' if the log does not exist or belongs to another user.
 * @returns The soft-deleted brew log row.
 */
export async function deleteBrewLog(userId: string, id: string) {
  logger.debug({ userId, id }, 'deleteBrewLog started');
  try {
    const deleted = await model.softDelete(id, userId);
    if (!deleted) throw new Error('BREW_LOG_NOT_FOUND');
    logger.debug({ userId, id }, 'deleteBrewLog completed');
    return deleted;
  } catch (err) {
    logger.error({ err, userId, id }, 'deleteBrewLog failed');
    throw err;
  }
}

/**
 * List the authenticated user's brew logs, paginated, newest brews first.
 * @param userId  - The authenticated user's UUID.
 * @param page    - 1-based page number.
 * @param perPage - Page size.
 * @returns `{ brewLogs, total }` with recipe title/slug per row.
 */
export async function listUserBrewLogs(userId: string, page: number, perPage: number) {
  logger.debug({ userId, page, perPage }, 'listUserBrewLogs started');
  const result = await model.findByUserId(userId, page, perPage);
  logger.debug({ userId, total: result.total }, 'listUserBrewLogs completed');
  return result;
}

/**
 * List a user's brew logs for one recipe, paginated, newest brews first.
 * @param userId   - The authenticated user's UUID.
 * @param recipeId - The recipe's UUID.
 * @param page     - 1-based page number.
 * @param perPage  - Page size.
 * @returns `{ brewLogs, total }` with recipe title/slug per row.
 */
export async function listRecipeBrewLogs(
  userId: string,
  recipeId: string,
  page: number,
  perPage: number,
) {
  logger.debug({ userId, recipeId, page, perPage }, 'listRecipeBrewLogs started');
  const result = await model.findByRecipeIdAndUser(recipeId, userId, page, perPage);
  logger.debug({ userId, recipeId, total: result.total }, 'listRecipeBrewLogs completed');
  return result;
}

/**
 * Get aggregate brew stats for one recipe (brew count, average personal
 * rating). Delegates to the model.
 * @param recipeId - The recipe's UUID.
 */
export async function getRecipeBrewStats(recipeId: string) {
  logger.debug({ recipeId }, 'getRecipeBrewStats started');
  const stats = await model.getRecipeBrewStats(recipeId);
  logger.debug({ recipeId, brewCount: stats.brewCount }, 'getRecipeBrewStats completed');
  return stats;
}

/**
 * Get aggregate journal stats for the authenticated user (totals, last 30
 * days, distinct recipes, first/last brew). Delegates to the model.
 * @param userId - The authenticated user's UUID.
 */
export async function getUserBrewStats(userId: string) {
  logger.debug({ userId }, 'getUserBrewStats started');
  const stats = await model.getUserBrewStats(userId);
  logger.debug({ userId, totalBrews: stats.totalBrews }, 'getUserBrewStats completed');
  return stats;
}
