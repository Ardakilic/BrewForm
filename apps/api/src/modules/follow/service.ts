/**
 * Follow business logic for BrewForm.
 *
 * Orchestrates follow/unfollow operations with self-follow and duplicate guards,
 * async new-follower notifications, badge evaluation, and feed aggregation from
 * followed users' public recipes.
 */
import * as model from './model.ts';
import type { CursorResult } from '../recipe/model.ts';
import * as recipeModel from '../recipe/model.ts';
import { db } from '@brewform/db';
import { users } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '../../utils/logger/index.ts';
import { notifyNewFollower } from '../../utils/notify/index.ts';
import { evaluateBadges } from '../badge/service.ts';

const logger = createLogger('follow-service');

/**
 * Follow another user.
 *
 * Guards: cannot follow self, cannot follow someone already followed.
 * Triggers async new-follower notification and badge evaluation.
 *
 * @param followerId - The user initiating the follow
 * @param followingId - The user being followed
 * @returns The created follow record
 */
export async function followUser(followerId: string, followingId: string) {
  if (followerId === followingId) throw new Error('CANNOT_FOLLOW_SELF');
  const alreadyFollowing = await model.isFollowing(followerId, followingId);
  if (alreadyFollowing) throw new Error('ALREADY_FOLLOWING');
  const follow = await model.createFollow(followerId, followingId);

  (async () => {
    const followerResult = await db.select().from(users).where(eq(users.id, followerId)).limit(1);
    const follower = followerResult[0];
    if (!follower?.username) return;
    await notifyNewFollower({
      followingId,
      followerUsername: follower.username,
    });
  })().catch((err) => logger.error({ err }, 'notifyNewFollower failed'));

  evaluateBadges(followerId).catch((err) => logger.error({ err }, 'evaluateBadges failed'));

  return follow;
}

/** Unfollow a user. Throws FOLLOW_NOT_FOUND if the relationship doesn't exist. */
export async function unfollowUser(followerId: string, followingId: string) {
  await model.deleteFollow(followerId, followingId);
}

/** List paginated followers for a user. */
export async function getFollowers(userId: string, page: number, perPage: number) {
  return model.getFollowers(userId, page, perPage);
}

/** List paginated users that a given user follows. */
export async function getFollowing(userId: string, page: number, perPage: number) {
  return model.getFollowing(userId, page, perPage);
}

/**
 * Type guard that narrows a feed result to the offset-pagination shape.
 *
 * @param result - The union returned by {@link getFeed}.
 * @returns True when the result carries offset pagination metadata (`total`).
 */
export function isFeedOffsetResult(
  result:
    | { recipes: Record<string, unknown>[]; total: number }
    | CursorResult<Record<string, unknown>>,
): result is { recipes: Record<string, unknown>[]; total: number } {
  return !('hasMore' in result);
}

/**
 * Get the feed (public recipes) from users that the given user follows.
 *
 * Returns empty result if the user follows no one. When a cursor is provided,
 * delegates to the recipe model's cursor-based feed query.
 *
 * @param userId   - UUID of the authenticated user.
 * @param page     - Page number for offset mode.
 * @param perPage  - Items per page.
 * @param cursor   - Optional decoded cursor `{ createdAt, id }`.
 * @returns Either `{ recipes, total }` for offset mode or
 *          `{ recipes, hasMore, nextCursor, total? }` for cursor mode.
 */
export async function getFeed(
  userId: string,
  page: number,
  perPage: number,
  cursor?: { createdAt: string; id: string },
): Promise<
  { recipes: Record<string, unknown>[]; total: number } | CursorResult<Record<string, unknown>>
> {
  logger.debug({ userId }, 'getFeed started');
  if (cursor && page > 1) {
    logger.debug(
      { userId, page, perPage },
      'Both cursor and page provided, using cursor pagination',
    );
  }
  const followingIds = await model.getFollowingIds(userId);
  if (followingIds.length === 0) {
    logger.debug({ userId }, 'getFeed completed');
    return { recipes: [], total: 0 };
  }
  const result = await recipeModel.getFeed(followingIds, page, perPage, cursor);
  logger.debug({ userId }, 'getFeed completed');
  return result;
}
