/**
 * Maximum number of replies the comment list returns under one top-level comment.
 *
 * `GET /api/v1/comments/recipe/:recipeId` returns at most this many replies per
 * thread (the oldest first) and sets `hasMoreReplies` when a thread has more;
 * the web shows "Showing the first {count} replies." under a capped thread.
 * Replies past the cap stay stored and counted in `recipe.commentCount`.
 */
export const MAX_REPLIES_PER_COMMENT = 20;
