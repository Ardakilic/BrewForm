import { z } from 'zod';
import {
  DATE_FORMAT_VALUES,
  TEMPERATURE_UNIT_VALUES,
  THEME_VALUES,
  UNIT_SYSTEM_VALUES,
} from '../constants/index.ts';

/**
 * Validates user-preference payloads (units, theme, locale, timezone,
 * notification preferences), with defaults for every field.
 * Used by PATCH /api/v1/preferences.
 *
 * F05: notification preferences are FLAT (no `emailNotifications` nest).
 * One flag per event gates BOTH in-app record creation AND email sending
 * (the F04 precedent set by `notifyMentionedInComment`).
 */
export const UserPreferencesSchema = z.object({
  unitSystem: z.enum(UNIT_SYSTEM_VALUES).default('metric'),
  temperatureUnit: z.enum(TEMPERATURE_UNIT_VALUES).default('celsius'),
  theme: z.enum(THEME_VALUES).default('light'),
  locale: z.string().default('en'),
  timezone: z.string().default('UTC'),
  dateFormat: z.enum(DATE_FORMAT_VALUES).default('YYYY_MM_DD'),
  notifyNewFollower: z.boolean().default(true),
  notifyRecipeLiked: z.boolean().default(true),
  notifyRecipeCommented: z.boolean().default(true),
  notifyFollowedUserPosted: z.boolean().default(true),
  notifyMentionedInComment: z.boolean().default(true),
});

/**
 * Validates profile-update payloads (display name, bio, avatar URL).
 * Used by PATCH /api/v1/users/me.
 */
export const UserProfileUpdateSchema = z.object({
  displayName: z.string().max(50).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.url().optional(),
});

/** Inferred type of {@link UserProfileUpdateSchema}. */
export type UserProfileUpdate = z.infer<typeof UserProfileUpdateSchema>;
/** Inferred type of {@link UserPreferencesSchema}. */
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
