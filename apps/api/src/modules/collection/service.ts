import * as model from './model.ts';
import type { CollectionCreate, CollectionUpdate } from '@brewform/shared/schemas';
import type { Visibility } from '@brewform/shared/types';
import { createLogger } from '../../utils/logger/index.ts';
import * as recipeModel from '../recipe/model.ts';
import { cacheProvider } from '../../utils/cache/singleton.ts';

/** Module logger (exported for test spies — mirrors coffee-variety/service.ts). */
export const logger = createLogger('collection-service');

/** Detail-cache key for one collection (TTL 10 min). */
const COLLECTION_DETAIL_KEY = (id: string) => ['collection-detail', id];
const COLLECTION_DETAIL_TTL_MS = 10 * 60 * 1000;
/** Shared prefix for all collection LIST caches — swept on every mutation. */
const COLLECTION_LIST_PREFIX = ['cache', 'collections'];
const COLLECTION_LIST_TTL_MS = 5 * 60 * 1000;

/**
 * A fully-loaded collection row as returned by {@link model.findById}: the
 * collection with its owner `user` relation and ordered `items`, each carrying
 * the nested recipe (author + latest-version brew/drink projection). Mirrors the
 * D34 idiom used in `recipe/service.ts`.
 */
type CollectionWithRelations = NonNullable<Awaited<ReturnType<typeof model.findById>>>;

/**
 * Map a model.findById result (with `user` and `items` relations) to the CollectionDetailOutput
 * wire shape. Converts Date timestamps to ISO strings and projects the user to the
 * RecipeAuthorMini shape.
 */
function toDetailOutput(collection: CollectionWithRelations) {
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
    items: (collection.items ?? []).map((item) => ({
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
          // Projected from the latest recipe version (versions is limited to 1
          // in the model query). Null when the recipe has no versions yet.
          brewMethod: item.recipe?.versions?.[0]?.brewMethod ?? null,
          drinkType: item.recipe?.versions?.[0]?.drinkType ?? null,
        }
        : null,
    })),
    recipeCount: collection.items?.length ?? 0,
  };
}

/** A single public-collection row as returned by {@link model.findAllPublic}. */
type PublicCollectionRow = Awaited<ReturnType<typeof model.findAllPublic>>['collections'][number];

/**
 * Map a model.findAllPublic row to the PublicCollectionListItemOutput wire
 * shape: ISO timestamps, recipeCount, and the owner `author` projection.
 */
function toPublicListItemOutput(c: PublicCollectionRow) {
  return {
    id: c.id,
    userId: c.userId,
    name: c.name,
    description: c.description,
    visibility: c.visibility,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
    deletedAt: c.deletedAt instanceof Date ? c.deletedAt.toISOString() : c.deletedAt ?? null,
    recipeCount: c.recipeCount,
    author: c.user
      ? {
        username: c.user.username,
        displayName: c.user.displayName,
        avatarUrl: c.user.avatarUrl,
      }
      : { username: '', displayName: null, avatarUrl: null },
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
  // Fresh UUID — no detail-cache entry can exist yet; sweep lists only.
  await cacheProvider?.deleteByPrefix(COLLECTION_LIST_PREFIX);
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
  await cacheProvider?.delete(COLLECTION_DETAIL_KEY(collectionId));
  await cacheProvider?.deleteByPrefix(COLLECTION_LIST_PREFIX);
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
  await cacheProvider?.delete(COLLECTION_DETAIL_KEY(collectionId));
  await cacheProvider?.deleteByPrefix(COLLECTION_LIST_PREFIX);
  logger.debug({ userId, collectionId }, 'deleteCollection completed');
}

/**
 * Get a collection by ID with visibility check (cache-aside, 10 min TTL).
 * @param userId       - The requesting user's UUID (null if unauthenticated).
 * @param collectionId - The collection's UUID.
 * @throws 'COLLECTION_NOT_FOUND' if the collection does not exist.
 * @throws 'FORBIDDEN' if the collection is private/draft and the requester is not the owner.
 * @returns The collection with author, items, and recipeCount.
 */
export async function getCollection(userId: string | null, collectionId: string) {
  logger.debug({ userId, collectionId }, 'getCollection started');
  const cached = await cacheProvider?.get<ReturnType<typeof toDetailOutput>>(
    COLLECTION_DETAIL_KEY(collectionId),
  );
  if (cached) {
    // A cache hit must NEVER widen access (design.md Risk 3): replay the
    // visibility check against the cached shape, which retains userId and
    // visibility — a private collection warmed by its owner stays forbidden
    // to everyone else.
    if (
      (cached.visibility === 'private' || cached.visibility === 'draft') &&
      cached.userId !== userId
    ) {
      throw new Error('FORBIDDEN');
    }
    logger.debug({ userId, collectionId }, 'getCollection cache hit');
    return cached;
  }
  const collection = await model.findById(collectionId);
  if (!collection) throw new Error('COLLECTION_NOT_FOUND');
  if (
    (collection.visibility === 'private' || collection.visibility === 'draft') &&
    collection.userId !== userId
  ) {
    throw new Error('FORBIDDEN');
  }
  // Cache only AFTER the not-found check; cache regardless of visibility —
  // the cached-hit re-check above guards private/draft entries.
  const result = toDetailOutput(collection);
  await cacheProvider?.set(COLLECTION_DETAIL_KEY(collectionId), result, {
    ttlMs: COLLECTION_DETAIL_TTL_MS,
  });
  logger.debug({ userId, collectionId }, 'getCollection completed');
  return result;
}

/**
 * List the authenticated user's collections (paginated).
 * @param userId     - The authenticated user's UUID.
 * @param page       - 1-based page number.
 * @param perPage    - Page size.
 * @param visibility - Optional visibility filter.
 * @param recipeId   - Optional recipe context; when provided, each row carries
 *   `containsRecipe` flagging whether the collection already contains that recipe.
 * @returns `{ collections, total }` where each collection has a recipeCount.
 */
export async function listMyCollections(
  userId: string,
  page: number,
  perPage: number,
  visibility?: Visibility,
  recipeId?: string,
) {
  logger.debug({ userId, page, perPage }, 'listMyCollections started');
  // With a recipe context the per-(user, recipe) `containsRecipe` overlay feeds
  // the AddToCollection modal and has near-zero hit rate — BYPASS the cache
  // entirely (read-through, no store; design.md Decision 5).
  if (recipeId) {
    const result = await model.findByUserId(userId, page, perPage, visibility, recipeId);
    logger.debug({ userId, total: result.total }, 'listMyCollections completed (cache bypass)');
    return result;
  }
  const key = [
    ...COLLECTION_LIST_PREFIX,
    'my',
    userId,
    String(page),
    String(perPage),
    visibility ?? 'all',
  ];
  const cached = await cacheProvider?.get<Awaited<ReturnType<typeof model.findByUserId>>>(key);
  if (cached) {
    logger.debug({ userId }, 'listMyCollections cache hit');
    return cached;
  }
  const result = await model.findByUserId(userId, page, perPage, visibility);
  await cacheProvider?.set(key, result, { ttlMs: COLLECTION_LIST_TTL_MS });
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
  const key = [...COLLECTION_LIST_PREFIX, 'user', userId, String(page), String(perPage)];
  const cached = await cacheProvider?.get<Awaited<ReturnType<typeof model.findPublicByUserId>>>(
    key,
  );
  if (cached) {
    logger.debug({ userId }, 'listPublicCollections cache hit');
    return cached;
  }
  const result = await model.findPublicByUserId(userId, page, perPage);
  await cacheProvider?.set(key, result, { ttlMs: COLLECTION_LIST_TTL_MS });
  logger.debug({ userId, total: result.total }, 'listPublicCollections completed');
  return result;
}

/**
 * List the collections containing a recipe, visibility-filtered for the viewer
 * (D99.5 / US-9): public collections for anyone, plus the viewer's own of any
 * visibility. No recipe existence/visibility check here — the route sits under
 * the recipe read path which has already resolved the recipe. NOT cached in
 * wave 5 (the ledger docCorrection drops the old cache sub-item for this
 * surface).
 *
 * @param viewerId - The requesting user's UUID (null if unauthenticated).
 * @param recipeId - The recipe's UUID.
 * @returns Array of `{ id, name, visibility, userId }` list items.
 */
export async function listCollectionsForRecipe(viewerId: string | null, recipeId: string) {
  logger.debug({ viewerId, recipeId }, 'listCollectionsForRecipe started');
  const rows = await model.getCollectionsForRecipe(recipeId, viewerId);
  logger.debug({ viewerId, recipeId, count: rows.length }, 'listCollectionsForRecipe completed');
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    visibility: row.visibility,
    userId: row.userId,
  }));
}

