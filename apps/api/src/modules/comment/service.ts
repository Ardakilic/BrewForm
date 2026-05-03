// deno-lint-ignore-file no-explicit-any
import * as model from './model.ts';
import * as recipeModel from '../recipe/model.ts';
import { prisma } from '@brewform/db';
import { createLogger } from '../../utils/logger/index.ts';
import { notifyRecipeCommented } from '../../utils/notify/index.ts';
import { evaluateBadges } from '../badge/service.ts';

const logger = createLogger('comment-service');

export async function createComment(
  userId: string,
  recipeId: string,
  content: string,
  parentCommentId?: string,
) {
  if (parentCommentId) {
    const parentComment = await model.findById(parentCommentId);
    if (!parentComment) throw new Error('COMMENT_NOT_FOUND');

    const recipeAuthorId = await model.getRecipeAuthorId(recipeId);
    if (recipeAuthorId !== userId) {
      throw new Error('FORBIDDEN');
    }
  }

  const comment = await model.create({
    recipeId,
    authorId: userId,
    content,
    parentCommentId: parentCommentId || null,
  });

  await recipeModel.incrementComments(recipeId);

  // Notify the recipe author (unless they commented on their own recipe).
  (async () => {
    const recipe: any = await prisma.recipe.findFirst({
      where: { id: recipeId } as any,
      select: { id: true, slug: true, title: true, authorId: true },
    });
    if (!recipe || recipe.authorId === userId) return;
    const commenter: any = await prisma.user.findFirst({
      where: { id: userId } as any,
    });
    if (!commenter?.username) return;
    await notifyRecipeCommented({
      recipeAuthorId: recipe.authorId,
      commenterUsername: commenter.username,
      recipeTitle: recipe.title,
      recipeSlug: recipe.slug,
    });
  })().catch((err) => logger.error({ err }, 'notifyRecipeCommented failed'));

  // Fire-and-forget badge evaluation so errors never block the response.
  evaluateBadges(userId).catch((err) => logger.error({ err }, 'evaluateBadges failed'));

  return comment;
}

export async function listComments(recipeId: string, page: number, perPage: number) {
  return model.findByRecipe(recipeId, page, perPage);
}

export async function deleteComment(userId: string, id: string) {
  const comment = await model.findById(id);
  if (!comment) throw new Error('COMMENT_NOT_FOUND');
  if (comment.authorId !== userId) throw new Error('FORBIDDEN');
  await model.softDelete(id);
}
