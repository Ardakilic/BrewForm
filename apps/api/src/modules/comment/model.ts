import { db } from '@brewform/db';
import { comments, recipes, users } from '@brewform/db/schema';
import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';

export async function findById(id: string) {
  const result = await db.select({
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
    .leftJoin(users, eq(comments.authorId, users.id))
    .where(and(eq(comments.id, id), isNull(comments.deletedAt)))
    .limit(1);
  return result[0] ?? null;
}

export async function findByRecipe(recipeId: string, page: number, perPage: number) {
  const where = and(
    eq(comments.recipeId, recipeId),
    isNull(comments.deletedAt),
    isNull(comments.parentCommentId),
  );
  const [data, totalResult] = await Promise.all([
    db.select({
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
      .leftJoin(users, eq(comments.authorId, users.id))
      .where(where)
      .orderBy(desc(comments.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ count: count() }).from(comments).where(where),
  ]);

  let commentsWithReplies: Array<(typeof data)[number] & { replies: Array<(typeof data)[number]> }>;
  if (data.length === 0) {
    commentsWithReplies = [];
  } else {
    const parentIds = data.map((c) => c.id);
    const allReplies = await db.select({
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
      .leftJoin(users, eq(comments.authorId, users.id))
      .where(and(inArray(comments.parentCommentId, parentIds), isNull(comments.deletedAt)))
      .orderBy(asc(comments.createdAt));

    const repliesByParent = new Map<string, typeof allReplies>();
    for (const reply of allReplies) {
      const key = reply.parentCommentId!;
      if (!repliesByParent.has(key)) {
        repliesByParent.set(key, []);
      }
      repliesByParent.get(key)!.push(reply);
    }

    commentsWithReplies = data.map((comment) => ({
      ...comment,
      replies: repliesByParent.get(comment.id) ?? [],
    }));
  }

  return { comments: commentsWithReplies, total: totalResult[0].count };
}

export async function create(data: typeof comments.$inferInsert) {
  const [result] = await db.insert(comments).values(data).returning();
  return result;
}

export async function softDelete(id: string) {
  const [result] = await db.update(comments).set({ deletedAt: new Date() }).where(
    eq(comments.id, id),
  ).returning();
  return result ?? null;
}

export async function getRecipeAuthorId(recipeId: string) {
  const result = await db.select({ authorId: recipes.authorId }).from(recipes).where(
    eq(recipes.id, recipeId),
  ).limit(1);
  return result[0]?.authorId ?? null;
}

export async function getRecipeForNotification(recipeId: string) {
  const result = await db.select({
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

export async function getCommenterById(userId: string) {
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0] ?? null;
}
