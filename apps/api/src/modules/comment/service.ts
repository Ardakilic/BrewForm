/**
 * Comment business logic for BrewForm.
 *
 * Orchestrates comment creation with thread-flattening (replies always attach
 * to top-level comments), @mention auto-prepend for nested replies, content
 * sanitization, and async notification + badge evaluation side-effects.
 */

import { parseMentions } from '@brewform/shared/utils';
import { toLoggableError } from '../../utils/errors.ts';
import { createLogger } from '../../utils/logger/index.ts';
import { sanitizeText } from '../../utils/sanitize.ts';
import { evaluateBadges } from '../badge/service.ts';
import { createCommentNotification, createMentionNotifications } from '../notification/service.ts';
import * as recipeModel from '../recipe/model.ts';
import { canViewRecipe } from '../recipe/service.ts';
import * as model from './model.ts';

const logger = createLogger('comment-service');

/**
 * Dependency-injection proxy for test stubbing (data access + notification
 * and badge side-effects). Mirrors the `deps` idiom used by the notification
 * service (`notification/service.ts`) so unit tests can exercise the real
 * service functions without a database or SMTP.
 */
export const deps = {
  model,
  recipeModel,
  createMentionNotifications,
  createCommentNotification,
  evaluateBadges,
};

/**
 * Create a comment with thread-flattening, @mention, sanitization, and side-effects.
 *
 * Only recipe authors and admins may add replies. A parent comment must belong to
 * the same recipe: a missing parent, a parent on another recipe, or a thread whose
 * resolved top-level comment is on another recipe all throw `COMMENT_NOT_FOUND`
 * before any write or side effect. Nested replies are flattened to always attach
 * under the top-level comment. If the direct reply target is nested, the author's
 * @username is prepended to the content. Triggers async notification and badge
 * evaluation.
 *
 * @param userId - The comment author
 * @param recipeId - The recipe being commented on
 * @param content - Raw comment text (will be sanitized)
 * @param isAdmin - Whether the user has admin privileges
 * @param parentCommentId - Optional parent comment for threaded replies
 * @returns The created comment record
 */
export async function createComment(
  userId: string,
  recipeId: string,
  content: string,
  isAdmin: boolean,
  parentCommentId?: string,
) {
  // D99.9 visibility gate FIRST: a recipe the caller may not view is
  // indistinguishable from a recipe that does not exist (404, not 403).
  // This also closes the F04 mention side-effect disclosure vector — the
  // side-effects below only run inside successful creation.
  const recipe = await deps.model.getRecipeForAccessCheck(recipeId);
  if (!recipe || !canViewRecipe(recipe, userId, isAdmin)) {
    throw new Error('RECIPE_NOT_FOUND');
  }

  let effectiveParentCommentId: string | null = parentCommentId || null;
  let effectiveContent = sanitizeText(content);

  if (parentCommentId) {
    const targetComment = await deps.model.findById(parentCommentId);
    if (!targetComment || targetComment.recipeId !== recipeId) {
      logger.debug({ userId, recipeId, parentCommentId }, 'createComment rejected parent');
      throw new Error('COMMENT_NOT_FOUND');
    }

    if (!isAdmin && recipe.authorId !== userId) {
      throw new Error('FORBIDDEN');
    }

    // Thread-flattening: if target is itself a Reply, traverse up to find the Top_Level_Comment
    if (targetComment.parentCommentId !== null) {
      const directTarget = targetComment;
      let current = targetComment;
      let hops = 0;

      while (current.parentCommentId !== null) {
        hops++;
        if (hops > 100) throw new Error('COMMENT_DEPTH_EXCEEDED');
        const parent = await deps.model.findById(current.parentCommentId);
        if (!parent) throw new Error('COMMENT_NOT_FOUND');
        current = parent;
      }

      // current is now the Top_Level_Comment; a legacy chain may lead to another recipe.
      if (current.recipeId !== recipeId) {
        logger.debug({ userId, recipeId, parentCommentId }, 'createComment rejected parent');
        throw new Error('COMMENT_NOT_FOUND');
      }
      effectiveParentCommentId = current.id;

      // Prepend @username mention if author username is available
      if (directTarget.author?.username) {
        effectiveContent = `@${directTarget.author.username} ${sanitizeText(content)}`;
      }
    }
  }

  const comment = await deps.model.create({
    recipeId,
    authorId: userId,
    content: effectiveContent,
    parentCommentId: effectiveParentCommentId,
  });

  await deps.recipeModel.incrementComments(recipeId);

  runCommentNotificationSideEffects({
    userId,
    recipeId,
    commentId: comment.id,
    effectiveContent,
  }).catch((err) =>
    logger.error({ err: toLoggableError(err) }, 'comment notification side-effects failed'),
  );

  deps
    .evaluateBadges(userId)
    .catch((err) => logger.error({ err: toLoggableError(err) }, 'evaluateBadges failed'));

  return comment;
}

