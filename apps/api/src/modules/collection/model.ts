import { db } from '@brewform/db';
import { collectionItems, collections, recipes, recipeVersions } from '@brewform/db/schema';
import type { Visibility } from '@brewform/shared/types';
import { and, asc, count, desc, eq, inArray, isNull, max, or, type SQL } from 'drizzle-orm';
import { visibleIdentity } from '../../utils/public-identity/index.ts';
import { listableRecipeCondition } from '../recipe/model.ts';

/**
 * Whose eyes a collection list's `recipeCount` is computed for (capability
 * `recipe-collections`, "Collection recipe counts reflect only visible items"):
 * `owner` counts the owner's own non-public recipes too
 * (`listableRecipeCondition(ownerId)`), `anonymous` counts non-deleted public
 * recipes only (`listableRecipeCondition(null)`).
 */
export type CountAudience = 'owner' | 'anonymous';

/**
 * Batched `recipeCount` per collection, counting only items whose recipe the
 * audience may list: one `count()` query that inner-joins `recipes` and filters
 * by the shared `listableRecipeCondition` (never an inline visibility
 * comparison, never raw `collection_item` rows).
 *
 * @param collectionIds - Collections to count; returns an empty map without querying when empty.
 * @param viewerId      - The audience: the owner's id for the owner's own list, `null` for public lists.
 * @returns Map of collection id to visible item count (missing ids have no visible items).
 */
async function countListableItems(
  collectionIds: string[],
  viewerId: string | null,
): Promise<Map<string, number>> {
  if (collectionIds.length === 0) return new Map();
  const rows = await db
    .select({ collectionId: collectionItems.collectionId, count: count() })
    .from(collectionItems)
    .innerJoin(recipes, eq(collectionItems.recipeId, recipes.id))
    .where(
      and(inArray(collectionItems.collectionId, collectionIds), listableRecipeCondition(viewerId)),
    )
    .groupBy(collectionItems.collectionId);
  return new Map(rows.map((r) => [r.collectionId, r.count]));
}

/**
 * Fetch a single collection by UUID, excluding soft-deleted rows.
 * Loads the owner user and all items with their nested recipes (ordered by sortOrder).
 *
 * Items are NOT visibility-filtered here: the relation query returns every
 * item, including recipes that are soft-deleted or hidden from some viewers.
 * The service drops deleted recipes when it builds the viewer-independent
 * cached shape and filters per viewer with fresh state from
 * {@link getRecipeVisibilityStates} (capability `recipe-collections`).
 *
 * The owner `user` and each item recipe's `author` are `null` when that account was
 * deleted ({@link visibleIdentity}); the collection and its items stay.
 *
 * @param id - The collection id
 * @returns The collection with `user` and `items`, or `undefined` when missing or soft-deleted
 */
export async function findById(id: string) {
  const row = await db.query.collections.findFirst({
    where: and(eq(collections.id, id), isNull(collections.deletedAt)),
    with: {
      user: {
        columns: { id: true, username: true, displayName: true, avatarUrl: true, deletedAt: true },
      },
      items: {
        orderBy: asc(collectionItems.sortOrder),
        with: {
          recipe: {
            with: {
              author: { columns: { id: true, username: true, displayName: true, deletedAt: true } },
              // Load the latest recipe version (highest versionNumber) to
              // project brewMethod/drinkType on the collection detail output.
              versions: {
                orderBy: desc(recipeVersions.versionNumber),
                limit: 1,
                columns: { brewMethod: true, drinkType: true },
              },
            },
          },
        },
      },
    },
  });
  return (
    row && {
      ...row,
      user: visibleIdentity(row.user),
      items: row.items.map((item) => ({
        ...item,
        recipe: item.recipe && { ...item.recipe, author: visibleIdentity(item.recipe.author) },
      })),
    }
  );
}

/**
 * Fetch a paginated list of a user's collections (all visibilities), with recipeCount.
 * Returns `{ collections, total }` where each collection has a computed `recipeCount`.
 *
 * `recipeCount` counts only items whose recipe the audience may list
 * ({@link countListableItems}): by default the owner (`listableRecipeCondition(userId)`:
 * not deleted, and public or authored by the owner); `countAs: 'anonymous'`
 * counts non-deleted public recipes only (used by {@link findPublicByUserId}).
 *
 * When `recipeId` is provided, each row also carries `containsRecipe` flagging
 * whether the collection already contains that recipe (used by the web
 * AddToCollectionModal checkmarks); otherwise `containsRecipe` is `false`.
 * Membership is raw (any item row), because the owner is looking at a recipe
 * they can open.
 *
 * @param userId     - The collection owner's UUID.
 * @param page       - 1-based page number.
 * @param perPage    - Page size.
 * @param visibility - Optional collection visibility filter.
 * @param recipeId   - Optional recipe context for the `containsRecipe` flag.
 * @param countAs    - Audience for `recipeCount` (default `owner`).
 */
