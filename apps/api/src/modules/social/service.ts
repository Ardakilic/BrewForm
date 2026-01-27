/**
 * BrewForm Social Service
 * Handles likes, comments, comparisons
 */

import { getPrisma, softDeleteFilter, getPagination, createPaginationMeta } from '../../utils/database/index.js';
import { logAudit } from '../../utils/logger/index.js';
import { createComparisonToken } from '../../utils/slug/index.js';
import { invalidateCache, CacheKeys } from '../../utils/redis/index.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../middleware/errorHandler.js';
import { notificationService } from '../notification/service.js';

// ============================================
// Comment Notification Helpers
// ============================================

/**
 * Notify recipe owner about a new comment
 */
async function notifyRecipeOwnerOfComment(
  recipe: { userId: string; slug: string | null },
  recipeId: string,
  commentId: string,
  commenter: { displayName: string | null; username: string },
  recipeTitle: string,
  actorId: string
) {
  await notificationService.createNotification({
    userId: recipe.userId,
    type: 'COMMENT_ON_RECIPE',
    title: 'New comment on your recipe',
    message: `${commenter.displayName || commenter.username} commented on "${recipeTitle}"`,
    link: `/recipes/${recipe.slug || recipeId}`,
    recipeId,
    commentId,
    actorId,
  });
}

/**
 * Notify parent comment author about a reply
 */
async function notifyParentCommentAuthor(
  parentUserId: string,
  recipe: { slug: string | null },
  recipeId: string,
  commentId: string,
  commenter: { displayName: string | null; username: string },
  actorId: string
) {
  await notificationService.createNotification({
    userId: parentUserId,
    type: 'REPLY_TO_COMMENT',
    title: 'New reply to your comment',
    message: `${commenter.displayName || commenter.username} replied to your comment`,
    link: `/recipes/${recipe.slug || recipeId}`,
    recipeId,
    commentId,
    actorId,
  });
}

// ============================================
// Favourites
// ============================================

/**
 * Add recipe to favourites
 */
export async function addFavourite(userId: string, recipeId: string) {
  const prisma = getPrisma();

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId, ...softDeleteFilter() },
  });

  if (!recipe) {
    throw new NotFoundError('Recipe');
  }

  // Check visibility
  if (recipe.visibility !== 'PUBLIC' && recipe.visibility !== 'UNLISTED') {
    if (recipe.userId !== userId) {
      throw new ForbiddenError('Cannot favourite private recipes');
    }
  }

  // Check if already favourited
  const existing = await prisma.userFavourite.findUnique({
    where: {
      userId_recipeId: { userId, recipeId },
    },
  });

  if (existing) {
    return { alreadyFavourited: true };
  }

  // Add favourite
  await prisma.userFavourite.create({
    data: { userId, recipeId },
  });

  // Increment count
  await prisma.recipe.update({
    where: { id: recipeId },
    data: { favouriteCount: { increment: 1 } },
  });

  logAudit('recipe_favourited', 'recipe', recipeId, userId);

  // Invalidate caches
  await invalidateCache(CacheKeys.popularRecipes());

  return { success: true };
}

/**
 * Remove recipe from favourites
 */
export async function removeFavourite(userId: string, recipeId: string) {
  const prisma = getPrisma();

  const favourite = await prisma.userFavourite.findUnique({
    where: {
      userId_recipeId: { userId, recipeId },
    },
  });

  if (!favourite) {
    throw new NotFoundError('Favourite');
  }

  await prisma.userFavourite.delete({
    where: { id: favourite.id },
  });

  // Decrement count
  await prisma.recipe.update({
    where: { id: recipeId },
    data: { favouriteCount: { decrement: 1 } },
  });

  logAudit('recipe_unfavourited', 'recipe', recipeId, userId);

  return { success: true };
}

/**
 * Check if user has favourited a recipe
 */
