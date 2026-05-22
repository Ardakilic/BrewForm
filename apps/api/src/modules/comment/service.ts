import { sanitizeText } from '../../utils/sanitize.ts';
import * as model from './model.ts';
import * as recipeModel from '../recipe/model.ts';
import { db } from '@brewform/db';
import { recipes, users } from '@brewform/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { createLogger } from '../../utils/logger/index.ts';
import { notifyRecipeCommented } from '../../utils/notify/index.ts';
import { evaluateBadges } from '../badge/service.ts';

const logger = createLogger('comment-service');

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
    const recipeResult = await db.select({
      id: recipes.id,
      slug: recipes.slug,
      title: recipes.title,
      authorId: recipes.authorId,
    })
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), isNull(recipes.deletedAt)))
      .limit(1);
    const recipe = recipeResult[0];
    if (!recipe || recipe.authorId === userId) return;
    const commenterResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const commenter = commenterResult[0];
    if (!commenter?.username) return;
    await notifyRecipeCommented({
      recipeAuthorId: recipe.authorId,
      commenterUsername: commenter.username,
      recipeTitle: recipe.title,
      recipeSlug: recipe.slug,
    });
  })().catch((err) => logger.error({ err }, 'notifyRecipeCommented failed'));

  evaluateBadges(userId).catch((err) => logger.error({ err }, 'evaluateBadges failed'));

  return comment;
}

export async function listComments(recipeId: string, page: number, perPage: number) {
  return model.findByRecipe(recipeId, page, perPage);
}

export async function deleteComment(userId: string, id: string, isAdmin: boolean): Promise<void> {
  const comment = await model.findById(id);
  if (!comment) throw new Error('COMMENT_NOT_FOUND');
  if (!isAdmin && comment.authorId !== userId) throw new Error('FORBIDDEN');
  await model.softDelete(id);
}
