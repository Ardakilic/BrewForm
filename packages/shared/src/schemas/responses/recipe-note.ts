import { z } from 'zod';

/**
 * Private recipe note Output Schema — the payload of `GET`, `PUT` and `DELETE
 * /api/v1/recipes/:id/notes` (`recipe-note/service.ts`).
 *
 * The note always belongs to the authenticated caller. `notes` and `updatedAt`
 * are `null` when the caller has no live note (never written, or soft-deleted).
 */
export const RecipeUserNoteOutputSchema = z.object({
  recipeId: z.string(),
  notes: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

/** Inferred type of {@link RecipeUserNoteOutputSchema}. */
export type RecipeUserNoteOutput = z.infer<typeof RecipeUserNoteOutputSchema>;