export async function isFavourited(userId: string, recipeId: string) {
  const prisma = getPrisma();

  const favourite = await prisma.userFavourite.findUnique({
    where: {
      userId_recipeId: { userId, recipeId },
    },
  });

  return !!favourite;
}

// ============================================
// Comments
// ============================================

/**
 * Add a comment to a recipe
 */
export async function addComment(
  userId: string,
  recipeId: string,
  content: string,
  parentId?: string
) {
  const prisma = getPrisma();

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId, ...softDeleteFilter() },
  });

  if (!recipe) {
    throw new NotFoundError('Recipe');
  }

  // Check visibility
  if (recipe.visibility !== 'PUBLIC' && recipe.visibility !== 'UNLISTED') {
    throw new ForbiddenError('Cannot comment on private recipes');
  }

  // Validate parent comment if provided
  if (parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parentId, recipeId, ...softDeleteFilter() },
    });

    if (!parent) {
      throw new NotFoundError('Parent comment');
    }
  }

  const comment = await prisma.comment.create({
    data: {
      userId,
      recipeId,
      parentId,
      content,
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  // Increment comment count
  await prisma.recipe.update({
    where: { id: recipeId },
    data: { commentCount: { increment: 1 } },
  });

  logAudit('comment_added', 'comment', comment.id, userId);

  // Send notifications asynchronously (don't await to avoid blocking)
  sendCommentNotifications(prisma, recipe, recipeId, comment, userId, parentId);

  return comment;
}

/**
 * Handle comment notifications separately to reduce complexity
 */
async function sendCommentNotifications(
  prisma: ReturnType<typeof getPrisma>,
  recipe: { userId: string; slug: string | null },
  recipeId: string,
  comment: { id: string; user: { displayName: string | null; username: string } },
  userId: string,
  parentId?: string
) {
  // Get recipe details for notification
  const recipeWithVersion = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: {
      currentVersion: { select: { title: true } },
    },
  });

  // Notify recipe owner (if not self-commenting)
  const recipeTitle = recipeWithVersion?.currentVersion?.title;
  if (recipe.userId !== userId && recipeTitle) {
    await notifyRecipeOwnerOfComment(
      recipe,
      recipeId,
      comment.id,
      comment.user,
      recipeTitle,
      userId
    );
  }

  // Notify parent comment author (if replying)
  if (parentId) {
    const parentComment = await prisma.comment.findUnique({
      where: { id: parentId },
      select: { userId: true },
    });

    const shouldNotifyParent = parentComment && 
      parentComment.userId !== userId && 
      parentComment.userId !== recipe.userId;
    
    if (shouldNotifyParent) {
      await notifyParentCommentAuthor(
        parentComment.userId,
        recipe,
        recipeId,
        comment.id,
        comment.user,
        userId
      );
    }
  }
}

/**
 * Update a comment
 */
export async function updateComment(
  commentId: string,
  userId: string,
  content: string
) {
  const prisma = getPrisma();

  const comment = await prisma.comment.findUnique({
    where: { id: commentId, ...softDeleteFilter() },
  });

  if (!comment) {
    throw new NotFoundError('Comment');
  }

  if (comment.userId !== userId) {
    throw new ForbiddenError('You can only edit your own comments');
  }

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { content, isEdited: true },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  logAudit('comment_updated', 'comment', commentId, userId);

  return updated;
}

/**
 * Delete a comment (soft delete)
 */
export async function deleteComment(commentId: string, userId: string, isAdmin = false) {
  const prisma = getPrisma();

  const comment = await prisma.comment.findUnique({
    where: { id: commentId, ...softDeleteFilter() },
  });

  if (!comment) {
    throw new NotFoundError('Comment');
  }

  if (comment.userId !== userId && !isAdmin) {
    throw new ForbiddenError('You can only delete your own comments');
  }

  await prisma.comment.update({
    where: { id: commentId },
    data: { deletedAt: new Date() },
  });

  // Decrement comment count
  await prisma.recipe.update({
    where: { id: comment.recipeId },
    data: { commentCount: { decrement: 1 } },
  });

  logAudit('comment_deleted', 'comment', commentId, userId);
}