/**
 * Run the notification side-effects for a newly created comment.
 *
 * Fire-and-forget design: createComment invokes this helper via a
 * `.catch(...)`-guarded promise, so notification failures never block or fail
 * comment creation.
 *
 * Flow:
 *   1. Load the recipe (early return when it cannot be found).
 *   2. Load the commenter (early return when no username is available).
 *   3. `createCommentNotification` owns BOTH the in-app `comment` record AND
 *      the recipe-commented email — gated on `notifyRecipeCommented` prefs
 *      (single flag gates both). It self-skips when the commenter IS the
 *      recipe author, so the `recipe.authorId !== userId` guard here only
 *      avoids the call; the creator's own self-check is belt-and-braces.
 *   4. ALWAYS run the mention flow — including when the commenter IS the
 *      recipe author. Mentions are parsed from the effective (post-prepend,
 *      sanitized) content; createMentionNotifications no-ops on empty lists.
 *
 * Per-call error isolation: steps 3 and 4 each run in their own try/catch
 * that logs the failure with the commentId, so a rejection in one never
 * prevents the other from running.
 *
 * @param params.userId - The comment author
 * @param params.recipeId - The recipe being commented on
 * @param params.commentId - The created comment id
 * @param params.effectiveContent - Sanitized, post-mention-prepend content
 */
export async function runCommentNotificationSideEffects(params: {
  userId: string;
  recipeId: string;
  commentId: string;
  effectiveContent: string;
}): Promise<void> {
  const { userId, recipeId, commentId, effectiveContent } = params;
  logger.debug({ userId, recipeId, commentId }, 'runCommentNotificationSideEffects started');

  const recipe = await deps.model.getRecipeForNotification(recipeId);
  if (!recipe) return;
  const commenter = await deps.model.getCommenterById(userId);
  if (!commenter?.username) return;

  // F05: createCommentNotification owns BOTH the in-app `comment` record AND
  // the recipe-commented email (gated on `notifyRecipeCommented` prefs —
  // single flag gates both). No direct notifyRecipeCommented call here —
  // that would double-send and bypass the preference gate.
  if (recipe.authorId !== userId) {
    deps
      .createCommentNotification({
        commenterId: userId,
        commenterUsername: commenter.username,
        recipeAuthorId: recipe.authorId,
        recipeId: recipe.id,
        recipeSlug: recipe.slug,
        recipeTitle: recipe.title,
        commentId,
      })
      .catch((err) =>
        logger.error({ err: toLoggableError(err), commentId }, 'createCommentNotification failed'),
      );
  }

  // Mention notifications always run — including when the commenter IS the
  // recipe author. Mentions are parsed from the effective (post-prepend,
  // sanitized) content; createMentionNotifications no-ops on empty mentions.
  try {
    await deps.createMentionNotifications({
      mentions: parseMentions(effectiveContent),
      commentId,
      recipeId: recipe.id,
      recipeSlug: recipe.slug,
      recipeTitle: recipe.title,
      mentionerUserId: userId,
      mentionerUsername: commenter.username,
      recipeAuthorId: recipe.authorId,
    });
  } catch (err) {
    logger.error({ err: toLoggableError(err), commentId }, 'createMentionNotifications failed');
  }

  logger.debug({ userId, recipeId, commentId }, 'runCommentNotificationSideEffects completed');
}

/**
 * List paginated comments for a recipe with nested replies.
 *
 * Applies the same D99.9 visibility gate as {@link createComment} — a recipe
 * the caller may not view throws RECIPE_NOT_FOUND (existence-hiding, mapped to
 * 404 by the route). Gating only creation would still leak content via list.
 *
 * @param recipeId - The recipe whose comments to list
 * @param page - 1-based page number
 * @param perPage - Top-level comments per page
 * @param userId - Authenticated caller id, or null/undefined when anonymous
 * @param isAdmin - Whether the caller has admin privileges
 * @returns Paginated comments with nested replies
 */
export async function listComments(
  recipeId: string,
  page: number,
  perPage: number,
  userId?: string | null,
  isAdmin?: boolean,
) {
  const recipe = await deps.model.getRecipeForAccessCheck(recipeId);
  if (!recipe || !canViewRecipe(recipe, userId, isAdmin)) {
    throw new Error('RECIPE_NOT_FOUND');
  }
  return deps.model.findByRecipe(recipeId, page, perPage);
}

/**
 * Delete a comment. Only the author or an admin may delete.
 *
 * Deleting a top-level comment also soft-deletes its live replies on the same
 * recipe, and the recipe's `commentCount` drops by the number of comments
 * removed (1 + those replies); a reply delete removes one. The counter changes
 * only after this call's own soft delete changed the row: when `softDelete`
 * returns `null` a concurrent request deleted the comment first, so this one
 * throws `COMMENT_NOT_FOUND` (the answer a sequential second delete gets) and
 * neither cascades nor touches the counter.
 *
 * @param userId - The caller
 * @param id - The comment to delete
 * @param isAdmin - Whether the caller has admin privileges
 * @throws Error `COMMENT_NOT_FOUND` when the comment is missing, already deleted or lost a race
 * @throws Error `FORBIDDEN` when a non-admin caller is not the author
 */
export async function deleteComment(userId: string, id: string, isAdmin: boolean): Promise<void> {
  logger.debug({ userId, commentId: id }, 'deleteComment started');
  const comment = await deps.model.findById(id);
  if (!comment) throw new Error('COMMENT_NOT_FOUND');
  if (!isAdmin && comment.authorId !== userId) throw new Error('FORBIDDEN');
  const deleted = await deps.model.softDelete(id);
  if (!deleted) throw new Error('COMMENT_NOT_FOUND');
  const replies =
    comment.parentCommentId === null
      ? await deps.model.softDeleteReplies(id, comment.recipeId)
      : [];
  await deps.recipeModel.decrementComments(comment.recipeId, 1 + replies.length);
  logger.debug(
    { userId, commentId: id, recipeId: comment.recipeId, removedReplies: replies.length },
    'deleteComment completed',
  );
}
