import { z } from 'zod';
import { EquipmentOutputSchema } from './equipment.ts';
import { PhotoOutputSchema } from './photo.ts';
import { TasteNoteOutputSchema } from './taste.ts';
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

/**
 * Recipe list-item payload (`recipe/model.ts findMany` / `findCursor`): full recipe
 * row plus mini author projection `{ id, username, displayName }`. No per-user
 * overlay (the list endpoint does not compute like/favourite/rating state).
 *
 * Structurally identical to `FeedRecipeOutputSchema` — kept as a distinct export
 * so the list endpoint's contract is named explicitly and can diverge from the
 * feed endpoint if future enrichment is added.
 */
export const RecipeListItemOutputSchema = FeedRecipeOutputSchema;
export type RecipeListItemOutput = z.infer<typeof RecipeListItemOutputSchema>;

/**
 * Author projection for the recipe detail payload (`recipe/model.ts findById`).
 * Unlike `RecipeAuthorMiniSchema`, this includes `id`.
 */
export const RecipeDetailAuthorOutputSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

/** A `recipeTasteNotes` join row carrying the full joined `tasteNotes` row. */
const RecipeDetailTasteNoteSchema = z.object({
  id: z.string(),
  recipeVersionId: z.string(),
  tasteNoteId: z.string(),
  intensity: z.number().int(),
  tasteNote: TasteNoteOutputSchema,
});

/** A `recipeEquipment` join row carrying the full joined `equipment` row. */
const RecipeDetailEquipmentSchema = z.object({
  id: z.string(),
  recipeVersionId: z.string(),
  equipmentId: z.string(),
  equipment: z.lazy(() => EquipmentOutputSchema),
});

/** A `recipeAdditionalPreparations` row. */
const RecipeDetailAdditionalPreparationSchema = z.object({
  id: z.string(),
  recipeVersionId: z.string(),
  name: z.string(),
  type: z.string(),
  inputAmount: z.string(),
  preparationType: z.string(),
  sortOrder: z.number().int(),
});

/** Partial bean projection returned on a recipe version (`origin`, `roaster`, `roastLevel`). */
const RecipeDetailBeanMiniSchema = z.object({
  origin: z.string().nullable(),
  roaster: z.string().nullable(),
  roastLevel: z.string().nullable(),
});

/**
 * Recipe version enriched with nested relations (taste notes, equipment,
 * additional preparations, version photos, and bean), as returned by
 * `recipe/model.ts findById`.
 */
export const RecipeDetailVersionOutputSchema = RecipeVersionRowSchema.omit({ versionPhotos: true })
  .extend(
    {
      tasteNotes: z.array(RecipeDetailTasteNoteSchema),
      equipment: z.array(RecipeDetailEquipmentSchema),
      additionalPreparations: z.array(RecipeDetailAdditionalPreparationSchema),
      versionPhotos: z.array(RecipeVersionPhotoSchema),
      bean: RecipeDetailBeanMiniSchema.nullable(),
    },
  );

/** Forked-from recipe projection (`{ id, slug, title }`) — `null` when not a fork. */
const RecipeForkedFromMiniSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
}).nullable();

/**
 * Flattened taste-note item returned by the GET /:slugOrId route handler. The
 * handler spreads the joined `tasteNote` row, then adds `tasteNoteId` (the join
 * row's foreign key), `rootCategoryName` (resolved from the taste-note root map
 * for the radar chart), and `intensity` (the join row's intensity value).
 */
const RecipeDetailFlatTasteNoteSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  color: z.string().nullable(),
  definition: z.string().nullable(),
  depth: z.number().int(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  tasteNoteId: z.string().nullable(),
  rootCategoryName: z.string().nullable(),
  intensity: z.number().int(),
});

/**
 * Flattened equipment item returned by the GET /:slugOrId route handler. The
 * handler spreads the joined `equipment` row and adds `equipmentId` (the join
 * row's foreign key) so the frontend can reference the equipment without
 * reaching into the nested object.
 */
const RecipeDetailFlatEquipmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  description: z.string().nullable(),
  createdBy: z.string().nullable(),
  isSystem: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  equipmentId: z.string(),
});

/**
 * Recipe detail payload (`recipe/model.ts findById` + per-request overlay
 * computed by the GET /:slugOrId route handler): full recipe row plus author
 * (with `id`), versions (each with nested taste notes, equipment, additional
 * preparations, version photos, and bean), photos, and forked-from. The overlay
 * fields (`currentVersion`, flattened `tasteNotes`/`equipment`, `bean`,
 * `versionCount`, `forkedFromSlug`, `userLiked`, `userFavourited`,
 * `favouriteCount`, `avgRating`, `ratingCount`, `userRating`) are added by the
 * route handler from `model.getUserLikeStatus`/`getFavouriteCount`/
 * `getRecipeRatingStats`/`getUserRating` and a taste-note root map.
 */
export const RecipeDetailOutputSchema = RecipeRowSchema.extend({
  author: RecipeDetailAuthorOutputSchema,
  versions: z.array(RecipeDetailVersionOutputSchema),
  photos: z.array(PhotoOutputSchema),
  forkedFrom: RecipeForkedFromMiniSchema,
  currentVersion: RecipeDetailVersionOutputSchema.nullable(),
  tasteNotes: z.array(RecipeDetailFlatTasteNoteSchema),
  equipment: z.array(RecipeDetailFlatEquipmentSchema),
  bean: RecipeDetailBeanMiniSchema.nullable(),
  versionCount: z.number().int(),
  forkedFromSlug: z.string().nullable(),
  userLiked: z.boolean(),
  userFavourited: z.boolean(),
  favouriteCount: z.number().int(),
  avgRating: z.number().nullable(),
  ratingCount: z.number().int(),
  userRating: z.number().int().nullable(),
});

export type RecipeDetailOutput = z.infer<typeof RecipeDetailOutputSchema>;