export async function findByUserId(
  userId: string,
  page: number,
  perPage: number,
  visibility?: Visibility,
  recipeId?: string,
  countAs: CountAudience = 'owner',
): Promise<{ collections: Record<string, unknown>[]; total: number }> {
  const where: SQL | undefined = visibility
    ? and(
        eq(collections.userId, userId),
        isNull(collections.deletedAt),
        eq(collections.visibility, visibility),
      )
    : and(eq(collections.userId, userId), isNull(collections.deletedAt));

  const [data, totalResult] = await Promise.all([
    db.query.collections.findMany({
      where,
      orderBy: desc(collections.createdAt),
      limit: perPage,
      offset: (page - 1) * perPage,
    }),
    db.select({ count: count() }).from(collections).where(where),
  ]);

  // Compute recipeCount per collection via one batched, audience-filtered query.
  const collectionIds = data.map((c) => c.id);
  const countMap = await countListableItems(collectionIds, countAs === 'owner' ? userId : null);

  // When a recipe context is given, batch-query which of these collections
  // already contain that recipe so callers can flag membership per row.
  const membershipRows =
    recipeId && collectionIds.length
      ? await db
          .select({ collectionId: collectionItems.collectionId })
          .from(collectionItems)
          .where(
            and(
              eq(collectionItems.recipeId, recipeId),
              inArray(collectionItems.collectionId, collectionIds),
            ),
          )
      : [];
  const membershipSet = new Set(membershipRows.map((r) => r.collectionId));

  const collectionsWithCount = data.map((c) => ({
    ...c,
    recipeCount: countMap.get(c.id) ?? 0,
    containsRecipe: recipeId ? membershipSet.has(c.id) : false,
  }));

  return { collections: collectionsWithCount, total: totalResult[0].count };
}

/**
 * Fetch a paginated list of a user's public collections only, with recipeCount
 * counted for an anonymous viewer (non-deleted public recipes only), because
 * this list is shown to visitors other than the owner.
 */
export function findPublicByUserId(
  userId: string,
  page: number,
  perPage: number,
): Promise<{ collections: Record<string, unknown>[]; total: number }> {
  return findByUserId(userId, page, perPage, 'public', undefined, 'anonymous');
}

/**
 * A public-collection list row as returned by {@link findAllPublic}: the base
 * collection columns plus a computed `recipeCount` and the owner's mini author
 * relation (`user`, `null` when the owner's account was deleted). Exported so the
 * service layer consumes model rows already typed, instead of widening to
 * `Record<string, unknown>` and re-asserting.
 */
export type PublicCollectionRow = typeof collections.$inferSelect & {
  recipeCount: number;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
};

/**
 * Fetch all public collections across all users, paginated, with a per-collection
 * recipeCount and the owner's mini author projection. Excludes soft-deleted rows.
 * Used by the global "browse public collections" endpoint. `recipeCount` is
 * counted for an anonymous viewer (`listableRecipeCondition(null)`).
 *
 * @param page    - 1-based page number.
 * @param perPage - Page size.
 * @returns `{ collections: PublicCollectionRow[]; total: number }` where each
 *          collection row includes `recipeCount` and a nested `user` relation
 *          (id, username, displayName, avatarUrl) for the owner, `null` when the
 *          owner's account was deleted ({@link visibleIdentity}).
 */
export async function findAllPublic(
  page: number,
  perPage: number,
): Promise<{ collections: PublicCollectionRow[]; total: number }> {
  const where = and(eq(collections.visibility, 'public'), isNull(collections.deletedAt));

  const [data, totalResult] = await Promise.all([
    db.query.collections.findMany({
      where,
      orderBy: desc(collections.createdAt),
      limit: perPage,
      offset: (page - 1) * perPage,
      with: {
        user: {
          columns: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            deletedAt: true,
          },
        },
      },
    }),
    db.select({ count: count() }).from(collections).where(where),
  ]);

  // Compute recipeCount per collection via one batched query, as anonymous.
  const countMap = await countListableItems(
    data.map((c) => c.id),
    null,
  );

  const collectionsWithCount = data.map((c) => ({
    ...c,
    user: visibleIdentity(c.user),
    recipeCount: countMap.get(c.id) ?? 0,
  }));

  return { collections: collectionsWithCount, total: totalResult[0].count };
}

/** Current visibility/author/deletion state of one recipe (see {@link getRecipeVisibilityStates}). */
export interface RecipeVisibilityState {
  id: string;
  visibility: Visibility;
  authorId: string;
  deletedAt: Date | null;
}

/**
 * Fetch the current visibility, author and deletion state of the given recipes
 * in one primary-key `inArray` query (4 columns). The collection service calls
 * it on every detail read (cache hit and miss) to filter items and mask fork
 * sources with fresh state, and on reorder to find the owner-listable set.
 *
 * Deliberately does NOT filter `deletedAt`, so callers can detect deletions; it
 * is an exempt unit in the `recipe-visibility` enforcement test.
 *
 * @param recipeIds - Recipe ids to look up (duplicates allowed); `[]` returns `[]` without querying.
 * @returns One state row per existing recipe id (unknown ids are absent).
 */
