import { z } from 'zod';

export const CommentCreateSchema = z.object({
  content: z.string().min(1).max(5000),
  parentCommentId: z.string().uuid().optional(),
});