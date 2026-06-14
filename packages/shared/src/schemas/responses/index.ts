/**
 * Barrel for entity Output Schemas (response shapes).
 *
 * These document the **actual** service return shapes for OpenAPI via
 * `hono-openapi`'s `resolver()`. They are additive and never alter runtime
 * behavior. Re-exported from `packages/shared/src/schemas/index.ts`.
 */
export { AuthorRefSchema, MessageResponseSchema, RecipeAuthorMiniSchema } from './_shared.ts';
export { BeanOutputSchema } from './bean.ts';
export { BadgeOutputSchema, UserBadgeOutputSchema } from './badge.ts';
export { VendorOutputSchema } from './vendor.ts';
export { PhotoOutputSchema } from './photo.ts';
export { ReportOutputSchema } from './report.ts';
export { SetupOutputSchema } from './setup.ts';
export { UserPreferencesOutputSchema } from './preference.ts';
export {
  FollowerListItemOutputSchema,
  FollowingListItemOutputSchema,
  FollowOutputSchema,
} from './follow.ts';
export { CoffeeVarietyOutputSchema } from './coffee-variety.ts';
export {
  EquipmentDeleteRequestOutputSchema,
  EquipmentDeleteRequestResponseSchema,
  EquipmentOutputSchema,
  EquipmentRecipesResponseSchema,
} from './equipment.ts';
export {
  FeedRecipeOutputSchema,
  RecipeRowSchema,
  RecipeVersionRowSchema,
  RecipeWithAuthorOutputSchema,
  RecipeWithVersionsOutputSchema,
} from './recipe.ts';
export {
  CommentOutputSchema,
  CommentWithAuthorOutputSchema,
  CommentWithRepliesOutputSchema,
} from './comment.ts';
export { TasteNoteNodeOutputSchema, TasteNoteOutputSchema } from './taste.ts';
export {
  PublicUserOutputSchema,
  SelfUserOutputSchema,
  UserRowOutputSchema,
} from './user.ts';
