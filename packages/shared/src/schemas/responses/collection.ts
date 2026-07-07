import { z } from 'zod';
import { VISIBILITY_VALUES } from '../../constants/index.ts';
import { RecipeListItemOutputSchema } from './recipe.ts';
import { RecipeAuthorMiniSchema } from './_shared.ts';

/**
 * Collection Output Schemas — mirrors the shapes returned by
 * `collection/service.ts` (`getCollection`, `listMyCollections`, `listPublicCollections`).
 *
 * Verified against `packages/db/src/schema.ts` (`collections`, `collectionItems`)
 * and `apps/api/src/modules/collection/{service,model}.ts`.
 */

/** Base collection row as returned by the API (wire format — timestamps are ISO strings). */
export const CollectionOutputSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  visibility: z.enum(VISIBILITY_VALUES),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type CollectionOutput = z.infer<typeof CollectionOutputSchema>;

/** Collection list item with computed recipe count (for list endpoints). */
export const CollectionListItemOutputSchema = CollectionOutputSchema.extend({
  recipeCount: z.number().int(),
});
export type CollectionListItemOutput = z.infer<typeof CollectionListItemOutputSchema>;

/** A single collection item with its nested recipe (for the detail endpoint). */
export const CollectionItemOutputSchema = z.object({
  id: z.string(),
  collectionId: z.string(),
  recipeId: z.string(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  recipe: RecipeListItemOutputSchema,
});
export type CollectionItemOutput = z.infer<typeof CollectionItemOutputSchema>;

/** Full collection detail with author, items, and computed recipe count. */
export const CollectionDetailOutputSchema = CollectionOutputSchema.extend({
  author: RecipeAuthorMiniSchema,
  items: z.array(CollectionItemOutputSchema),
  recipeCount: z.number().int(),
});
export type CollectionDetailOutput = z.infer<typeof CollectionDetailOutputSchema>;
