import { z } from 'zod';

/**
 * Photo Output Schema — mirrors the full `photos` row returned by
 * `photo/service.ts` (`model.create`/`findByRecipe`). Reused by recipe version
 * photos.
 *
 * Verified against `packages/db/src/schema.ts` (`photos`) and
 * `apps/api/src/modules/photo/{service,model}.ts`.
 */
export const PhotoOutputSchema = z.object({
  id: z.string(),
  recipeId: z.string(),
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  alt: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
});

/** Inferred type of {@link PhotoOutputSchema}. */
export type PhotoOutput = z.infer<typeof PhotoOutputSchema>;
