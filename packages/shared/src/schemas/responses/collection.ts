import { z } from 'zod';
import { VISIBILITY_VALUES } from '../../constants/index.ts';
import { RecipeListItemOutputSchema } from './recipe.ts';
import { RecipeAuthorMiniSchema } from './_shared.ts';

/**
 * Collection Output Schemas — mirrors the shapes returned by
 * `collection/service.ts` (`getCollection`, `listMyCollections`, `listPublicCollections`,
 * `listAllPublicCollections`).
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
/** Inferred type of {@link CollectionOutputSchema}. */
export type CollectionOutput = z.infer<typeof CollectionOutputSchema>;

/**
 * Collection list item with computed recipe count (for list endpoints).
 *
 * `containsRecipe` is populated only when the list request carries a recipe
 * context (the `recipeId` query param on GET /api/v1/collections): it flags
 * whether the collection already contains that recipe. Consumed by the web
 * `AddToCollectionModal` to render a checkmark and toggle membership.
 */
export const CollectionListItemOutputSchema = CollectionOutputSchema.extend({
  recipeCount: z.number().int(),
  containsRecipe: z.boolean().optional(),
});
/** Inferred type of {@link CollectionListItemOutputSchema}. */
export type CollectionListItemOutput = z.infer<typeof CollectionListItemOutputSchema>;

/**
 * Recipe projection for collection items — extends the standard list-item
 * shape with `brewMethod` and `drinkType` from the recipe's current version.
 * Both fields are nullable because a recipe may not have a current version
 * (e.g. draft recipes with no published version yet). Used by the collection
 * detail endpoint to enable brew-method grouping on the frontend.
 */
export const CollectionItemRecipeOutputSchema = RecipeListItemOutputSchema.extend({
  brewMethod: z.string().nullable(),
  drinkType: z.string().nullable(),
});
/** Inferred type of {@link CollectionItemRecipeOutputSchema}. */
export type CollectionItemRecipeOutput = z.infer<typeof CollectionItemRecipeOutputSchema>;

/** A single collection item with its nested recipe (for the detail endpoint). */
export const CollectionItemOutputSchema = z.object({
  id: z.string(),
  collectionId: z.string(),
  recipeId: z.string(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  recipe: CollectionItemRecipeOutputSchema,
});
/** Inferred type of {@link CollectionItemOutputSchema}. */
export type CollectionItemOutput = z.infer<typeof CollectionItemOutputSchema>;

/** Full collection detail with author, items, and computed recipe count. */
export const CollectionDetailOutputSchema = CollectionOutputSchema.extend({
  author: RecipeAuthorMiniSchema,
  items: z.array(CollectionItemOutputSchema),
  recipeCount: z.number().int(),
});
/** Inferred type of {@link CollectionDetailOutputSchema}. */
export type CollectionDetailOutput = z.infer<typeof CollectionDetailOutputSchema>;

/**
 * Public collection list item — a {@link CollectionListItemOutputSchema}
 * enriched with a mini author projection so the global browse page can
 * display "by @username" without a second request.
 */
export const PublicCollectionListItemOutputSchema = CollectionListItemOutputSchema.extend({
  author: RecipeAuthorMiniSchema,
});
/** Inferred type of {@link PublicCollectionListItemOutputSchema}. */
export type PublicCollectionListItemOutput = z.infer<
  typeof PublicCollectionListItemOutputSchema
>;

/**
 * Collections-containing-recipe list item (US-9/D99.5) — the minimal shape
 * for the RecipeDetailPage "In collections" section. Mirrors the rows
 * returned by `collection/service.ts` `listCollectionsForRecipe`: public
 * collections for any viewer, plus the viewer's own of any visibility.
 */
export const RecipeCollectionListItemOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  visibility: z.enum(VISIBILITY_VALUES),
  userId: z.string(),
});
/** Inferred type of {@link RecipeCollectionListItemOutputSchema}. */
export type RecipeCollectionListItemOutput = z.infer<typeof RecipeCollectionListItemOutputSchema>;

/** Array payload of {@link RecipeCollectionListItemOutputSchema} for GET /api/v1/recipes/:slugOrId/collections. */
export const RecipeCollectionsOutputSchema = z.array(RecipeCollectionListItemOutputSchema);
/** Inferred type of {@link RecipeCollectionsOutputSchema}. */
export type RecipeCollectionsOutput = z.infer<typeof RecipeCollectionsOutputSchema>;
