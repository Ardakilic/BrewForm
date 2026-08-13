import { z } from 'zod';

/**
 * Brew Log Output Schemas — mirrors the shapes returned by
 * `brew-log/service.ts`.
 *
 * Verified against `packages/db/src/schema.ts` (`brewLogs`) and
 * `apps/api/src/modules/brew-log/{service,model}.ts`.
 */

/** Base brew-log row as returned by the API (wire format — timestamps are ISO strings). */
export const BrewLogOutputSchema = z.object({
  id: z.string(),
  userId: z.string(),
  recipeId: z.string(),
  recipeVersionId: z.string().nullable(),
  brewedAt: z.string(),
  yieldActual: z.number().nullable(),
  doseActual: z.number().nullable(),
  notes: z.string().nullable(),
  personalRating: z.number().int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
/** Inferred type of {@link BrewLogOutputSchema}. */
export type BrewLogOutput = z.infer<typeof BrewLogOutputSchema>;

/** Brew-log list item enriched with the recipe's title and slug (for list endpoints). */
export const BrewLogListItemOutputSchema = BrewLogOutputSchema.extend({
  recipeTitle: z.string(),
  recipeSlug: z.string(),
});
/** Inferred type of {@link BrewLogListItemOutputSchema}. */
export type BrewLogListItemOutput = z.infer<typeof BrewLogListItemOutputSchema>;

/** Aggregate brew statistics for the current user's brew journal. */
export const UserBrewStatsOutputSchema = z.object({
  totalBrews: z.number().int(),
  last30Days: z.number().int(),
  distinctRecipeCount: z.number().int(),
  firstBrewedAt: z.string().nullable(),
  lastBrewedAt: z.string().nullable(),
});
/** Inferred type of {@link UserBrewStatsOutputSchema}. */
export type UserBrewStatsOutput = z.infer<typeof UserBrewStatsOutputSchema>;

/**
 * Per-recipe brew statistics — PUBLIC aggregates across ALL users' brew logs.
 *
 * `brewCount` and `avgBrewRating` aggregate every user's non-deleted brews of
 * the recipe (individual brew logs and their ratings remain owner-private).
 * They are DISTINCT from the community `avgRating` metric on
 * {@link RecipeDetailOutputSchema} — never conflate the two.
 */
export const RecipeBrewStatsOutputSchema = z.object({
  recipeId: z.string(),
  brewCount: z.number().int(),
  avgBrewRating: z.number().nullable(),
});
/** Inferred type of {@link RecipeBrewStatsOutputSchema}. */
export type RecipeBrewStatsOutput = z.infer<typeof RecipeBrewStatsOutputSchema>;
