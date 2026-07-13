/**
 * Comment business logic for BrewForm.
 *
 * Orchestrates comment creation with thread-flattening (replies always attach
 * to top-level comments), @mention auto-prepend for nested replies, content
 * sanitization, and async notification + badge evaluation side-effects.
 */
import { sanitizeText } from '../../utils/sanitize.ts';
import { parseMentions } from '@brewform/shared/utils';
import * as model from './model.ts';
import * as recipeModel from '../recipe/model.ts';
import { createLogger } from '../../utils/logger/index.ts';
import { notifyRecipeCommented } from '../../utils/notify/index.ts';
import { createMentionNotifications } from '../notification/service.ts';
import { evaluateBadges } from '../badge/service.ts';

const logger = createLogger('comment-service');

/**
 * Create a comment with thread-flattening, @mention, sanitization, and side-effects.
 *
 * Only recipe authors and admins may add replies. Nested replies are flattened
 * to always attach under the top-level comment. If the direct reply target is
 * nested, the author's @username is prepended to the content. Triggers async
 * notification and badge evaluation.
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
  let effectiveParentCommentId: string | null = parentCommentId || null;
  let effectiveContent = sanitizeText(content);

  if (parentCommentId) {
    const targetComment = await model.findById(parentCommentId);
    if (!targetComment) throw new Error('COMMENT_NOT_FOUND');

    const recipeAuthorId = await model.getRecipeAuthorId(recipeId);
    if (!isAdmin && recipeAuthorId !== userId) {
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
        const parent = await model.findById(current.parentCommentId);
        if (!parent) throw new Error('COMMENT_NOT_FOUND');
        current = parent;
      }

      // current is now the Top_Level_Comment
      effectiveParentCommentId = current.id;

      // Prepend @username mention if author username is available
      if (directTarget.author?.username) {
        effectiveContent = `@${directTarget.author.username} ${sanitizeText(content)}`;
      }
    }
  }

  const comment = await model.create({
    recipeId,
    authorId: userId,
    content: effectiveContent,
    parentCommentId: effectiveParentCommentId,
  });

  await recipeModel.incrementComments(recipeId);

  (async () => {
    const recipe = await model.getRecipeForNotification(recipeId);
    if (!recipe) return;
    const commenter = await model.getCommenterById(userId);
    if (!commenter?.username) return;
    // Recipe-commented email only when someone ELSE comments on the recipe.
    if (recipe.authorId !== userId) {
      await notifyRecipeCommented({
        recipeAuthorId: recipe.authorId,
        commenterUsername: commenter.username,
        recipeTitle: recipe.title,
        recipeSlug: recipe.slug,
      });
    }
    // Mention notifications always run — including when the commenter IS the
    // recipe author. Mentions are parsed from the effective (post-prepend,
    // sanitized) content; createMentionNotifications no-ops on empty mentions.
    await createMentionNotifications({
      mentions: parseMentions(effectiveContent),
      commentId: comment.id,
      recipeId: recipe.id,
      recipeSlug: recipe.slug,
      recipeTitle: recipe.title,
      mentionerUserId: userId,
      mentionerUsername: commenter.username,
      recipeAuthorId: recipe.authorId,
    });
  })().catch((err) => logger.error({ err }, 'comment notification side-effects failed'));

  evaluateBadges(userId).catch((err) => logger.error({ err }, 'evaluateBadges failed'));

  return comment;
}

/** List paginated comments for a recipe with nested replies. */
export async function listComments(recipeId: string, page: number, perPage: number) {
  return model.findByRecipe(recipeId, page, perPage);
}

/** Delete a comment. Only the author or an admin may delete. */
export async function deleteComment(userId: string, id: string, isAdmin: boolean): Promise<void> {
  const comment = await model.findById(id);
  if (!comment) throw new Error('COMMENT_NOT_FOUND');
  if (!isAdmin && comment.authorId !== userId) throw new Error('FORBIDDEN');
  await model.softDelete(id);
  await recipeModel.decrementComments(comment.recipeId);
}
