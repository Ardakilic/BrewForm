import type { CollectionCreate, CollectionUpdate } from '@brewform/shared/schemas';
import type { Visibility } from '@brewform/shared/types';
import { cacheProvider } from '../../utils/cache/singleton.ts';
import { isUniqueViolation, toLoggableError } from '../../utils/errors.ts';
import { createLogger } from '../../utils/logger/index.ts';
import * as recipeModel from '../recipe/model.ts';
import { canListRecipe } from '../recipe/service.ts';
import * as model from './model.ts';

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

/** One loaded collection item whose recipe exists (narrowed by {@link hasLiveRecipe}). */
type LoadedItem = CollectionWithRelations['items'][number];

/**
 * Type guard: the item's recipe was loaded and was not soft-deleted at fill
 * time. Deleted recipes never enter the cached detail shape.
 *
 * @param item - A collection item from {@link model.findById}.
 */
function hasLiveRecipe(
  item: LoadedItem,
): item is LoadedItem & { recipe: NonNullable<LoadedItem['recipe']> } {
  return item.recipe !== null && item.recipe !== undefined && !item.recipe.deletedAt;
}

/**
 * Map a model.findById result (with `user` and `items` relations) to the CollectionDetailOutput
 * wire shape. Converts Date timestamps to ISO strings and projects the user to the
 * RecipeAuthorMini shape; the owner and each item recipe's author are `null` when that
 * account was deleted.
 *
 * This is the viewer-independent shape that is cached: it excludes items whose
 * recipe is missing or already soft-deleted at fill time, and keeps every other
 * item with its recipe's `visibility`/`authorId`/`forkedFromId`, so
 * {@link filterItemsForViewer} can filter per viewer on every read.
 */
function toDetailOutput(collection: CollectionWithRelations) {
  const liveItems = (collection.items ?? []).filter(hasLiveRecipe);
  return {
    id: collection.id,
    userId: collection.userId,
    name: collection.name,
    description: collection.description,
    visibility: collection.visibility,
    createdAt:
      collection.createdAt instanceof Date
        ? collection.createdAt.toISOString()
        : collection.createdAt,
    updatedAt:
      collection.updatedAt instanceof Date
        ? collection.updatedAt.toISOString()
        : collection.updatedAt,
    deletedAt:
      collection.deletedAt instanceof Date
        ? collection.deletedAt.toISOString()
        : (collection.deletedAt ?? null),
    // `null` when the owner's account was deleted (the model masks it).
    author: collection.user
      ? {
          username: collection.user.username,
          displayName: collection.user.displayName,
          avatarUrl: collection.user.avatarUrl,
        }
      : null,
    items: liveItems.map((item) => ({
      id: item.id,
      collectionId: item.collectionId,
      recipeId: item.recipeId,
      sortOrder: item.sortOrder,
      createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
      recipe: {
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
        createdAt:
          item.recipe.createdAt instanceof Date
            ? item.recipe.createdAt.toISOString()
            : item.recipe.createdAt,
        updatedAt:
          item.recipe.updatedAt instanceof Date
            ? item.recipe.updatedAt.toISOString()
            : item.recipe.updatedAt,
        deletedAt:
          item.recipe.deletedAt instanceof Date
            ? item.recipe.deletedAt.toISOString()
            : (item.recipe.deletedAt ?? null),
        author: item.recipe.author
          ? {
              id: item.recipe.author.id,
              username: item.recipe.author.username,
              displayName: item.recipe.author.displayName,
            }
          : null,
        // Projected from the latest recipe version (versions is limited to 1
        // in the model query). Null when the recipe has no versions yet.
        brewMethod: item.recipe.versions?.[0]?.brewMethod ?? null,
        drinkType: item.recipe.versions?.[0]?.drinkType ?? null,
      },
    })),
    recipeCount: liveItems.length,
  };
}

/** The viewer-independent detail shape (cached) and, after filtering, the per-viewer response. */
type CollectionDetail = ReturnType<typeof toDetailOutput>;

/** A filtered detail plus the counts that are logged (never titles or ids of hidden items). */
interface ViewerDetail {
  detail: CollectionDetail;
  /** Items dropped because the viewer may not list their recipe (or it is gone). */
  hiddenCount: number;
  /** Returned items whose `recipe.forkedFromId` was masked to `null`. */
  maskedForkCount: number;
}

