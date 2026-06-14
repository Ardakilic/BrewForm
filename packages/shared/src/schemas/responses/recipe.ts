import { z } from 'zod';
import { PhotoOutputSchema } from './photo.ts';
import { RecipeAuthorMiniSchema } from './_shared.ts';

/**
 * Shared recipe Output Schemas returned by equipment, coffee-variety, and feed
 * routes. Authored from the real `db.query.recipes.findMany(...)` projections in
 * `recipe/model.ts`, `coffee-variety/model.ts`, and `equipment/model.ts`.
 *
 * Verified against `packages/db/src/schema.ts` (`recipes`, `recipeVersions`,
 * `recipeVersionPhotos`, `photos`).
 */

/** Full `recipes` row. */
export const RecipeRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  authorId: z.string(),
  visibility: z.string(),
  currentVersionId: z.string().nullable(),
  likeCount: z.number().int(),
  commentCount: z.number().int(),
  forkCount: z.number().int(),
  forkedFromId: z.string().nullable(),
  featured: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type RecipeRow = z.infer<typeof RecipeRowSchema>;

/**
 * Recipe enriched with the mini author projection
 * (`{ username, displayName, avatarUrl }`), as returned by
 * `equipment/model.ts getRecipesUsingEquipment`.
 */
export const RecipeWithAuthorOutputSchema = RecipeRowSchema.extend({
  author: RecipeAuthorMiniSchema,
});

export type RecipeWithAuthorOutput = z.infer<typeof RecipeWithAuthorOutputSchema>;

/** A `recipeVersionPhotos` join row carrying the full joined `photo`. */
const RecipeVersionPhotoSchema = z.object({
  id: z.string(),
  recipeVersionId: z.string(),
  photoId: z.string(),
  sortOrder: z.number().int(),
  photo: PhotoOutputSchema,
});

/**
 * Full `recipeVersions` row plus its `versionPhotos[]`. Nullable columns use
 * `.nullable()`; `tds` is `numeric` → serialized as a string by postgres-js,
 * while `real`/`integer` columns deserialize to numbers.
 */
export const RecipeVersionRowSchema = z.object({
  id: z.string(),
  recipeId: z.string(),
  versionNumber: z.number().int(),
  productName: z.string().nullable(),
  coffeeBrand: z.string().nullable(),
  coffeeProcessing: z.string().nullable(),
  vendorId: z.string().nullable(),
  roastDate: z.string().nullable(),
  packageOpenDate: z.string().nullable(),
  grindDate: z.string().nullable(),
  brewDate: z.string(),
  brewMethod: z.string(),
  drinkType: z.string(),
  brewerDetails: z.string().nullable(),
  grinder: z.string().nullable(),
  grindSize: z.string().nullable(),
  groundWeightGrams: z.number().nullable(),
  extractionTimeSeconds: z.number().int().nullable(),
  extractionVolumeMl: z.number().nullable(),
  temperatureCelsius: z.number().nullable(),
  tds: z.string().nullable(),
  brewRatio: z.number().nullable(),
  flowRate: z.number().nullable(),
  preInfusionTimeSeconds: z.number().int().nullable(),
  beanId: z.string().nullable(),
  coffeeVarietyId: z.string().nullable(),
  coffeeVarietyName: z.string().nullable(),
  personalNotes: z.string().nullable(),
  preparationNotes: z.string(),
  isFavourite: z.boolean(),
  rating: z.number().int().nullable(),
  emojiTag: z.string().nullable(),
  createdAt: z.string(),
  versionPhotos: z.array(RecipeVersionPhotoSchema),
});

export type RecipeVersionRow = z.infer<typeof RecipeVersionRowSchema>;

/**
 * Recipe with author + full `versions[]` (each with `versionPhotos[]`), as
 * returned by `coffee-variety/model.ts getRecipesUsingVariety`.
 */
export const RecipeWithVersionsOutputSchema = RecipeRowSchema.extend({
  author: RecipeAuthorMiniSchema,
  versions: z.array(RecipeVersionRowSchema),
});

export type RecipeWithVersionsOutput = z.infer<typeof RecipeWithVersionsOutputSchema>;

/**
 * Feed recipe (follow `/feed` → `recipe/model.ts getFeed → findMany`). The feed
 * author projection is `{ id, username, displayName }` only (no `avatarUrl`),
 * and no `versions` are loaded.
 */
export const FeedRecipeOutputSchema = RecipeRowSchema.extend({
  author: z.object({
    id: z.string(),
    username: z.string(),
    displayName: z.string().nullable(),
  }),
});

export type FeedRecipeOutput = z.infer<typeof FeedRecipeOutputSchema>;
