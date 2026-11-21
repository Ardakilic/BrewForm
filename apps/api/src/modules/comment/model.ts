/**
 * Comment database operations for BrewForm.
 *
 * Handles querying, creating, and soft-deleting recipe comments with nested
 * reply support. Joins author profile data via the users table and provides
 * helper queries for notification lookups (recipe author, commenter identity).
 */
import { db } from '@brewform/db';
import { comments, recipes, users } from '@brewform/db/schema';
import { MAX_REPLIES_PER_COMMENT } from '@brewform/shared/constants';
import { and, count, eq, isNull } from 'drizzle-orm';
import { visibleIdentity } from '../../utils/public-identity/index.ts';

/**
 * Find a single live comment by ID with the author profile joined.
 *
 * The join matches only a live account (`isNull(users.deletedAt)` in the join
 * condition), so the author of a deleted account comes back as `null`; that is
 * how `createComment` skips the `@username` prefix for such an author.
 *
 * @param id - The comment id
 * @returns The comment with `author` (or `null`), or `null` when missing or soft-deleted
 */
export async function findById(id: string) {
  const result = await db
    .select({
      id: comments.id,
      recipeId: comments.recipeId,
      authorId: comments.authorId,
      content: comments.content,
      parentCommentId: comments.parentCommentId,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      deletedAt: comments.deletedAt,
      author: {
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(comments)
    .leftJoin(users, and(eq(comments.authorId, users.id), isNull(users.deletedAt)))
    .where(and(eq(comments.id, id), isNull(comments.deletedAt)))
    .limit(1);
  return result[0] ?? null;
}

/**
 * List paginated top-level comments for a recipe with a bounded set of replies each.
 *
 * One relational query plus the count: the page of live top-level comments
 * (newest first, then `id` descending) with each comment's live replies from the
 * same recipe (oldest first, then `id` ascending). Drizzle loads a nested `many`
 * relation as a lateral subquery, so the reply `limit` applies per parent: each
 * thread reads at most {@link MAX_REPLIES_PER_COMMENT} + 1 replies, is cut to
 * {@link MAX_REPLIES_PER_COMMENT}, and carries `hasMoreReplies` when it had more.
 * Replies are loaded only from the listed recipe, so a cross-recipe reply stored
 * before the same-recipe rule never appears in another recipe's thread. Comments
 * of a deleted account stay listed with their content and `authorId`, but their
 * `author` is `null` ({@link visibleIdentity}).
 *
 * @param recipeId - The recipe to fetch comments for
 * @param page - 1-based page number
 * @param perPage - Number of top-level comments per page
 * @returns `{ comments, total }`: each top-level comment with its `replies` and
 *   `hasMoreReplies`; `total` counts the recipe's live top-level comments
 */
export async function findByRecipe(recipeId: string, page: number, perPage: number) {
  const authorColumns = {
    id: true,
    username: true,
    displayName: true,
    avatarUrl: true,
    deletedAt: true,
  } as const;
  const [rows, totalResult] = await Promise.all([
    db.query.comments.findMany({
      where: (comment, { and, eq, isNull }) =>
        and(
          eq(comment.recipeId, recipeId),
          isNull(comment.deletedAt),
          isNull(comment.parentCommentId),
        ),
      orderBy: (comment, { desc }) => [desc(comment.createdAt), desc(comment.id)],
      limit: perPage,
      offset: (page - 1) * perPage,
      with: {
        author: { columns: authorColumns },
        replies: {
          where: (reply, { and, eq, isNull }) =>
            and(eq(reply.recipeId, recipeId), isNull(reply.deletedAt)),
          orderBy: (reply, { asc }) => [asc(reply.createdAt), asc(reply.id)],
          limit: MAX_REPLIES_PER_COMMENT + 1,
          with: { author: { columns: authorColumns } },
        },
      },
    }),
    db
      .select({ count: count() })
      .from(comments)
      .where(
        and(
          eq(comments.recipeId, recipeId),
          isNull(comments.deletedAt),
          isNull(comments.parentCommentId),
        ),
      ),
  ]);

  const threads = rows.map(({ replies, ...comment }) => ({
    ...comment,
    author: visibleIdentity(comment.author),
    replies: replies
      .slice(0, MAX_REPLIES_PER_COMMENT)
      .map((reply) => ({ ...reply, author: visibleIdentity(reply.author) })),
    hasMoreReplies: replies.length > MAX_REPLIES_PER_COMMENT,
  }));
  return { comments: threads, total: totalResult[0].count };
}

/** Create a new comment. */
export async function create(data: typeof comments.$inferInsert) {
  const [result] = await db.insert(comments).values(data).returning();
  return result;
}

/** Soft-delete a comment by setting its deletedAt timestamp. */
export async function softDelete(id: string) {
  const [result] = await db
    .update(comments)
    .set({ deletedAt: new Date() })
    .where(and(eq(comments.id, id), isNull(comments.deletedAt)))
    .returning();
  return result ?? null;
}

/**
 * Soft-delete the live replies of a top-level comment on the same recipe.
 *
 * Used by the thread delete (E1): each reply is changed, and so counted, only by
 * the statement that soft-deleted it (READ COMMITTED re-evaluates the WHERE).
 * Replies already deleted keep their `deletedAt`; a reply stored under another
 * recipe is left alone.
 *
 * @param parentId - The top-level comment whose replies to delete
 * @param recipeId - The recipe of that comment
 * @returns The ids of the replies this call soft-deleted
 */
export async function softDeleteReplies(parentId: string, recipeId: string): Promise<string[]> {
  const rows = await db
    .update(comments)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(comments.parentCommentId, parentId),
        eq(comments.recipeId, recipeId),
        isNull(comments.deletedAt),
      ),
    )
    .returning({ id: comments.id });
  return rows.map((row) => row.id);
}

/** Get minimal recipe info (id, slug, title, authorId) for notification context. */
export async function getRecipeForNotification(recipeId: string) {
  const result = await db
    .select({
      id: recipes.id,
      slug: recipes.slug,
      title: recipes.title,
      authorId: recipes.authorId,
    })
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), isNull(recipes.deletedAt)))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Get recipe authorId + visibility for comment access checks.
 *
 * Mirrors {@link getRecipeForNotification}'s soft-delete guard but returns the
 * minimal shape the visibility gate needs. Used by createComment/listComments
 * to existence-hide recipes the caller may not see (D99.9).
 *
 * @param recipeId - The recipe to check
 * @returns `{ authorId, visibility }` or null when missing/soft-deleted
 */
export async function getRecipeForAccessCheck(recipeId: string) {
  const result = await db
    .select({
      authorId: recipes.authorId,
      visibility: recipes.visibility,
    })
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), isNull(recipes.deletedAt)))
    .limit(1);
  return result[0] ?? null;
}

/** Get a commenter's ID and username for mention text. */
export async function getCommenterById(userId: string) {
  const result = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return result[0] ?? null;
}
