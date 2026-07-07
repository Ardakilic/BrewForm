// deno-lint-ignore-file no-explicit-any require-await
import * as model from './model.ts';
import type { CollectionCreate, CollectionUpdate } from '@brewform/shared/schemas';
import type { Visibility } from '@brewform/shared/types';
import { createLogger } from '../../utils/logger/index.ts';
import * as recipeModel from '../recipe/model.ts';

const logger = createLogger('collection-service');

/**
 * Map a model.findById result (with `user` and `items` relations) to the CollectionDetailOutput
 * wire shape. Converts Date timestamps to ISO strings and projects the user to the
 * RecipeAuthorMini shape.
 */
function toDetailOutput(collection: any): any {
  return {
    id: collection.id,
    userId: collection.userId,
    name: collection.name,
    description: collection.description,
    visibility: collection.visibility,
    createdAt: collection.createdAt instanceof Date
      ? collection.createdAt.toISOString()
      : collection.createdAt,
    updatedAt: collection.updatedAt instanceof Date
      ? collection.updatedAt.toISOString()
      : collection.updatedAt,
    deletedAt: collection.deletedAt instanceof Date
      ? collection.deletedAt.toISOString()
      : collection.deletedAt ?? null,
    author: collection.user
      ? {
        username: collection.user.username,
        displayName: collection.user.displayName,
        avatarUrl: collection.user.avatarUrl,
      }
      : { username: '', displayName: null, avatarUrl: null },
    items: (collection.items ?? []).map((item: any) => ({
      id: item.id,
      collectionId: item.collectionId,
      recipeId: item.recipeId,
      sortOrder: item.sortOrder,
      createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
      recipe: item.recipe
        ? {
          id: item.recipe.id,
          slug: item.recipe.slug,
          title: item.recipe.title,
          authorId: item.recipe.authorId,
          visibility: item.recipe.visibility,
          currentVersionId: item.recipe.currentVersionId,
          likeCount: item.recipe.likeCount,
          commentCount: item.recipe.commentCount,
          forkCount: item.recipe.forkCount,
          forkedFromId: item.recipe.forkedFromId,
          featured: item.recipe.featured,
          createdAt: item.recipe.createdAt instanceof Date
            ? item.recipe.createdAt.toISOString()
            : item.recipe.createdAt,
          updatedAt: item.recipe.updatedAt instanceof Date
            ? item.recipe.updatedAt.toISOString()
            : item.recipe.updatedAt,
          deletedAt: item.recipe.deletedAt instanceof Date
            ? item.recipe.deletedAt.toISOString()
            : item.recipe.deletedAt ?? null,
          author: item.recipe.author
            ? {
              id: item.recipe.author.id,
              username: item.recipe.author.username,
              displayName: item.recipe.author.displayName,
            }
            : { id: '', username: '', displayName: null },
        }
        : null,
    })),
    recipeCount: collection.items?.length ?? 0,
  };
}

/**
 * Create a collection for the authenticated user.
 * @param userId - The authenticated user's UUID.
 * @param data   - Collection creation payload (name, description, visibility).
 * @returns The created collection with author, items, and recipeCount.
 */
export async function createCollection(userId: string, data: CollectionCreate) {
  logger.debug({ userId }, 'createCollection started');
  const created = await model.create({ userId, ...data });
  const collection = await model.findById(created.id);
  logger.debug({ userId, collectionId: created.id }, 'createCollection completed');
  return collection ? toDetailOutput(collection) : null;
}

/**
 * Update a collection. Only the owner can update.
 * @param userId       - The authenticated user's UUID.
 * @param collectionId - The collection's UUID.
 * @param data         - Partial update payload.
 * @throws 'COLLECTION_NOT_FOUND' if the collection does not exist.
 * @throws 'FORBIDDEN' if the user is not the collection owner.
 * @returns The updated collection with author, items, and recipeCount.
 */
export async function updateCollection(
  userId: string,
  collectionId: string,
  data: CollectionUpdate,
) {
  logger.debug({ userId, collectionId }, 'updateCollection started');
  const collection = await model.findById(collectionId);
  if (!collection) throw new Error('COLLECTION_NOT_FOUND');
  if (collection.userId !== userId) throw new Error('FORBIDDEN');
  await model.update(collectionId, data);
  const updated = await model.findById(collectionId);
  logger.debug({ userId, collectionId }, 'updateCollection completed');
  return updated ? toDetailOutput(updated) : null;
}

/**
 * Soft-delete a collection. Only the owner can delete.
 * @param userId       - The authenticated user's UUID.
 * @param collectionId - The collection's UUID.
 * @throws 'COLLECTION_NOT_FOUND' if the collection does not exist.
 * @throws 'FORBIDDEN' if the user is not the collection owner.
 */
export async function deleteCollection(userId: string, collectionId: string) {
  logger.debug({ userId, collectionId }, 'deleteCollection started');
  const collection = await model.findById(collectionId);
  if (!collection) throw new Error('COLLECTION_NOT_FOUND');
  if (collection.userId !== userId) throw new Error('FORBIDDEN');
  await model.softDelete(collectionId);
  logger.debug({ userId, collectionId }, 'deleteCollection completed');
}

/**
 * Get a collection by ID with visibility check.
 * @param userId       - The requesting user's UUID (null if unauthenticated).
 * @param collectionId - The collection's UUID.
 * @throws 'COLLECTION_NOT_FOUND' if the collection does not exist.
 * @throws 'FORBIDDEN' if the collection is private/draft and the requester is not the owner.
 * @returns The collection with author, items, and recipeCount.
 */
