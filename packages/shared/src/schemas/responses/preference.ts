import { z } from 'zod';

/**
 * User preferences Output Schema — the **flat** `user_preferences` row returned
 * by `preference/service.ts` (`model.findByUserId`/`upsert` via `.returning()`).
 *
 * Note: the request body (`UserPreferencesSchema`) nests notification flags
 * under `emailNotifications`, but the persisted/returned row is flat
 * (`newFollower`, `recipeLiked`, …). This schema reflects the flat row.
 *
 * Verified against `packages/db/src/schema.ts` (`userPreferences`) and
 * `apps/api/src/modules/preference/{service,model}.ts`.
 */
export const UserPreferencesOutputSchema = z.object({
  id: z.string(),
  userId: z.string(),
  unitSystem: z.string(),
  temperatureUnit: z.string(),
  theme: z.string(),
  locale: z.string(),
  timezone: z.string(),
  dateFormat: z.string(),
  newFollower: z.boolean(),
  recipeLiked: z.boolean(),
  recipeCommented: z.boolean(),
  followedUserPosted: z.boolean(),
  mentionedInComment: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type UserPreferencesOutput = z.infer<typeof UserPreferencesOutputSchema>;
