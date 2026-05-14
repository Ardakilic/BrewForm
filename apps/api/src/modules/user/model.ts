import { db } from '@brewform/db';
import { recipes, recipeVersions, userFollows, users } from '@brewform/db/schema';
import { and, asc, count, desc, eq, isNull, like, or } from 'drizzle-orm';

export async function findById(id: string) {
  const result = await db.select().from(users).where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  return result[0] ?? null;
}

export async function findByUsername(username: string) {
  const result = await db.select().from(users).where(
    and(eq(users.username, username), isNull(users.deletedAt)),
  ).limit(1);
  return result[0] ?? null;
}

export async function updateProfile(
  id: string,
  data: { displayName?: string; bio?: string; avatarUrl?: string },
) {
  const [result] = await db.update(users).set(data).where(
    and(eq(users.id, id), isNull(users.deletedAt)),
  ).returning();
  return result ?? null;
}

export async function deleteUser(id: string) {
  const [result] = await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id))
    .returning();
  return result ?? null;
}

export async function getUserStats(id: string) {
  const [recipeCountResult, followerCountResult, followingCountResult] = await Promise.all([
    db.select({ count: count() }).from(recipes).where(
      and(eq(recipes.authorId, id), isNull(recipes.deletedAt), eq(recipes.visibility, 'public')),
    ),
    db.select({ count: count() }).from(userFollows).where(eq(userFollows.followingId, id)),
    db.select({ count: count() }).from(userFollows).where(eq(userFollows.followerId, id)),
  ]);
  return {
    recipeCount: recipeCountResult[0].count,
    followerCount: followerCountResult[0].count,
    followingCount: followingCountResult[0].count,
  };
}

export async function getUserPublicRecipes(userId: string) {
  // Fetch the user's public recipes with their latest version's brew method and drink type.
  const userRecipes = await db.query.recipes.findMany({
    where: and(
      eq(recipes.authorId, userId),
      eq(recipes.visibility, 'public'),
      isNull(recipes.deletedAt),
    ),
    orderBy: desc(recipes.createdAt),
    columns: {
      id: true,
      slug: true,
      title: true,
      likeCount: true,
      commentCount: true,
      createdAt: true,
    },
    with: {
      versions: {
        orderBy: desc(recipeVersions.versionNumber),
        limit: 1,
        columns: { brewMethod: true, drinkType: true },
      },
    },
  });

  return userRecipes.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    createdAt: r.createdAt,
    currentVersion: r.versions?.[0] ?? null,
  }));
}

export async function searchUsers(query: string, page: number, perPage: number) {
  const where = and(
    isNull(users.deletedAt),
    or(like(users.username, `%${query}%`), like(users.displayName, `%${query}%`)),
  );
  const [data, totalResult] = await Promise.all([
    db.select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      createdAt: users.createdAt,
    }).from(users).where(where).orderBy(desc(users.createdAt), asc(users.id)).limit(perPage).offset(
      (page - 1) * perPage,
    ),
    db.select({ count: count() }).from(users).where(where),
  ]);
  return { users: data, total: totalResult[0].count };
}
