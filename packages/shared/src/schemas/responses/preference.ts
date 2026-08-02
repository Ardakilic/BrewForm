import { z } from 'zod';

/**
 * User preferences Output Schema — the **flat** `user_preferences` row returned
 * by `preference/service.ts` (`model.findByUserId`/`upsert` via `.returning()`).
 *
 * F05: both the request body and the response share the same flat `notify*`
 * field names (the F04 asymmetry — request nested under `emailNotifications`
 * while response was flat — is gone). DB columns are also renamed with the
 * `notify_` prefix to match end-to-end.
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
  notifyNewFollower: z.boolean(),
  notifyRecipeLiked: z.boolean(),
  notifyRecipeCommented: z.boolean(),
  notifyFollowedUserPosted: z.boolean(),
  notifyMentionedInComment: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Inferred type of {@link UserPreferencesOutputSchema}. */
export type UserPreferencesOutput = z.infer<typeof UserPreferencesOutputSchema>;
