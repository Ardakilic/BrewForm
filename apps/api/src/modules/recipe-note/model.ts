/**
 * Private recipe notes data-access layer (`user_recipe_note`).
 *
 * Pure Drizzle ORM operations — no business logic, no authorization, no logging.
 * Called exclusively by `recipe-note/service.ts`.
 *
 * Every note query is keyed by BOTH `userId` and `recipeId` (or by `userId`
 * alone for account deletion), so no function can address another user's row.
 * This module never reads or writes `recipe_version` — the author's public
 * brewer notes (`recipe_version.personal_notes`) are out of its reach.
 *
 * Soft-delete convention: reads filter `isNull(userRecipeNotes.deletedAt)`; a
 * soft delete also scrubs the text to `''`, and the upsert revives the same row.
 */

import { db } from '@brewform/db';
import { recipes, userRecipeNotes } from '@brewform/db/schema';
import type { Visibility } from '@brewform/shared/types';
import { and, eq, isNull } from 'drizzle-orm';

/** Minimal recipe projection used for the notes visibility check. */
export interface RecipeForNotes {
  id: string;
  authorId: string;
  visibility: Visibility;
}

/** A `user_recipe_note` row. */
export type UserRecipeNoteRow = typeof userRecipeNotes.$inferSelect;

/**
 * Load the minimal projection of a non-deleted recipe needed to decide whether
 * the caller may keep notes on it.
 *
 * @param recipeId - Recipe UUID.
 * @returns `{ id, authorId, visibility }`, or `undefined` when the recipe does
 *   not exist or is soft-deleted.
 */
export async function findRecipeForNotes(recipeId: string): Promise<RecipeForNotes | undefined> {
  const [recipe] = await db
    .select({ id: recipes.id, authorId: recipes.authorId, visibility: recipes.visibility })
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), isNull(recipes.deletedAt)))
    .limit(1);
  return recipe;
}

/**
 * Find the caller's live (not soft-deleted) note on a recipe.
 *
 * @param userId - Note owner (always the authenticated caller).
 * @param recipeId - Recipe UUID.
 * @returns The note row, or `undefined` when there is none or it was deleted.
 */
export async function findNote(
  userId: string,
  recipeId: string,
): Promise<UserRecipeNoteRow | undefined> {
  const [note] = await db
    .select()
    .from(userRecipeNotes)
    .where(
      and(
        eq(userRecipeNotes.userId, userId),
        eq(userRecipeNotes.recipeId, recipeId),
        isNull(userRecipeNotes.deletedAt),
      ),
    )
    .limit(1);
  return note;
}

/**
 * Create or replace the caller's note on a recipe in a single statement.
 *
 * Upserts on the `(user_id, recipe_id)` unique constraint: a new pair inserts a
 * row; an existing pair (live or soft-deleted) has its `notes` replaced,
 * `updatedAt` bumped and `deletedAt` cleared, so a deleted note is revived in
 * the same row.
 *
 * @param userId - Note owner (always the authenticated caller).
 * @param recipeId - Recipe UUID.
 * @param notes - Already sanitized, non-empty note text.
 * @returns The stored row.
 */
export async function upsertNote(
  userId: string,
  recipeId: string,
  notes: string,
): Promise<UserRecipeNoteRow> {
  const now = new Date();
  const [note] = await db
    .insert(userRecipeNotes)
    .values({ userId, recipeId, notes, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [userRecipeNotes.userId, userRecipeNotes.recipeId],
      set: { notes, updatedAt: now, deletedAt: null },
    })
    .returning();
  return note;
}

/**
 * Soft-delete the caller's live note on a recipe and scrub its text.
 *
 * Sets `deletedAt` and `notes = ''` (and bumps `updatedAt`). A no-op when there
 * is no live note, which keeps DELETE idempotent.
 *
 * @param userId - Note owner (always the authenticated caller).
 * @param recipeId - Recipe UUID.
 * @returns The number of rows soft-deleted (0 or 1).
 */
export async function softDeleteNote(userId: string, recipeId: string): Promise<number> {
  const now = new Date();
  const deleted = await db
    .update(userRecipeNotes)
    .set({ notes: '', deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(userRecipeNotes.userId, userId),
        eq(userRecipeNotes.recipeId, recipeId),
        isNull(userRecipeNotes.deletedAt),
      ),
    )
    .returning({ id: userRecipeNotes.id });
  return deleted.length;
}

/**
 * Soft-delete and scrub every live note owned by a user (account deletion).
 *
 * @param userId - The user whose notes are removed.
 * @returns The number of rows soft-deleted.
 */
export async function softDeleteAllNotesForUser(userId: string): Promise<number> {
  const now = new Date();
  const deleted = await db
    .update(userRecipeNotes)
    .set({ notes: '', deletedAt: now, updatedAt: now })
    .where(and(eq(userRecipeNotes.userId, userId), isNull(userRecipeNotes.deletedAt)))
    .returning({ id: userRecipeNotes.id });
  return deleted.length;
}