export async function getRecipeVisibilityStates(
  recipeIds: string[],
): Promise<RecipeVisibilityState[]> {
  if (recipeIds.length === 0) return [];
  return await db
    .select({
      id: recipes.id,
      visibility: recipes.visibility,
      authorId: recipes.authorId,
      deletedAt: recipes.deletedAt,
    })
    .from(recipes)
    .where(inArray(recipes.id, [...new Set(recipeIds)]));
}

/** Insert a new collection row and return it. */
export async function create(data: typeof collections.$inferInsert) {
  const [row] = await db.insert(collections).values(data).returning();
  return row;
}

/** Patch a collection row with partial data. Returns the updated row or null. */
export async function update(id: string, data: Partial<typeof collections.$inferInsert>) {
  const [row] = await db
    .update(collections)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(collections.id, id), isNull(collections.deletedAt)))
    .returning();
  return row ?? null;
}

/** Soft-delete a collection by setting deletedAt. Returns the updated row or null. */
export async function softDelete(id: string) {
  const [row] = await db
    .update(collections)
    .set({ deletedAt: new Date() })
    .where(and(eq(collections.id, id), isNull(collections.deletedAt)))
    .returning();
  return row ?? null;
}

/**
 * Add a recipe to a collection with a sortOrder.
 * If sortOrder is not provided, appends to the end (max existing + 1, or 0 if empty).
 * Throws on unique-constraint violation (caught by the service layer).
 */
export function addItem(collectionId: string, recipeId: string, sortOrder?: number) {
  return db.transaction(async (tx) => {
    // Lock the parent collection row so concurrent appends serialize and
    // can't compute the same next sortOrder under READ COMMITTED.
    await tx
      .select({ id: collections.id })
      .from(collections)
      .where(eq(collections.id, collectionId))
      .for('update');

    let order = sortOrder;
    if (order === undefined) {
      const [existing] = await tx
        .select({ maxOrder: max(collectionItems.sortOrder) })
        .from(collectionItems)
        .where(eq(collectionItems.collectionId, collectionId));
      order = (existing?.maxOrder ?? -1) + 1;
    }
    const [row] = await tx
      .insert(collectionItems)
      .values({ collectionId, recipeId, sortOrder: order })
      .returning();
    return row;
  });
}

/** Hard-delete a collection_item row. Returns the deleted row or undefined. */
export async function removeItem(collectionId: string, recipeId: string) {
  const [row] = await db
    .delete(collectionItems)
    .where(
      and(eq(collectionItems.collectionId, collectionId), eq(collectionItems.recipeId, recipeId)),
    )
    .returning();
  return row;
}

/**
 * Reorder the items of a collection in one transaction: each id in `itemIds`
 * gets `sortOrder = index`, then each id in `trailingIds` gets the following
 * values (`itemIds.length + index`). The service passes the owner-visible items
 * as `itemIds` and the items hidden from the owner (in their current order) as
 * `trailingIds`, so hidden items keep their relative order after the visible ones.
 *
 * @param collectionId - The collection's UUID (every update is scoped to it).
 * @param itemIds      - Ordered collection_item ids that come first.
 * @param trailingIds  - Ordered collection_item ids placed after them (default none).
 */
export async function reorderItems(
  collectionId: string,
  itemIds: string[],
  trailingIds: string[] = [],
) {
  const ordered = [...itemIds, ...trailingIds];
  await db.transaction(async (tx) => {
    for (let i = 0; i < ordered.length; i++) {
      await tx
        .update(collectionItems)
        .set({ sortOrder: i })
        .where(
          and(eq(collectionItems.collectionId, collectionId), eq(collectionItems.id, ordered[i])),
        );
    }
  });
}

/**
 * Fetch collections that contain a given recipe, visibility-filtered for the
 * viewer (for RecipeDetailPage, US-9/D99.5): public collections for anyone,
 * plus the viewer's OWN collections of any visibility. Others' non-public
 * collections are never returned — listing them would leak their existence.
 * Soft-deleted collections are always excluded.
 *
 * @param recipeId - The recipe's UUID.
 * @param viewerId - The requesting user's UUID, or null when unauthenticated.
 */
export async function getCollectionsForRecipe(recipeId: string, viewerId: string | null) {
  // Built conditionally — no sql`false` fragment for the anonymous case.
  const visibilityPredicate = viewerId
    ? or(eq(collections.visibility, 'public'), eq(collections.userId, viewerId))
    : eq(collections.visibility, 'public');
  const rows = await db
    .select({
      id: collections.id,
      userId: collections.userId,
      name: collections.name,
      description: collections.description,
      visibility: collections.visibility,
      createdAt: collections.createdAt,
      updatedAt: collections.updatedAt,
      deletedAt: collections.deletedAt,
    })
    .from(collectionItems)
    .innerJoin(collections, eq(collectionItems.collectionId, collections.id))
    .where(
      and(
        eq(collectionItems.recipeId, recipeId),
        visibilityPredicate,
        isNull(collections.deletedAt),
      ),
    );
  return rows;
}
