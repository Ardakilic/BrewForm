import { z } from 'zod';

/**
 * User Output Schemas — three distinct returned shapes.
 *
 *  - `SelfUserOutputSchema` (`GET /me`, `getProfile`): the `users` row minus
 *    `passwordHash`, plus the nested `preferences` object (nullable, from the
 *    `user_preferences` leftJoin in `model.findById`) and the `recipeCount` /
 *    `followerCount` / `followingCount` stats.
 *  - `UserRowOutputSchema` (`PATCH /me`, `updateProfile`): the bare `users` row
 *    minus `passwordHash` (no preferences, no stats).
 *  - `PublicUserOutputSchema` (`GET /:username`, `getPublicProfile`): the row
 *    minus `passwordHash` and `email`, plus stats, `recipes[]`, `badges` (always
 *    `[]`), and `isFollowing`.
 *
 * Verified against `packages/db/src/schema.ts` (`users`, `userPreferences`) and
 * `apps/api/src/modules/user/{service,model}.ts`.
 */

/** Base `users` row with `passwordHash` stripped. */
const UserBaseSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailVerifiedAt: z.string().nullable(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
  onboardingCompleted: z.boolean(),
  isAdmin: z.boolean(),
  isBanned: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

/** Aggregated profile stats. */
const UserStatsSchema = {
  recipeCount: z.number().int(),
  followerCount: z.number().int(),
  followingCount: z.number().int(),
};

/** Nested preferences projection on the self profile (nullable when absent). */
const SelfPreferencesSchema = z
  .object({
    unitSystem: z.string(),
    temperatureUnit: z.string(),
    theme: z.string(),
    locale: z.string(),
    timezone: z.string(),
    dateFormat: z.string(),
    emailNotifications: z.object({
      newFollower: z.boolean(),
      recipeLiked: z.boolean(),
      recipeCommented: z.boolean(),
      followedUserPosted: z.boolean(),
    }),
  })
  .nullable();

export const UserRowOutputSchema = UserBaseSchema;

export type UserRowOutput = z.infer<typeof UserRowOutputSchema>;

export const SelfUserOutputSchema = UserBaseSchema.extend({
  preferences: SelfPreferencesSchema,
  ...UserStatsSchema,
});

export type SelfUserOutput = z.infer<typeof SelfUserOutputSchema>;

/** Public-profile recipe summary item with the latest version's brew metadata. */
const PublicUserRecipeSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  likeCount: z.number().int(),
  commentCount: z.number().int(),
  createdAt: z.string(),
  currentVersion: z
    .object({
      brewMethod: z.string(),
      drinkType: z.string(),
    })
    .nullable(),
});

export const PublicUserOutputSchema = UserBaseSchema.omit({ email: true }).extend({
  ...UserStatsSchema,
  recipes: z.array(PublicUserRecipeSchema),
  badges: z.array(z.unknown()),
  isFollowing: z.boolean(),
});

export type PublicUserOutput = z.infer<typeof PublicUserOutputSchema>;
