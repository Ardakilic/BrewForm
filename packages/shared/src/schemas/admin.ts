import { z } from 'zod';
import { UuidSchema } from './common.ts';

export const AdminBanUserSchema = z.object({
  userId: UuidSchema,
  banned: z.boolean(),
});

export const AdminModifyRecipeVisibilitySchema = z.object({
  recipeId: UuidSchema,
  visibility: z.enum(['draft', 'private', 'unlisted', 'public']),
});

export const AdminFlushCacheSchema = z.object({
  keys: z.array(z.string()).min(1),
});