/**
 * Filter a collection detail for one viewer (capability `recipe-collections`,
 * "Collection items show only recipes the viewer may list"), using fresh recipe
 * state from {@link model.getRecipeVisibilityStates}:
 * - drops every item whose recipe is missing from `states`, is soft-deleted, or
 *   fails `canListRecipe(state, viewerId)` (the canonical predicate from
 *   `recipe/service.ts`; collection ownership grants nothing);
 * - sets `item.recipe.forkedFromId` to `null` when its source is missing from
 *   `states` or fails `canListRecipe(sourceState, null)` (viewer-independent,
 *   because the cached shape is shared);
 * - refreshes each kept item's `recipe.visibility` from the state and
 *   recomputes `recipeCount` as the number of returned items.
 *
 * Pure: it never mutates `detail`, so a cached object stays viewer-independent.
 *
 * @param detail   - The viewer-independent detail (cached or freshly built).
 * @param viewerId - The requesting user's id, or `null` when anonymous.
 * @param states   - Current state of every item recipe and every fork source.
 * @returns The filtered detail and the hidden/masked counts for logging.
 */
function filterItemsForViewer(
  detail: CollectionDetail,
  viewerId: string | null,
  states: model.RecipeVisibilityState[],
): ViewerDetail {
  const stateById = new Map(states.map((state) => [state.id, state]));
  let maskedForkCount = 0;
  const items: CollectionDetail['items'] = [];
  for (const item of detail.items) {
    const state = stateById.get(item.recipeId);
    if (!state || !canListRecipe(state, viewerId)) continue;
    const sourceId = item.recipe.forkedFromId;
    let forkedFromId = sourceId;
    if (sourceId !== null) {
      const source = stateById.get(sourceId);
      if (!source || !canListRecipe(source, null)) {
        forkedFromId = null;
        maskedForkCount += 1;
      }
    }
    items.push({ ...item, recipe: { ...item.recipe, visibility: state.visibility, forkedFromId } });
  }
  return {
    detail: { ...detail, items, recipeCount: items.length },
    hiddenCount: detail.items.length - items.length,
    maskedForkCount,
  };
}

/**
 * Load fresh state for every item recipe and fork source of a detail with ONE
 * {@link model.getRecipeVisibilityStates} query, then filter the detail for the
 * viewer with {@link filterItemsForViewer}. Shared by the cache-hit and
 * cache-miss paths of {@link getCollection} and by the create/update outputs,
 * so the paths cannot diverge.
 *
 * @param detail   - The viewer-independent detail.
 * @param viewerId - The requesting user's id, or `null` when anonymous.
 */
async function filterDetailForViewer(
  detail: CollectionDetail,
  viewerId: string | null,
): Promise<ViewerDetail> {
  const recipeIds = detail.items.map((item) => item.recipeId);
  const forkSourceIds = detail.items.flatMap((item) =>
    item.recipe.forkedFromId === null ? [] : [item.recipe.forkedFromId],
  );
  const states = await model.getRecipeVisibilityStates([...recipeIds, ...forkSourceIds]);
  return filterItemsForViewer(detail, viewerId, states);
}

/** A single public-collection row as returned by {@link model.findAllPublic}. */
type PublicCollectionRow = Awaited<ReturnType<typeof model.findAllPublic>>['collections'][number];

/**
 * Map a model.findAllPublic row to the PublicCollectionListItemOutput wire
 * shape: ISO timestamps, recipeCount, and the owner `author` projection (`null`
 * when the owner's account was deleted).
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
    deletedAt: c.deletedAt instanceof Date ? c.deletedAt.toISOString() : (c.deletedAt ?? null),
    recipeCount: c.recipeCount,
    // `null` when the owner's account was deleted (the model masks it).
    author: c.user
      ? {
          username: c.user.username,
          displayName: c.user.displayName,
          avatarUrl: c.user.avatarUrl,
        }
      : null,
  };
}

/**
 * Create a collection for the authenticated user.
 * @param userId - The authenticated user's UUID.
 * @param data   - Collection creation payload (name, description, visibility).
 * @returns The created collection with author, items, and recipeCount, filtered
 *   for the owner as viewer (the same item filter as {@link getCollection}).
 */
export async function createCollection(
  userId: string,
  // Visibility is optional here: omitted values fall through to the DB column
  // default ('private'). CollectionCreate (zod output) marks it required.
  data: Partial<CollectionCreate> & Pick<CollectionCreate, 'name'>,
) {
  logger.debug({ userId }, 'createCollection started');
  const created = await model.create({ userId, ...data });
  const collection = await model.findById(created.id);
  // Fresh UUID — no detail-cache entry can exist yet; sweep lists only.
  await cacheProvider?.deleteByPrefix(COLLECTION_LIST_PREFIX);
  const output = collection
    ? (await filterDetailForViewer(toDetailOutput(collection), userId)).detail
    : null;
  logger.debug({ userId, collectionId: created.id }, 'createCollection completed');
  return output;
}