/**
 * List all public collections across all users, for the global browse endpoint.
 * Each item includes `recipeCount` and the owner's `author` projection
 * (username, displayName, avatarUrl) to match PublicCollectionListItemOutputSchema.
 *
 * @param page    - 1-based page number.
 * @param perPage - Page size.
 * @returns `{ collections, total }` where each collection has author + recipeCount.
 */
export async function listAllPublicCollections(page: number, perPage: number) {
  logger.debug({ page, perPage }, 'listAllPublicCollections started');
  const key = [...COLLECTION_LIST_PREFIX, 'public', String(page), String(perPage)];
  const cached = await cacheProvider?.get<{
    collections: ReturnType<typeof toPublicListItemOutput>[];
    total: number;
  }>(key);
  if (cached) {
    logger.debug({ page, perPage }, 'listAllPublicCollections cache hit');
    return cached;
  }
  try {
    const result = await model.findAllPublic(page, perPage);
    const mapped = result.collections.map(toPublicListItemOutput);
    const output = { collections: mapped, total: result.total };
    await cacheProvider?.set(key, output, { ttlMs: COLLECTION_LIST_TTL_MS });
    logger.debug({ total: result.total }, 'listAllPublicCollections completed');
    return output;
  } catch (err) {
    logger.error({ err, page, perPage }, 'listAllPublicCollections failed');
    throw err;
  }
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
  // Invalidate only AFTER the write succeeded — an ALREADY_IN_COLLECTION
  // failure above must not flush the cache.
  await cacheProvider?.delete(COLLECTION_DETAIL_KEY(collectionId));
  await cacheProvider?.deleteByPrefix(COLLECTION_LIST_PREFIX);
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
  await cacheProvider?.delete(COLLECTION_DETAIL_KEY(collectionId));
  await cacheProvider?.deleteByPrefix(COLLECTION_LIST_PREFIX);
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
  const existingIds = new Set(existingItems.map((i) => i.id));
  // Reject duplicate item IDs — a duplicated payload can corrupt ordering
  if (new Set(itemIds).size !== itemIds.length) throw new Error('REORDER_MISMATCH');
  for (const id of itemIds) {
    if (!existingIds.has(id)) throw new Error('REORDER_MISMATCH');
  }
  await model.reorderItems(collectionId, itemIds);
  await cacheProvider?.delete(COLLECTION_DETAIL_KEY(collectionId));
  await cacheProvider?.deleteByPrefix(COLLECTION_LIST_PREFIX);
  logger.debug({ userId, collectionId }, 'reorderCollection completed');
}
