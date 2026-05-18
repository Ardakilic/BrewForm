import { z } from 'zod';
import { UuidSchema } from './common.ts';

const usernameRegex = /^[a-zA-Z0-9_-]+$/;

export const AdminCreateUserSchema = z.object({
  email: z.email(),
  username: z.string().min(3).max(30).regex(
    usernameRegex,
    'Username must be alphanumeric with _ and -',
  ),
  password: z.string().min(8).max(128),
  displayName: z.string().max(50).optional(),
  bio: z.string().max(500).optional(),
  isAdmin: z.boolean().optional(),
  isBanned: z.boolean().optional(),
});

export const AdminUpdateUserSchema = z.object({
  email: z.email().optional(),
  username: z.string().min(3).max(30).regex(
    usernameRegex,
    'Username must be alphanumeric with _ and -',
  ).optional(),
  password: z.string().min(8).max(128).optional(),
  displayName: z.string().max(50).optional(),
  bio: z.string().max(500).optional(),
  isAdmin: z.boolean().optional(),
  isBanned: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update.' },
);

export const AdminBanUserSchema = z.object({
  userId: UuidSchema,
  banned: z.boolean(),
  reason: z.string().min(1, 'Ban reason is required.').optional(),
}).refine(
  (data) => {
    if (data.banned && !data.reason) return false;
    return true;
  },
  { message: 'Ban reason is required when banning a user.', path: ['reason'] },
);

export const AdminModifyRecipeVisibilitySchema = z.object({
  recipeId: UuidSchema,
  visibility: z.enum(['draft', 'private', 'unlisted', 'public']),
});

export const AdminFlushCacheSchema = z.object({
  keys: z.array(z.string()).min(1),
});
