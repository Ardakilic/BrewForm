import { z } from 'zod';

export const UserPreferencesSchema = z.object({
  unitSystem: z.enum(['metric', 'imperial']).default('metric'),
  temperatureUnit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  theme: z.enum(['light', 'dark', 'coffee']).default('light'),
  locale: z.string().default('en'),
  timezone: z.string().default('UTC'),
  dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).default('YYYY-MM-DD'),
  emailNotifications: z.object({
    newFollower: z.boolean().default(true),
    recipeLiked: z.boolean().default(true),
    recipeCommented: z.boolean().default(true),
    followedUserPosted: z.boolean().default(true),
  }).default({}),
});

export const UserProfileUpdateSchema = z.object({
  displayName: z.string().max(50).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
});