/**
 * Update a collection. Only the owner can update.
 * @param userId       - The authenticated user's UUID.
 * @param collectionId - The collection's UUID.
 * @param data         - Partial update payload.
 * @throws 'COLLECTION_NOT_FOUND' if the collection does not exist.
 * @throws 'FORBIDDEN' if the user is not the collection owner.
 * @returns The updated collection with author, items, and recipeCount, filtered
 *   for the owner as viewer (the same item filter as {@link getCollection}).
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
  const output = updated
    ? (await filterDetailForViewer(toDetailOutput(updated), userId)).detail
    : null;
  logger.debug({ userId, collectionId }, 'updateCollection completed');
  return output;
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
 * Throw `FORBIDDEN` when a `private`/`draft` collection is read by anyone but
 * its owner. Shared by the cache-miss check and the cache-hit re-check, so a
 * cache hit never widens access.
 *
 * @param collection - The collection (loaded or cached): `userId` and `visibility`.
 * @param userId     - The requesting user's id, or `null` when anonymous.
 */
function assertCanReadCollection(
  collection: { userId: string; visibility: string },
  userId: string | null,
): void {
  if (
    (collection.visibility === 'private' || collection.visibility === 'draft') &&
    collection.userId !== userId
  ) {
    throw new Error('FORBIDDEN');
  }
}

/**
 * Get a collection by ID with visibility check (cache-aside, 10 min TTL).
 *
 * The cache holds the viewer-independent shape (every item whose recipe was not
 * soft-deleted at fill time). On BOTH paths — after the collection visibility
 * check (miss) or its re-check (hit) — one `model.getRecipeVisibilityStates`
 * query supplies fresh state for every item recipe and fork source, and
 * {@link filterItemsForViewer} drops items the viewer may not list
 * (`canListRecipe`), masks unlistable fork sources and recomputes
 * `recipeCount`. A recipe made private/unlisted/draft or soft-deleted therefore
 * disappears on the next read, without waiting for the TTL. Logs only counts
 * (`hiddenCount`, `maskedForkCount`), never recipe titles.
 *
 * @param userId       - The requesting user's UUID (null if unauthenticated).
 * @param collectionId - The collection's UUID.
 * @throws 'COLLECTION_NOT_FOUND' if the collection does not exist.
 * @throws 'FORBIDDEN' if the collection is private/draft and the requester is not the owner.
 * @returns The collection with author, the viewer's listable items, and recipeCount.
 */
export async function getCollection(userId: string | null, collectionId: string) {
  logger.debug({ userId, collectionId }, 'getCollection started');
  const cached = await cacheProvider?.get<CollectionDetail>(COLLECTION_DETAIL_KEY(collectionId));
  let shape: CollectionDetail;
  if (cached) {
    // A cache hit must NEVER widen access (design.md Risk 3): replay the
    // visibility check against the cached shape, which retains userId and
    // visibility — a private collection warmed by its owner stays forbidden
    // to everyone else.
    assertCanReadCollection(cached, userId);
    shape = cached;
  } else {
    const collection = await model.findById(collectionId);
    if (!collection) throw new Error('COLLECTION_NOT_FOUND');
    assertCanReadCollection(collection, userId);
    // Cache only AFTER the not-found check, regardless of visibility (the
    // cached-hit re-check above guards private/draft entries), and cache the
    // UNFILTERED viewer-independent shape: the per-viewer filter runs below.
    shape = toDetailOutput(collection);
    await cacheProvider?.set(COLLECTION_DETAIL_KEY(collectionId), shape, {
      ttlMs: COLLECTION_DETAIL_TTL_MS,
    });
  }
  const { detail, hiddenCount, maskedForkCount } = await filterDetailForViewer(shape, userId);
  if (cached) {
    logger.debug({ userId, collectionId, hiddenCount, maskedForkCount }, 'getCollection cache hit');
  }
  logger.debug({ userId, collectionId, hiddenCount, maskedForkCount }, 'getCollection completed');
  return detail;
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
  const cached =
    await cacheProvider?.get<Awaited<ReturnType<typeof model.findPublicByUserId>>>(key);
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
    logger.error({ err: toLoggableError(err), page, perPage }, 'listAllPublicCollections failed');
    throw err;
  }
}

