import { z } from 'zod';

/**
 * Follow Output Schemas.
 *
 * `FollowOutputSchema` mirrors the raw `userFollows` row from `createFollow`.
 * `FollowerListItemOutputSchema` / `FollowingListItemOutputSchema` mirror the
 * paginated list projections from `getFollowers` / `getFollowing`, which
 * inner-join the user profile (so the joined object is non-nullable) and expose
 * `{ id, username, displayName, avatarUrl, bio }`.
 *
 * Verified against `packages/db/src/schema.ts` (`userFollows`, `users`) and
 * `apps/api/src/modules/follow/{service,model}.ts`.
 */
export const FollowOutputSchema = z.object({
  id: z.string(),
  followerId: z.string(),
  followingId: z.string(),
  createdAt: z.string(),
});

/** Inferred type of {@link FollowOutputSchema}. */
export type FollowOutput = z.infer<typeof FollowOutputSchema>;

/** Joined user profile projection used by follower/following list items. */
const FollowUserProfileSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
});

/** Validates a follower list item (`userFollows` row plus inner-joined `follower` profile); response envelope for the followers list. */
export const FollowerListItemOutputSchema = z.object({
  id: z.string(),
  followerId: z.string(),
  followingId: z.string(),
  createdAt: z.string(),
  follower: FollowUserProfileSchema,
});

/** Inferred type of {@link FollowerListItemOutputSchema}. */
export type FollowerListItemOutput = z.infer<typeof FollowerListItemOutputSchema>;

/** Validates a following list item (`userFollows` row plus inner-joined `following` profile); response envelope for the following list. */
export const FollowingListItemOutputSchema = z.object({
  id: z.string(),
  followerId: z.string(),
  followingId: z.string(),
  createdAt: z.string(),
  following: FollowUserProfileSchema,
});

/** Inferred type of {@link FollowingListItemOutputSchema}. */
export type FollowingListItemOutput = z.infer<typeof FollowingListItemOutputSchema>;
