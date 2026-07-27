/**
 * User database operations for BrewForm.
 *
 * Provides user lookup by ID or username, profile updates, soft-delete,
 * aggregated stats (recipe/follower/following counts), public recipe listing
 * with latest version metadata, and full-text username/displayName search.
 */
import { db } from '@brewform/db';
import { recipes, recipeVersions, userFollows, userPreferences, users } from '@brewform/db/schema';
import { and, asc, count, desc, eq, gt, isNull, like, or } from 'drizzle-orm';

/**
 * Find a user by ID, including preferences via LEFT JOIN.
 *
 * Returns null if the user is deleted or not found. When found, the
 * returned object includes a `preferences` field from the joined
 * `user_preferences` row (null if the user has no preferences record).
 */
export async function findById(id: string) {
  const result = await db.select().from(users)
    .leftJoin(userPreferences, eq(users.id, userPreferences.userId))
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  if (!result[0]) return null;
  const prefsRow = result[0].user_preferences;
  return {
    ...result[0].user,
    preferences: prefsRow
      ? {
        unitSystem: prefsRow.unitSystem,
        temperatureUnit: prefsRow.temperatureUnit,
        theme: prefsRow.theme,
        locale: prefsRow.locale,
        timezone: prefsRow.timezone,
        dateFormat: prefsRow.dateFormat,
        emailNotifications: {
          newFollower: prefsRow.newFollower,
          recipeLiked: prefsRow.recipeLiked,
          recipeCommented: prefsRow.recipeCommented,
          followedUserPosted: prefsRow.followedUserPosted,
        },
      }
      : null,
  };
}

/** Find a user by username. Returns null if deleted or not found. */
export async function findByUsername(username: string) {
  const result = await db.select().from(users).where(
    and(eq(users.username, username), isNull(users.deletedAt)),
  ).limit(1);
  return result[0] ?? null;
}

/** Update a user's display name, bio, or avatar URL. Returns null if user not found. */
export async function updateProfile(
  id: string,
  data: { displayName?: string; bio?: string; avatarUrl?: string },
) {
  const [result] = await db.update(users).set(data).where(
    and(eq(users.id, id), isNull(users.deletedAt)),
  ).returning();
  return result ?? null;
}

/** Soft-delete a user by setting their deletedAt timestamp. */
export async function deleteUser(id: string) {
  const [result] = await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id))
    .returning();
  return result ?? null;
}

/**
 * Get aggregated stats for a user (public recipe count, followers, following).
 *
 * @returns Object with recipeCount, followerCount, and followingCount
 */
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

/** Get a user's public recipes with their latest version's brew method and drink type. */
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

/**
 * Search users by username or displayName with pagination.
 *
 * @param query - Search term (LIKE match)
 * @param page - 1-based page number
 * @param perPage - Results per page
 * @returns Paginated user list with total count
 */
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

/**
 * List active (non-deleted) user IDs in ascending ID order, for cursor-based batching.
 * @param afterId - Return IDs strictly greater than this value; null starts from the beginning.
 * @param limit - Maximum number of IDs to return.
 */
export async function listActiveUserIds(
  afterId: string | null,
  limit: number,
): Promise<string[]> {
  const where = afterId
    ? and(isNull(users.deletedAt), gt(users.id, afterId))
    : isNull(users.deletedAt);
  const rows = await db.query.users.findMany({
    columns: { id: true },
    where,
    orderBy: [asc(users.id)],
    limit,
  });
  return rows.map((r) => r.id);
}
