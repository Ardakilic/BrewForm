/**
 * Barrel for entity Output Schemas (response shapes).
 *
 * These document the **actual** service return shapes for OpenAPI via
 * `hono-openapi`'s `resolver()`. They are additive and never alter runtime
 * behavior. Re-exported from `packages/shared/src/schemas/index.ts`.
 */
export { AuthorRefSchema, MessageResponseSchema, RecipeAuthorMiniSchema } from './_shared.ts';
export { BadgeOutputSchema, UserBadgeOutputSchema } from './badge.ts';
export { BeanOutputSchema } from './bean.ts';
export {
  BrewLogListItemOutputSchema,
  BrewLogOutputSchema,
  RecipeBrewStatsOutputSchema,
  UserBrewStatsOutputSchema,
} from './brew-log.ts';
export { CoffeeVarietyOutputSchema } from './coffee-variety.ts';
export {
  CollectionDetailOutputSchema,
  CollectionItemOutputSchema,
  CollectionItemRecipeOutputSchema,
  CollectionListItemOutputSchema,
  CollectionOutputSchema,
  PublicCollectionListItemOutputSchema,
  RecipeCollectionListItemOutputSchema,
  RecipeCollectionsOutputSchema,
} from './collection.ts';
export {
  CommentOutputSchema,
  CommentWithAuthorOutputSchema,
  CommentWithRepliesOutputSchema,
} from './comment.ts';
export {
  EquipmentDeleteRequestOutputSchema,
  EquipmentDeleteRequestResponseSchema,
  EquipmentOutputSchema,
  EquipmentRecipesResponseSchema,
} from './equipment.ts';
export {
  FollowerListItemOutputSchema,
  FollowingListItemOutputSchema,
  FollowOutputSchema,
} from './follow.ts';
export { NotificationOutputSchema, UnreadCountOutputSchema } from './notification.ts';
export { PhotoOutputSchema } from './photo.ts';
export { UserPreferencesOutputSchema } from './preference.ts';
export {
  DiffFieldSchema,
  DiffStatusSchema,
  FeedRecipeOutputSchema,
  ListDiffSchema,
  RecipeDetailAuthorOutputSchema,
  RecipeDetailOutputSchema,
  RecipeDetailVersionOutputSchema,
  RecipeListItemOutputSchema,
  RecipeRowSchema,
  RecipeVersionRowSchema,
  RecipeWithAuthorOutputSchema,
  RecipeWithVersionsOutputSchema,
  VersionDiffOutputSchema,
  VersionMetaSchema,
} from './recipe.ts';
export { ReportOutputSchema } from './report.ts';
export { SetupOutputSchema } from './setup.ts';
export { TasteNoteNodeOutputSchema, TasteNoteOutputSchema } from './taste.ts';
export { PublicUserOutputSchema, SelfUserOutputSchema, UserRowOutputSchema } from './user.ts';
export { VendorOutputSchema } from './vendor.ts';
