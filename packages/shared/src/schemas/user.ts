import { z } from 'zod';
import {
  DATE_FORMAT_VALUES,
  TEMPERATURE_UNIT_VALUES,
  THEME_VALUES,
  UNIT_SYSTEM_VALUES,
} from '../constants/index.ts';

/**
 * Validates user-preference payloads (units, theme, locale, timezone, email notifications), with defaults for every field.
 * Used by PATCH /api/v1/preferences.
 */
export const UserPreferencesSchema = z.object({
  unitSystem: z.enum(UNIT_SYSTEM_VALUES).default('metric'),
  temperatureUnit: z.enum(TEMPERATURE_UNIT_VALUES).default('celsius'),
  theme: z.enum(THEME_VALUES).default('light'),
  locale: z.string().default('en'),
  timezone: z.string().default('UTC'),
  dateFormat: z.enum(DATE_FORMAT_VALUES).default('YYYY_MM_DD'),
  emailNotifications: z.object({
    newFollower: z.boolean().default(true),
    recipeLiked: z.boolean().default(true),
    recipeCommented: z.boolean().default(true),
    followedUserPosted: z.boolean().default(true),
  }).default({
    newFollower: true,
    recipeLiked: true,
    recipeCommented: true,
    followedUserPosted: true,
  }),
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
