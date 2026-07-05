import { z } from 'zod';

/**
 * Validates comment-creation payloads (content, optional parent comment for replies).
 * Used by POST /api/v1/comments/recipe/:recipeId.
 */
export const CommentCreateSchema = z.object({
  content: z.string().min(1).max(5000),
  parentCommentId: z.uuid().optional(),
});
