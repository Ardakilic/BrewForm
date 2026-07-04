import { z } from 'zod';
import { UuidSchema } from './common.ts';

/** Describes the photo-upload form fields (recipe id, alt text, sort order) for POST /api/v1/photos, whose multipart body is parsed manually. */
export const PhotoUploadSchema = z.object({
  recipeId: UuidSchema,
  alt: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).default(0),
});