/**
 * Add a recipe to a collection.
 *
 * Add rule (unchanged): the owner may add their own recipes of any visibility
 * and other authors' `public` recipes only. An added `draft`, `private` or
 * `unlisted` recipe stays hidden from every other viewer of the collection
 * until its author makes it public (the read path filters with `canListRecipe`).
 *
 * @param userId       - The authenticated user's UUID.
 * @param collectionId - The collection's UUID.
 * @param recipeId     - The recipe's UUID.
 * @param sortOrder    - Optional explicit sort order (appended to end if omitted).
 * @throws 'COLLECTION_NOT_FOUND' if the collection does not exist.
 * @throws 'FORBIDDEN' if the user is not the collection owner, or the recipe is not public and
 *   not owned by the user.
 * @throws 'RECIPE_NOT_FOUND' if the recipe does not exist.
 * @throws 'ALREADY_IN_COLLECTION' if the recipe is already in the collection (a unique
 *   violation on `collection_item_collection_id_recipe_id_unique`; any other database
 *   error, including other unique violations, propagates to the global error handler).
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
    if (isUniqueViolation(err, 'collection_item_collection_id_recipe_id_unique')) {
      throw new Error('ALREADY_IN_COLLECTION');
    }
    logger.error(
      { err: toLoggableError(err), userId, collectionId, recipeId },
      'addRecipeToCollection failed',
    );
    throw err;
  }
  // Invalidate only AFTER the write succeeded — an ALREADY_IN_COLLECTION
  // failure above must not flush the cache.
  await cacheProvider?.delete(COLLECTION_DETAIL_KEY(collectionId));
  await cacheProvider?.deleteByPrefix(COLLECTION_LIST_PREFIX);
  logger.debug({ userId, collectionId, recipeId }, 'addRecipeToCollection completed');
}

/**
 * Remove a recipe from a collection. Works by `recipeId` whether or not the
 * recipe is currently visible to the owner (hidden items stay removable).
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
 * Reorder recipes in a collection. The client sends the ordered ids of the items
 * it displays: the owner's VISIBLE set, i.e. items whose recipe passes
 * `canListRecipe(recipe, ownerId)` over fresh `model.getRecipeVisibilityStates`
 * (the same filter as the owner's detail view). Items hidden from the owner
 * (another author's recipe that is or became unlisted, private or draft, or a
 * soft-deleted recipe) keep their relative order and receive the trailing
 * `sortOrder` values in the same transaction.
 *
 * @param userId       - The authenticated user's UUID.
 * @param collectionId - The collection's UUID.
 * @param itemIds      - The ordered list of the visible collection_item IDs.
 * @throws 'COLLECTION_NOT_FOUND' if the collection does not exist.
 * @throws 'FORBIDDEN' if the user is not the collection owner.
 * @throws 'REORDER_MISMATCH' if `itemIds` has duplicates or is not exactly the visible set
 *   (wrong size, a foreign id, or a hidden item's id).
 */
export async function reorderCollection(userId: string, collectionId: string, itemIds: string[]) {
  logger.debug({ userId, collectionId, itemCount: itemIds.length }, 'reorderCollection started');
  const collection = await model.findById(collectionId);
  if (!collection) throw new Error('COLLECTION_NOT_FOUND');
  if (collection.userId !== userId) throw new Error('FORBIDDEN');
  const existingItems = collection.items ?? [];
  const states = await model.getRecipeVisibilityStates(existingItems.map((i) => i.recipeId));
  const stateById = new Map(states.map((state) => [state.id, state]));
  const visibleIds = new Set<string>();
  const hiddenIds: string[] = [];
  for (const item of existingItems) {
    const state = stateById.get(item.recipeId);
    if (state && canListRecipe(state, userId)) visibleIds.add(item.id);
    else hiddenIds.push(item.id);
  }
  // Reject duplicate item IDs — a duplicated payload can corrupt ordering
  if (new Set(itemIds).size !== itemIds.length) throw new Error('REORDER_MISMATCH');
  if (itemIds.length !== visibleIds.size) throw new Error('REORDER_MISMATCH');
  for (const id of itemIds) {
    if (!visibleIds.has(id)) throw new Error('REORDER_MISMATCH');
  }
  await model.reorderItems(collectionId, itemIds, hiddenIds);
  await cacheProvider?.delete(COLLECTION_DETAIL_KEY(collectionId));
  await cacheProvider?.deleteByPrefix(COLLECTION_LIST_PREFIX);
  logger.debug(
    { userId, collectionId, hiddenCount: hiddenIds.length },
    'reorderCollection completed',
  );
}
