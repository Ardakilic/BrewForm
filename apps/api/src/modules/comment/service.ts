import * as model from './model.ts';
import * as recipeModel from '../recipe/model.ts';

export async function createComment(userId: string, recipeId: string, content: string, parentCommentId?: string) {
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