export async function getCollection(userId: string | null, collectionId: string) {
  logger.debug({ userId, collectionId }, 'getCollection started');
  const collection = await model.findById(collectionId);
  if (!collection) throw new Error('COLLECTION_NOT_FOUND');
  if (
    (collection.visibility === 'private' || collection.visibility === 'draft') &&
    collection.userId !== userId
  ) {
    throw new Error('FORBIDDEN');
  }
  logger.debug({ userId, collectionId }, 'getCollection completed');
  return toDetailOutput(collection);
}

/**
 * List the authenticated user's collections (paginated).
 * @param userId     - The authenticated user's UUID.
 * @param page       - 1-based page number.
 * @param perPage    - Page size.
 * @param visibility - Optional visibility filter.
 * @returns `{ collections, total }` where each collection has a recipeCount.
 */
export async function listMyCollections(
  userId: string,
  page: number,
  perPage: number,
  visibility?: Visibility,
) {
  logger.debug({ userId, page, perPage }, 'listMyCollections started');
  const result = await model.findByUserId(userId, page, perPage, visibility);
  logger.debug({ userId, total: result.total }, 'listMyCollections completed');
  return result;
}

/**
 * List a user's public collections (paginated).
 * @param userId  - The target user's UUID.
 * @param page    - 1-based page number.
 * @param perPage - Page size.
 * @returns `{ collections, total }` where each collection has a recipeCount.
 */
export async function listPublicCollections(userId: string, page: number, perPage: number) {
  logger.debug({ userId, page, perPage }, 'listPublicCollections started');
  const result = await model.findPublicByUserId(userId, page, perPage);
  logger.debug({ userId, total: result.total }, 'listPublicCollections completed');
  return result;
}

/**
 * Add a recipe to a collection.
 * @param userId       - The authenticated user's UUID.
 * @param collectionId - The collection's UUID.
 * @param recipeId     - The recipe's UUID.
 * @param sortOrder    - Optional explicit sort order (appended to end if omitted).
 * @throws 'COLLECTION_NOT_FOUND' if the collection does not exist.
 * @throws 'FORBIDDEN' if the user is not the collection owner, or the recipe is not public and
 *   not owned by the user.
 * @throws 'RECIPE_NOT_FOUND' if the recipe does not exist.
 * @throws 'ALREADY_IN_COLLECTION' if the recipe is already in the collection.
 */
export async function addRecipeToCollection(
  userId: string,
  collectionId: string,
  recipeId: string,
  sortOrder?: number,
) {
  logger.debug({ userId, collectionId, recipeId }, 'addRecipeToCollection started');
  const collection = await model.findById(collectionId);
  if (!collection) throw new Error('COLLECTION_NOT_FOUND');
  if (collection.userId !== userId) throw new Error('FORBIDDEN');
  const recipe = await recipeModel.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.visibility !== 'public' && recipe.authorId !== userId) throw new Error('FORBIDDEN');
  try {
    await model.addItem(collectionId, recipeId, sortOrder);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const causeMessage = err instanceof Error && err.cause instanceof Error
      ? err.cause.message
      : '';
    if (
      message.includes('unique') ||
      message.includes('duplicate') ||
      causeMessage.includes('unique') ||
      causeMessage.includes('duplicate')
    ) {
      throw new Error('ALREADY_IN_COLLECTION');
    }
    logger.error({ err, userId, collectionId, recipeId }, 'addRecipeToCollection failed');
    throw err;
  }
  logger.debug({ userId, collectionId, recipeId }, 'addRecipeToCollection completed');
}

/**
 * Remove a recipe from a collection.
 * @param userId       - The authenticated user's UUID.
 * @param collectionId - The collection's UUID.
 * @param recipeId     - The recipe's UUID.
 * @throws 'COLLECTION_NOT_FOUND' if the collection does not exist.
 * @throws 'FORBIDDEN' if the user is not the collection owner.
 */
export async function removeRecipeFromCollection(
  userId: string,
  collectionId: string,
  recipeId: string,
) {
  logger.debug({ userId, collectionId, recipeId }, 'removeRecipeFromCollection started');
  const collection = await model.findById(collectionId);
  if (!collection) throw new Error('COLLECTION_NOT_FOUND');
  if (collection.userId !== userId) throw new Error('FORBIDDEN');
  await model.removeItem(collectionId, recipeId);
  logger.debug({ userId, collectionId, recipeId }, 'removeRecipeFromCollection completed');
}

/**
 * Reorder recipes in a collection. The client sends the full ordered list of item IDs.
 * @param userId       - The authenticated user's UUID.
 * @param collectionId - The collection's UUID.
 * @param itemIds      - The full ordered list of collection_item IDs.
 * @throws 'COLLECTION_NOT_FOUND' if the collection does not exist.
 * @throws 'FORBIDDEN' if the user is not the collection owner.
 * @throws 'REORDER_MISMATCH' if the item IDs do not match the collection's items.
 */
export async function reorderCollection(
  userId: string,
  collectionId: string,
  itemIds: string[],
) {
  logger.debug({ userId, collectionId, itemCount: itemIds.length }, 'reorderCollection started');
  const collection = await model.findById(collectionId);
  if (!collection) throw new Error('COLLECTION_NOT_FOUND');
  if (collection.userId !== userId) throw new Error('FORBIDDEN');
  const existingItems = collection.items ?? [];
  if (itemIds.length !== existingItems.length) throw new Error('REORDER_MISMATCH');
  const existingIds = new Set(existingItems.map((i: any) => i.id));
  // Reject duplicate item IDs — a duplicated payload can corrupt ordering
  if (new Set(itemIds).size !== itemIds.length) throw new Error('REORDER_MISMATCH');
  for (const id of itemIds) {
    if (!existingIds.has(id)) throw new Error('REORDER_MISMATCH');
  }
  await model.reorderItems(collectionId, itemIds);
  logger.debug({ userId, collectionId }, 'reorderCollection completed');
}
