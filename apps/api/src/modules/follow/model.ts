/**
 * Follow database operations for BrewForm.
 *
 * Manages follower/following relationships between users. Provides paginated
 * follower and following lists with joined user profiles, plus helper queries
 * for checking follow status and retrieving followed user IDs for feed generation.
 */
import { db } from '@brewform/db';
import { userFollows, users } from '@brewform/db/schema';
import { and, count, desc, eq, isNull } from 'drizzle-orm';

/** Find a follow relationship between two users (returns null if not found). */
export async function findFollow(followerId: string, followingId: string) {
  const result = await db.select().from(userFollows)
    .where(and(eq(userFollows.followerId, followerId), eq(userFollows.followingId, followingId)))
    .limit(1);
  return result[0] ?? null;
}

/** Create a follow relationship. */
export async function createFollow(followerId: string, followingId: string) {
  const [result] = await db.insert(userFollows).values({ followerId, followingId }).returning();
  return result;
}

/** Delete a follow relationship. Throws FOLLOW_NOT_FOUND if it doesn't exist. */
export async function deleteFollow(followerId: string, followingId: string) {
  const follow = await findFollow(followerId, followingId);
  if (!follow) throw new Error('FOLLOW_NOT_FOUND');
  await db.delete(userFollows).where(eq(userFollows.id, follow.id));
}

/**
 * List paginated followers for a user with joined profile data.
 *
 * @param userId - The user whose followers to fetch
 * @param page - 1-based page number
 * @param perPage - Number of followers per page
 * @returns Paginated followers list with total count
 */
export async function getFollowers(userId: string, page: number, perPage: number) {
  const where = eq(userFollows.followingId, userId);
  const [data, totalResult] = await Promise.all([
    db.select({
      id: userFollows.id,
      followerId: userFollows.followerId,
      followingId: userFollows.followingId,
      createdAt: userFollows.createdAt,
      follower: {
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
      },
    })
      .from(userFollows)
      .innerJoin(users, and(eq(userFollows.followerId, users.id), isNull(users.deletedAt)))
      .where(and(where, isNull(users.deletedAt)))
      .orderBy(desc(userFollows.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ count: count() }).from(userFollows)
      .innerJoin(users, and(eq(userFollows.followerId, users.id), isNull(users.deletedAt)))
      .where(where),
  ]);
  return { followers: data, total: totalResult[0].count };
}

/**
 * List paginated users that a given user follows, with joined profile data.
 *
 * @param userId - The follower whose following list to fetch
 * @param page - 1-based page number
 * @param perPage - Number of followed users per page
 * @returns Paginated following list with total count
 */
export async function getFollowing(userId: string, page: number, perPage: number) {
  const where = eq(userFollows.followerId, userId);
  const [data, totalResult] = await Promise.all([
    db.select({
      id: userFollows.id,
      followerId: userFollows.followerId,
      followingId: userFollows.followingId,
      createdAt: userFollows.createdAt,
      following: {
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
      },
    })
      .from(userFollows)
      .innerJoin(users, and(eq(userFollows.followingId, users.id), isNull(users.deletedAt)))
      .where(and(where, isNull(users.deletedAt)))
      .orderBy(desc(userFollows.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ count: count() }).from(userFollows)
      .innerJoin(users, and(eq(userFollows.followingId, users.id), isNull(users.deletedAt)))
      .where(where),
  ]);
  return { following: data, total: totalResult[0].count };
}

/** Get all user IDs that a user follows (for feed filtering). */
export async function getFollowingIds(userId: string) {
  const follows = await db.select({ followingId: userFollows.followingId }).from(userFollows).where(
    eq(userFollows.followerId, userId),
  );
  return follows.map((f) => f.followingId);
}

/** Check if a follow relationship exists between two users. */
export async function isFollowing(followerId: string, followingId: string) {
  const result = await db.select({ count: count() }).from(userFollows)
    .where(and(eq(userFollows.followerId, followerId), eq(userFollows.followingId, followingId)));
  return result[0].count > 0;
}
