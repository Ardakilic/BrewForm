import { z } from 'zod';
import { UuidSchema } from './common.ts';

const usernameRegex = /^[a-zA-Z0-9_-]+$/;

/**
 * Validates admin user-creation payloads.
 * Used by POST /api/v1/admin/users.
 */
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

/**
 * Validates admin user-update payloads (at least one field required).
 * Used by PATCH /api/v1/admin/users/:id.
 */
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

/**
 * Validates ban/unban payloads (reason required when banning).
 * Used by POST /api/v1/admin/users/:id/ban.
 */
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

/**
 * Validates admin role-grant/revoke payloads.
 * Used by PATCH /api/v1/admin/users/:id/admin.
 */
export const AdminSetRoleSchema = z.object({
  isAdmin: z.boolean(),
});

/**
 * Validates recipe-visibility change payloads.
 * Used by PATCH /api/v1/admin/recipes/:id/visibility.
 */
export const AdminModifyRecipeVisibilitySchema = z.object({
  recipeId: UuidSchema,
  visibility: z.enum(['draft', 'private', 'unlisted', 'public']),
});

/**
 * Validates cache-flush payloads (non-empty list of cache keys).
 * Used by POST /api/v1/admin/cache/flush.
 */
export const AdminFlushCacheSchema = z.object({
  keys: z.array(z.string()).min(1),
});
