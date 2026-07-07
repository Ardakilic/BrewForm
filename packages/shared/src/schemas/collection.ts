import { z } from 'zod';
import { VISIBILITY_VALUES } from '../constants/index.ts';

const VisibilityEnum = z.enum(VISIBILITY_VALUES);

/**
 * Validates collection-creation payloads.
 * Used by POST /api/v1/collections.
 */
export const CollectionCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  visibility: VisibilityEnum.default('private'),
});

/**
 * Validates partial collection-update payloads.
 * Used by PATCH /api/v1/collections/:id.
 */
export const CollectionUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  visibility: VisibilityEnum.optional(),
});

/**
 * Validates "add recipe to collection" payloads.
 * Used by POST /api/v1/collections/:id/recipes.
 */
export const CollectionAddRecipeSchema = z.object({
  recipeId: z.uuid(),
  sortOrder: z.number().int().min(0).optional(),
});

/**
 * Validates collection-reorder payloads (full ordered list of item IDs).
 * Used by PATCH /api/v1/collections/:id/reorder.
 */
export const CollectionReorderSchema = z.object({
  itemIds: z.array(z.uuid()).min(1),
});

/**
 * Validates collection-list query parameters (pagination + optional visibility filter).
 * Used by GET /api/v1/collections and GET /api/v1/users/:userId/collections.
 */
export const CollectionListFilterSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  visibility: VisibilityEnum.optional(),
});

/** Inferred TypeScript type for collection-creation payloads. */
export type CollectionCreate = z.infer<typeof CollectionCreateSchema>;
/** Inferred TypeScript type for partial collection-update payloads. */
export type CollectionUpdate = z.infer<typeof CollectionUpdateSchema>;
