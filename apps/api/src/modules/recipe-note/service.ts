/**
 * Private recipe notes business-logic layer.
 *
 * Every public function acts only on the CALLER's note: the user id comes from
 * the authenticated context (never from the request body), and the model keys
 * every query by that id. The recipe must exist, not be soft-deleted and be
 * viewable by the caller (`canViewRecipe`); otherwise the functions throw a 404
 * `NotFoundError`, which hides whether the recipe exists. Admin status widens
 * which recipes the caller may annotate, never whose notes they can read.
 *
 * Note text is never logged: log objects carry at most `userId`, `recipeId`
 * and a `hasNote`/`noteLength` indicator, and errors go through
 * `toLoggableError` (Drizzle embeds the query parameters, i.e. the note text,
 * in its error message).
 *
 * All DB access is delegated to `model.ts` — no Drizzle calls from this module.
 */

import { NotFoundError, toLoggableError, ValidationError } from '../../utils/errors.ts';
import { createLogger } from '../../utils/logger/index.ts';
import { sanitizeText } from '../../utils/sanitize.ts';
import { canViewRecipe } from '../recipe/service.ts';
import * as model from './model.ts';

/** Module-scoped structured logger (exported for test spies). */
export const log = createLogger('recipe-note-service');

/** The caller's private note on a recipe; `notes`/`updatedAt` are `null` when there is none. */
export interface RecipeUserNote {
  recipeId: string;
  notes: string | null;
  updatedAt: Date | null;
}

/**
 * Throw a 404 unless the recipe exists, is not soft-deleted and is viewable by the caller.
 *
 * @param userId - Authenticated caller id.
 * @param recipeId - Recipe UUID.
 * @param isAdmin - Whether the caller is an admin (may view draft/private recipes).
 * @throws {NotFoundError} When the recipe is missing, deleted or not viewable.
 */
async function assertRecipeViewable(
  userId: string,
  recipeId: string,
  isAdmin: boolean,
): Promise<void> {
  const recipe = await model.findRecipeForNotes(recipeId);
  if (!recipe || !canViewRecipe(recipe, userId, isAdmin)) {
    throw new NotFoundError('Recipe');
  }
}

/**
 * Build the response payload for a recipe from a note row (or its absence).
 *
 * @param recipeId - Recipe UUID.
 * @param note - The live note row, or `undefined` when there is none.
 */
function toUserNote(recipeId: string, note?: model.UserRecipeNoteRow): RecipeUserNote {
  return note
    ? { recipeId, notes: note.notes, updatedAt: note.updatedAt }
    : { recipeId, notes: null, updatedAt: null };
}

/**
 * Return the caller's private note on a recipe.
 *
 * @param userId - Authenticated caller id.
 * @param recipeId - Recipe UUID.
 * @param isAdmin - Whether the caller is an admin.
 * @returns The caller's note, or `{ recipeId, notes: null, updatedAt: null }` when absent.
 * @throws {NotFoundError} When the recipe is missing, deleted or not viewable by the caller.
 */
export async function getMyNote(
  userId: string,
  recipeId: string,
  isAdmin: boolean,
): Promise<RecipeUserNote> {
  log.debug({ userId, recipeId }, 'getMyNote started');
  try {
    await assertRecipeViewable(userId, recipeId, isAdmin);
    const note = await model.findNote(userId, recipeId);
    log.debug({ userId, recipeId, hasNote: note !== undefined }, 'getMyNote completed');
    return toUserNote(recipeId, note);
  } catch (err) {
    log.error({ err: toLoggableError(err), userId, recipeId }, 'getMyNote failed');
    throw err;
  }
}

/**
 * Create or replace the caller's private note on a recipe.
 *
 * The text is passed through `sanitizeText` (HTML tags and zero-width
 * characters stripped, whitespace normalised) before it is stored. Never
 * touches `recipe_version` (the author's public brewer notes).
 *
 * @param userId - Authenticated caller id.
 * @param recipeId - Recipe UUID.
 * @param notes - Raw note text (already length-checked by `RecipeNotesSchema`).
 * @param isAdmin - Whether the caller is an admin.
 * @returns The stored note.
 * @throws {NotFoundError} When the recipe is missing, deleted or not viewable by the caller.
 * @throws {ValidationError} When the text is empty after sanitization (field `notes`).
 */
export async function saveMyNote(
  userId: string,
  recipeId: string,
  notes: string,
  isAdmin: boolean,
): Promise<RecipeUserNote> {
  log.debug({ userId, recipeId }, 'saveMyNote started');
  try {
    await assertRecipeViewable(userId, recipeId, isAdmin);
    const clean = sanitizeText(notes);
    if (clean.length === 0) {
      throw new ValidationError('Notes cannot be empty', [
        { field: 'notes', message: 'Notes cannot be empty after removing markup and whitespace' },
      ]);
    }
    const note = await model.upsertNote(userId, recipeId, clean);
    log.debug({ userId, recipeId, noteLength: clean.length }, 'saveMyNote completed');
    return toUserNote(recipeId, note);
  } catch (err) {
    log.error({ err: toLoggableError(err), userId, recipeId }, 'saveMyNote failed');
    throw err;
  }
}

/**
 * Soft-delete the caller's private note on a recipe (idempotent).
 *
 * The row keeps its id with `deletedAt` set and its text scrubbed to `''`; a
 * later save revives it. Deleting when there is no live note succeeds.
 *
 * @param userId - Authenticated caller id.
 * @param recipeId - Recipe UUID.
 * @param isAdmin - Whether the caller is an admin.
 * @returns `{ recipeId, notes: null, updatedAt: null }`.
 * @throws {NotFoundError} When the recipe is missing, deleted or not viewable by the caller.
 */
export async function deleteMyNote(
  userId: string,
  recipeId: string,
  isAdmin: boolean,
): Promise<RecipeUserNote> {
  log.debug({ userId, recipeId }, 'deleteMyNote started');
  try {
    await assertRecipeViewable(userId, recipeId, isAdmin);
    const deletedCount = await model.softDeleteNote(userId, recipeId);
    log.debug({ userId, recipeId, hasNote: deletedCount > 0 }, 'deleteMyNote completed');
    return toUserNote(recipeId);
  } catch (err) {
    log.error({ err: toLoggableError(err), userId, recipeId }, 'deleteMyNote failed');
    throw err;
  }
}

/**
 * Soft-delete and scrub every private note owned by a user. Called by
 * `user/service.ts` `deleteAccount`; no visibility check (the notes are the
 * user's own, whatever happened to the recipes since).
 *
 * @param userId - The user whose notes are removed.
 * @returns The number of notes soft-deleted.
 */
export async function deleteAllNotesForUser(userId: string): Promise<number> {
  log.debug({ userId }, 'deleteAllNotesForUser started');
  try {
    const deletedCount = await model.softDeleteAllNotesForUser(userId);
    log.debug({ userId }, 'deleteAllNotesForUser completed');
    return deletedCount;
  } catch (err) {
    log.error({ err: toLoggableError(err), userId }, 'deleteAllNotesForUser failed');
    throw err;
  }
}