/**
 * Get comments for a recipe
 */
export async function getRecipeComments(
  recipeId: string,
  page = 1,
  limit = 20
) {
  const prisma = getPrisma();
  const pagination = getPagination({ page, limit });

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId, ...softDeleteFilter() },
  });

  if (!recipe) {
    throw new NotFoundError('Recipe');
  }

  // Check visibility - only allow comments on public/unlisted recipes
  if (recipe.visibility !== 'PUBLIC' && recipe.visibility !== 'UNLISTED') {
    throw new ForbiddenError('Cannot view comments on private recipes');
  }

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where: {
        recipeId,
        parentId: null, // Top-level comments only
        ...softDeleteFilter(),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        replies: {
          where: softDeleteFilter(),
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      ...pagination,
    }),
    prisma.comment.count({
      where: {
        recipeId,
        parentId: null,
        ...softDeleteFilter(),
      },
    }),
  ]);

  // Add isAuthor flag
  const recipeAuthorId = recipe.userId;
  const commentsWithAuthorFlag = comments.map((comment) => ({
    ...comment,
    isAuthor: comment.userId === recipeAuthorId,
    replies: comment.replies.map((reply) => ({
      ...reply,
      isAuthor: reply.userId === recipeAuthorId,
    })),
  }));

  return {
    comments: commentsWithAuthorFlag,
    pagination: createPaginationMeta(page, limit, total),
  };
}

// ============================================
// Comparisons
// ============================================

/**
 * Create a recipe comparison
 */
export async function createComparison(recipeAId: string, recipeBId: string) {
  const prisma = getPrisma();

  // Cannot compare same recipe
  if (recipeAId === recipeBId) {
    throw new BadRequestError('Cannot compare a recipe to itself');
  }

  // Validate both recipes exist and are public
  const [recipeA, recipeB] = await Promise.all([
    prisma.recipe.findUnique({
      where: { id: recipeAId, ...softDeleteFilter() },
    }),
    prisma.recipe.findUnique({
      where: { id: recipeBId, ...softDeleteFilter() },
    }),
  ]);

  if (!recipeA || !recipeB) {
    throw new NotFoundError('One or both recipes not found');
  }

  if (recipeA.visibility !== 'PUBLIC' || recipeB.visibility !== 'PUBLIC') {
    throw new BadRequestError('Both recipes must be public to compare');
  }

  // Check if comparison already exists
  const existing = await prisma.comparison.findFirst({
    where: {
      OR: [
        { recipeAId, recipeBId },
        { recipeAId: recipeBId, recipeBId: recipeAId },
      ],
    },
  });

  if (existing) {
    return existing;
  }

  // Create comparison
  const comparison = await prisma.comparison.create({
    data: {
      recipeAId,
      recipeBId,
      shareToken: createComparisonToken(),
    },
  });

  return comparison;
}

/**
 * Get comparison by token
 */
export async function getComparisonByToken(token: string) {
  const prisma = getPrisma();

  const comparison = await prisma.comparison.findUnique({
    where: { shareToken: token },
    include: {
      recipeA: {
        include: {
          currentVersion: true,
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      },
      recipeB: {
        include: {
          currentVersion: true,
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      },
    },
  });

  if (!comparison) {
    throw new NotFoundError('Comparison');
  }

  // Check both recipes are still public
  if (
    comparison.recipeA.visibility !== 'PUBLIC' ||
    comparison.recipeB.visibility !== 'PUBLIC'
  ) {
    throw new BadRequestError('One or both recipes are no longer public');
  }

  return comparison;
}

export const socialService = {
  addFavourite,
  removeFavourite,
  isFavourited,
  addComment,
  updateComment,
  deleteComment,
  getRecipeComments,
  createComparison,
  getComparisonByToken,
};

export default socialService;
