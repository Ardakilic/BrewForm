import { z } from 'zod';
import { UuidSchema } from './common.ts';

export const PhotoUploadSchema = z.object({
  recipeId: UuidSchema,
  alt: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).default(0),
});