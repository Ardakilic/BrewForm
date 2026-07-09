import { db } from '@brewform/db';
import { collectionItems, collections, recipeVersions } from '@brewform/db/schema';
import { and, asc, count, desc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import type { Visibility } from '@brewform/shared/types';

/**
 * Fetch a single collection by UUID, excluding soft-deleted rows.
 * Loads the owner user and all items with their nested recipes (ordered by sortOrder).
 */
export async function findById(id: string) {
  return db.query.collections.findFirst({
    where: and(eq(collections.id, id), isNull(collections.deletedAt)),
    with: {
      user: { columns: { id: true, username: true, displayName: true, avatarUrl: true } },
      items: {
        orderBy: asc(collectionItems.sortOrder),
        with: {
          recipe: {
            with: {
              author: { columns: { id: true, username: true, displayName: true } },
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
}

/**
 * Fetch a paginated list of a user's collections (all visibilities), with recipeCount.
 * Returns `{ collections, total }` where each collection has a computed `recipeCount`.
 */
export async function findByUserId(
  userId: string,
  page: number,
  perPage: number,
  visibility?: Visibility,
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

  // Compute recipeCount per collection via a batch query
  const collectionIds = data.map((c) => c.id);
  const countRows = collectionIds.length
    ? await db
      .select({ collectionId: collectionItems.collectionId, count: count() })
      .from(collectionItems)
      .where(inArray(collectionItems.collectionId, collectionIds))
      .groupBy(collectionItems.collectionId)
    : [];
  const countMap = new Map(countRows.map((r) => [r.collectionId, r.count]));

  const collectionsWithCount = data.map((c) => ({
    ...c,
    recipeCount: countMap.get(c.id) ?? 0,
  }));

  return { collections: collectionsWithCount, total: totalResult[0].count };
}

/**
 * Fetch a paginated list of a user's public collections only, with recipeCount.
 */
export async function findPublicByUserId(
  userId: string,
  page: number,
  perPage: number,
): Promise<{ collections: Record<string, unknown>[]; total: number }> {
  return findByUserId(userId, page, perPage, 'public');
}

/**
 * Fetch all public collections across all users, paginated, with a per-collection
 * recipeCount and the owner's mini author projection. Excludes soft-deleted rows.
 * Used by the global "browse public collections" endpoint.
 *
 * @param page    - 1-based page number.
 * @param perPage - Page size.
 * @returns `{ collections: Record<string, unknown>[]; total: number }` where each
 *          collection row includes `recipeCount` and a nested `user` relation
 *          (id, username, displayName, avatarUrl) for the owner.
 */
export async function findAllPublic(
  page: number,
  perPage: number,
): Promise<{ collections: Record<string, unknown>[]; total: number }> {
  const where = and(eq(collections.visibility, 'public'), isNull(collections.deletedAt));

  const [data, totalResult] = await Promise.all([
    db.query.collections.findMany({
      where,
      orderBy: desc(collections.createdAt),
      limit: perPage,
      offset: (page - 1) * perPage,
      with: {
        user: { columns: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    }),
    db.select({ count: count() }).from(collections).where(where),
  ]);

  // Compute recipeCount per collection via a batch query
  const collectionIds = data.map((c) => c.id);
  const countRows = collectionIds.length
    ? await db
      .select({ collectionId: collectionItems.collectionId, count: count() })
      .from(collectionItems)
      .where(inArray(collectionItems.collectionId, collectionIds))
      .groupBy(collectionItems.collectionId)
    : [];
  const countMap = new Map(countRows.map((r) => [r.collectionId, r.count]));

  const collectionsWithCount = data.map((c) => ({
    ...c,
    recipeCount: countMap.get(c.id) ?? 0,
  }));

  return { collections: collectionsWithCount, total: totalResult[0].count };
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
export async function addItem(collectionId: string, recipeId: string, sortOrder?: number) {
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
        .select({ maxOrder: sql<number>`max(${collectionItems.sortOrder})` })
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

/** Reorder all items in a collection by assigning sortOrder = index in a transaction. */
export async function reorderItems(collectionId: string, itemIds: string[]) {
  await db.transaction(async (tx) => {
    for (let i = 0; i < itemIds.length; i++) {
      await tx
        .update(collectionItems)
        .set({ sortOrder: i })
        .where(
          and(
            eq(collectionItems.collectionId, collectionId),
            eq(collectionItems.id, itemIds[i]),
          ),
        );
    }
  });
}

/**
 * Fetch all collection_items for a collection, with nested recipe, ordered by sortOrder.
 * Soft-deleted recipes are filtered out after the join.
 */
export async function getItems(collectionId: string) {
  const items = await db.query.collectionItems.findMany({
    where: and(eq(collectionItems.collectionId, collectionId)),
    orderBy: asc(collectionItems.sortOrder),
    with: {
      recipe: {
        with: {
          author: { columns: { id: true, username: true, displayName: true } },
          // Load the latest recipe version (highest versionNumber) so
          // callers can read brewMethod/drinkType for the current version.
          versions: {
            orderBy: desc(recipeVersions.versionNumber),
            limit: 1,
            columns: { brewMethod: true, drinkType: true },
          },
        },
      },
    },
  });
  return items.filter((item) => item.recipe && !item.recipe.deletedAt);
}

/** Fetch public collections that contain a given recipe (for RecipeDetailPage). */
export async function getCollectionsForRecipe(recipeId: string) {
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
        eq(collections.visibility, 'public'),
        isNull(collections.deletedAt),
      ),
    );
  return rows;
}
