import { z } from 'zod';
import { AuthorRefSchema } from './_shared.ts';

/**
 * Comment Output Schemas.
 *
 * `CommentOutputSchema` mirrors the raw `comments` row returned by
 * `model.create` (POST). `CommentWithAuthorOutputSchema` adds the left-joined
 * `author` projection (nullable) used in list rows and replies.
 * `CommentWithRepliesOutputSchema` is a top-level list item with a `replies[]`
 * array of with-author comments (from `findByRecipe`).
 *
 * Verified against `packages/db/src/schema.ts` (`comments`, `users`) and
 * `apps/api/src/modules/comment/{service,model}.ts`.
 */
export const CommentOutputSchema = z.object({
  id: z.string(),
  recipeId: z.string(),
  authorId: z.string(),
  content: z.string(),
  parentCommentId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

/** Inferred type of {@link CommentOutputSchema}. */
export type CommentOutput = z.infer<typeof CommentOutputSchema>;

/** Validates a comment row plus its left-joined `author` projection (nullable); used in comment-list response envelopes and replies. */
export const CommentWithAuthorOutputSchema = CommentOutputSchema.extend({
  author: AuthorRefSchema,
});

/** Inferred type of {@link CommentWithAuthorOutputSchema}. */
export type CommentWithAuthorOutput = z.infer<typeof CommentWithAuthorOutputSchema>;

/** Validates a top-level comment list item with nested `replies[]`; response envelope for GET /api/v1/comments/recipe/:recipeId. */
export const CommentWithRepliesOutputSchema = CommentWithAuthorOutputSchema.extend({
  replies: z.array(CommentWithAuthorOutputSchema),
});

/** Inferred type of {@link CommentWithRepliesOutputSchema}. */
export type CommentWithRepliesOutput = z.infer<typeof CommentWithRepliesOutputSchema>;
