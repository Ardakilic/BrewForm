/**
 * Recipe data-access layer.
 *
 * Pure Drizzle ORM operations — no business logic, no authorization, no side effects.
 * Called exclusively by `recipe/service.ts`.
 *
 * Soft-delete convention: all queries filter `isNull(recipes.deletedAt)`.
 */

import { db } from '@brewform/db';
import {
  recipeAdditionalPreparations,
  recipeEquipment,
  recipes,
  recipeTasteNotes,
  recipeVersionPhotos,
  recipeVersions,
  userRecipeFavourites,
  userRecipeLikes,
  userRecipeRatings,
} from '@brewform/db/schema';
import { and, asc, avg, count, desc, eq, ilike, inArray, isNull, or, SQL, sql } from 'drizzle-orm';

/** Insert a new recipe row and return it with all database-generated fields. */
export async function create(data: typeof recipes.$inferInsert) {
  const [recipe] = await db.insert(recipes).values(data).returning();
  return recipe;
}

/**
 * Fetch a recipe by its UUID primary key, excluding soft-deleted rows.
 *
 * Loads all relations: author, versions (with taste notes, equipment, preparations,
 * photos, bean), photos, and forked-from recipe.
 */
export async function findById(id: string) {
  return db.query.recipes.findFirst({
    where: and(eq(recipes.id, id), isNull(recipes.deletedAt)),
    with: {
      author: { columns: { id: true, username: true, displayName: true, avatarUrl: true } },
      versions: {
        orderBy: desc(recipeVersions.versionNumber),
        with: {
          tasteNotes: { with: { tasteNote: true } },
          equipment: { with: { equipment: true } },
          additionalPreparations: true,
          versionPhotos: { with: { photo: true } },
          bean: { columns: { origin: true, roaster: true, roastLevel: true } },
        },
      },
      photos: true,
      forkedFrom: { columns: { id: true, slug: true, title: true } },
    },
  });
}

/**
 * Fetch a recipe by its unique slug, excluding soft-deleted rows.
 *
 * Loads the same relation tree as {@link findById}: author, versions (with taste notes,
 * equipment, preparations, photos, bean), photos, and forked-from recipe.
 */
export async function findBySlug(slug: string) {
  return db.query.recipes.findFirst({
    where: and(eq(recipes.slug, slug), isNull(recipes.deletedAt)),
    with: {
      author: { columns: { id: true, username: true, displayName: true, avatarUrl: true } },
      versions: {
        orderBy: desc(recipeVersions.versionNumber),
        with: {
          tasteNotes: { with: { tasteNote: true } },
          equipment: { with: { equipment: true } },
          additionalPreparations: true,
          versionPhotos: { with: { photo: true } },
          bean: { columns: { origin: true, roaster: true, roastLevel: true } },
        },
      },
      photos: true,
      forkedFrom: { columns: { id: true, slug: true, title: true } },
    },
  });
}

/**
 * Fetch a paginated, sorted list of recipes with optional filters.
 *
 * @param where     - Optional Drizzle SQL WHERE clause for additional filtering
 * @param page      - One-based page number
 * @param perPage   - Number of recipes per page
 * @param sortBy    - Column to sort by: `'createdAt'` (default) or `'likeCount'`
 * @param sortOrder - Sort direction: `'desc'` (default) or `'asc'`
 * @returns Paginated result with `recipes` array and `total` count
 */
export async function findMany(
  where: SQL | undefined,
  page: number,
  perPage: number,
  sortBy: string = 'createdAt',
  sortOrder: string = 'desc',
) {
  const orderByColumn = sortBy === 'likeCount' ? recipes.likeCount : recipes.createdAt;
  const orderBy = sortOrder === 'asc' ? asc(orderByColumn) : desc(orderByColumn);
  const finalWhere = where ? and(isNull(recipes.deletedAt), where) : isNull(recipes.deletedAt);

  const [data, totalResult] = await Promise.all([
    db.query.recipes.findMany({
      where: finalWhere,
      orderBy,
      limit: perPage,
      offset: (page - 1) * perPage,
      with: {
        author: { columns: { id: true, username: true, displayName: true } },
      },
    }),
    db.select({ count: count() }).from(recipes).where(finalWhere),
  ]);

  return { recipes: data, total: totalResult[0].count };
}

/** Patch a recipe row with partial data, identified by UUID. Returns the updated row or null. */
export async function update(id: string, data: Partial<typeof recipes.$inferInsert>) {
  const [result] = await db.update(recipes).set(data).where(eq(recipes.id, id)).returning();
  return result ?? null;
}

/** Soft-delete a recipe by setting its `deletedAt` timestamp. Returns the updated row or null. */
export async function softDelete(id: string) {
  const [result] = await db.update(recipes).set({ deletedAt: new Date() }).where(eq(recipes.id, id))
    .returning();
  return result ?? null;
}

/** Insert a new recipe version row and return it with all database-generated fields. */
export async function createVersion(data: typeof recipeVersions.$inferInsert) {
  const [result] = await db.insert(recipeVersions).values(data).returning();
  return result;
}

/**
 * Deep-copy a recipe for a new author inside a single database transaction.
 *
 * Creates a new recipe linked to the source via `forkedFromId`, then copies
 * the latest version including taste notes, equipment, additional preparations,
 * and version photos. Also increments the source recipe's `forkCount`.
 *
 * @param sourceId - UUID of the recipe to fork
 * @param authorId - UUID of the user creating the fork
 * @param title    - Title for the forked recipe
 * @param slug     - Pre-generated unique slug for the fork
 * @returns The new recipe row with its first version and all copied relations
 * @throws {Error} `RECIPE_NOT_FOUND` if sourceId does not exist or is soft-deleted
 * @throws {Error} `RECIPE_NO_VERSIONS` if the source recipe has no published versions
 */
export async function forkRecipe(sourceId: string, authorId: string, title: string, slug: string) {
  const source = await findById(sourceId);
  if (!source) throw new Error('RECIPE_NOT_FOUND');

  const latestVersion = source.versions?.[0];
  if (!latestVersion) throw new Error('RECIPE_NO_VERSIONS');

  return db.transaction(async (tx) => {
    const [newRecipe] = await tx.insert(recipes).values({
      slug,
      title,
      authorId,
      visibility: 'draft',
      forkedFromId: sourceId,
    }).returning();

    const [newVersion] = await tx.insert(recipeVersions).values({
      recipeId: newRecipe.id,
      versionNumber: 1,
      productName: latestVersion.productName,
      coffeeBrand: latestVersion.coffeeBrand,
      coffeeProcessing: latestVersion.coffeeProcessing,
      vendorId: latestVersion.vendorId,
      roastDate: latestVersion.roastDate,
      packageOpenDate: latestVersion.packageOpenDate,
      grindDate: latestVersion.grindDate,
      brewDate: new Date(),
      brewMethod: latestVersion.brewMethod,
      drinkType: latestVersion.drinkType,
      brewerDetails: latestVersion.brewerDetails,
      grinder: latestVersion.grinder,
      grindSize: latestVersion.grindSize,
      groundWeightGrams: latestVersion.groundWeightGrams,
      extractionTimeSeconds: latestVersion.extractionTimeSeconds,
      extractionVolumeMl: latestVersion.extractionVolumeMl,
      temperatureCelsius: latestVersion.temperatureCelsius,
      brewRatio: latestVersion.brewRatio,
      flowRate: latestVersion.flowRate,
      preInfusionTimeSeconds: latestVersion.preInfusionTimeSeconds,
      beanId: latestVersion.beanId,
      personalNotes: latestVersion.personalNotes,
      preparationNotes: latestVersion.preparationNotes,
      isFavourite: false,
    }).returning();

    const sourceTasteNotes = await tx.select().from(recipeTasteNotes)
      .where(eq(recipeTasteNotes.recipeVersionId, latestVersion.id));
    const insertedTasteNotes = sourceTasteNotes.length
      ? await tx.insert(recipeTasteNotes).values(
        sourceTasteNotes.map((tn) => ({
          recipeVersionId: newVersion.id,
          tasteNoteId: tn.tasteNoteId,
          intensity: tn.intensity,
        })),
      ).returning()
      : [];

    const sourceEquipment = await tx.select().from(recipeEquipment)
      .where(eq(recipeEquipment.recipeVersionId, latestVersion.id));
    const insertedEquipment = sourceEquipment.length
      ? await tx.insert(recipeEquipment).values(
        sourceEquipment.map((eq) => ({
          recipeVersionId: newVersion.id,
          equipmentId: eq.equipmentId,
        })),
      ).returning()
      : [];

    const sourcePreparations = await tx.select().from(recipeAdditionalPreparations)
      .where(eq(recipeAdditionalPreparations.recipeVersionId, latestVersion.id));
    const insertedPreparations = sourcePreparations.length
      ? await tx.insert(recipeAdditionalPreparations).values(
        sourcePreparations.map((p) => ({
          recipeVersionId: newVersion.id,
          name: p.name,
          type: p.type,
          inputAmount: p.inputAmount,
          preparationType: p.preparationType,
          sortOrder: p.sortOrder,
        })),
      ).returning()
      : [];

    const sourceVersionPhotos = await tx.select().from(recipeVersionPhotos)
      .where(eq(recipeVersionPhotos.recipeVersionId, latestVersion.id));
    const insertedVersionPhotos = sourceVersionPhotos.length
      ? await tx.insert(recipeVersionPhotos).values(
        sourceVersionPhotos.map((vp) => ({
          recipeVersionId: newVersion.id,
          photoId: vp.photoId,
          sortOrder: vp.sortOrder,
        })),
      ).returning()
      : [];

    await tx.update(recipes).set({ currentVersionId: newVersion.id }).where(
      eq(recipes.id, newRecipe.id),
    );
    await tx.update(recipes).set({ forkCount: sql`${recipes.forkCount} + 1` }).where(
      eq(recipes.id, sourceId),
    );

    return {
      ...newRecipe,
      versions: [{
        ...newVersion,
        tasteNotes: insertedTasteNotes.map((tn) => ({
          ...tn,
          tasteNote: latestVersion.tasteNotes?.find((ltn: any) =>
            ltn.tasteNoteId === tn.tasteNoteId
          )
            ?.tasteNote,
        })),
        equipment: insertedEquipment.map((eq) => ({
          ...eq,
          equipment: latestVersion.equipment?.find((leq: any) => leq.equipmentId === eq.equipmentId)
            ?.equipment,
        })),
        additionalPreparations: insertedPreparations,
        versionPhotos: insertedVersionPhotos,
      }],
    };
  });
}

/** Atomically increment a recipe's `likeCount` by 1. Returns the updated row or null. */
export async function incrementLikes(id: string) {
  const [result] = await db.update(recipes).set({ likeCount: sql`${recipes.likeCount} + 1` }).where(
    eq(recipes.id, id),
  ).returning();
  return result ?? null;
}

/** Atomically decrement a recipe's `likeCount` by 1. Returns the updated row or null. */
export async function decrementLikes(id: string) {
  const [result] = await db.update(recipes).set({ likeCount: sql`${recipes.likeCount} - 1` }).where(
    eq(recipes.id, id),
  ).returning();
  return result ?? null;
}

/** Atomically increment a recipe's `commentCount` by 1. Returns the updated row or null. */
export async function incrementComments(id: string) {
  const [result] = await db.update(recipes).set({ commentCount: sql`${recipes.commentCount} + 1` })
    .where(eq(recipes.id, id)).returning();
  return result ?? null;
}

/** Atomically decrement a recipe's `commentCount` by 1. Returns the updated row or null. */
export async function decrementComments(id: string) {
  const [result] = await db.update(recipes).set({ commentCount: sql`${recipes.commentCount} - 1` })
    .where(eq(recipes.id, id)).returning();
  return result ?? null;
}

/**
 * Insert or update a user's rating for a recipe.
 *
 * Uses a SELECT-then-INSERT-or-UPDATE approach (not `onConflictDoUpdate`)
 * to ensure consistent behavior across the ratings table.
 *
 * @param userId   - UUID of the user submitting the rating
 * @param recipeId - UUID of the recipe being rated
 * @param rating   - Numeric rating value
 * @returns An object containing the persisted rating value
 */
export async function upsertUserRating(userId: string, recipeId: string, rating: number) {
  const existing = await db.select({ id: userRecipeRatings.id })
    .from(userRecipeRatings)
    .where(and(eq(userRecipeRatings.userId, userId), eq(userRecipeRatings.recipeId, recipeId)))
    .limit(1);

  if (existing.length > 0) {
    await db.update(userRecipeRatings)
      .set({ rating, updatedAt: new Date() })
      .where(and(eq(userRecipeRatings.userId, userId), eq(userRecipeRatings.recipeId, recipeId)));
  } else {
    await db.insert(userRecipeRatings).values({ userId, recipeId, rating });
  }
  return { rating };
}

/**
 * Compute the average rating and total rating count for a recipe.
 *
 * @returns Object with `avgRating` (rounded to 1 decimal, or null if no ratings)
 *          and `ratingCount` (0 if no ratings exist)
 */
export async function getRecipeRatingStats(recipeId: string) {
  const [result] = await db.select({
    avgRating: avg(userRecipeRatings.rating),
    ratingCount: count(userRecipeRatings.id),
  })
    .from(userRecipeRatings)
    .where(eq(userRecipeRatings.recipeId, recipeId));
  return {
    avgRating: result?.avgRating ? Math.round(Number(result.avgRating) * 10) / 10 : null,
    ratingCount: result?.ratingCount ?? 0,
  };
}

/** Fetch a specific user's rating for a recipe, or null if they haven't rated it. */
export async function getUserRating(userId: string, recipeId: string): Promise<number | null> {
  const [result] = await db.select({ rating: userRecipeRatings.rating })
    .from(userRecipeRatings)
    .where(and(eq(userRecipeRatings.userId, userId), eq(userRecipeRatings.recipeId, recipeId)))
    .limit(1);
  return result?.rating ?? null;
}

/** Count the total number of users who have favourited a recipe. */
export async function getFavouriteCount(recipeId: string): Promise<number> {
  const [result] = await db.select({ count: count() })
    .from(userRecipeFavourites)
    .where(eq(userRecipeFavourites.recipeId, recipeId));
  return result?.count ?? 0;
}

/**
 * Fetch the current user's like and favourite status for a recipe.
 *
 * @returns Object with `userLiked` (boolean) and `userFavourited` (boolean) flags
 */
export async function getUserLikeStatus(userId: string, recipeId: string) {
  const [[like], [fav]] = await Promise.all([
    db.select({ id: userRecipeLikes.userId })
      .from(userRecipeLikes)
      .where(and(eq(userRecipeLikes.userId, userId), eq(userRecipeLikes.recipeId, recipeId)))
      .limit(1),
    db.select({ id: userRecipeFavourites.userId })
      .from(userRecipeFavourites)
      .where(
        and(eq(userRecipeFavourites.userId, userId), eq(userRecipeFavourites.recipeId, recipeId)),
      )
      .limit(1),
  ]);
  return { userLiked: !!like, userFavourited: !!fav };
}

/**
 * Toggle a user's like on a recipe inside a single database transaction.
 *
 * Attempts an INSERT with `onConflictDoNothing`. If a row already exists,
 * deletes it instead. Atomically increments or decrements the recipe's
 * `likeCount` to match.
 *
 * @returns `{ liked: true }` if the like was added, `{ liked: false }` if removed
 */
export async function toggleLike(userId: string, recipeId: string) {
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(userRecipeLikes)
      .values({ userId, recipeId })
      .onConflictDoNothing({ target: [userRecipeLikes.userId, userRecipeLikes.recipeId] })
      .returning();

    if (inserted.length > 0) {
      await tx.update(recipes).set({ likeCount: sql`${recipes.likeCount} + 1` }).where(
        eq(recipes.id, recipeId),
      );
      return { liked: true };
    }

    const deleted = await tx.delete(userRecipeLikes).where(
      and(eq(userRecipeLikes.userId, userId), eq(userRecipeLikes.recipeId, recipeId)),
    ).returning();

    if (deleted.length > 0) {
      await tx.update(recipes).set({ likeCount: sql`${recipes.likeCount} - 1` }).where(
        eq(recipes.id, recipeId),
      );
    }
    return { liked: false };
  });
}

/**
 * Toggle a user's favourite bookmark on a recipe.
 *
 * Attempts an INSERT with `onConflictDoNothing`. If a row already exists,
 * deletes it instead.
 *
 * @returns `{ favourited: true }` if the favourite was added, `{ favourited: false }` if removed
 */
export async function toggleFavourite(userId: string, recipeId: string) {
  const inserted = await db.insert(userRecipeFavourites)
    .values({ userId, recipeId })
    .onConflictDoNothing({ target: [userRecipeFavourites.userId, userRecipeFavourites.recipeId] })
    .returning();

  if (inserted.length === 0) {
    await db.delete(userRecipeFavourites).where(
      and(eq(userRecipeFavourites.userId, userId), eq(userRecipeFavourites.recipeId, recipeId)),
    );
    return { favourited: false };
  }

  return { favourited: true };
}

/**
 * Toggle a recipe's `featured` flag via an atomic NOT expression.
 *
 * Authorization is enforced at the service layer; this model assumes
 * the caller has already verified admin privileges.
 *
 * @throws {Error} `RECIPE_NOT_FOUND` if the recipe does not exist
 * @returns `{ featured: boolean }` — the new featured state
 */
export async function toggleFeature(id: string) {
  const [recipe] = await db.update(recipes)
    .set({ featured: sql`not ${recipes.featured}` })
    .where(eq(recipes.id, id))
    .returning();

  if (!recipe) throw new Error('RECIPE_NOT_FOUND');

  return { featured: recipe.featured };
}

/** Fetch all versions for a recipe (summary fields only), ordered newest-first. */
export async function getVersionsByRecipeId(recipeId: string) {
  return db
    .select({
      id: recipeVersions.id,
      versionNumber: recipeVersions.versionNumber,
      brewDate: recipeVersions.brewDate,
      brewMethod: recipeVersions.brewMethod,
      groundWeightGrams: recipeVersions.groundWeightGrams,
      extractionVolumeMl: recipeVersions.extractionVolumeMl,
      extractionTimeSeconds: recipeVersions.extractionTimeSeconds,
      temperatureCelsius: recipeVersions.temperatureCelsius,
      brewRatio: recipeVersions.brewRatio,
    })
    .from(recipeVersions)
    .where(eq(recipeVersions.recipeId, recipeId))
    .orderBy(desc(recipeVersions.versionNumber));
}

/** Update the `personalNotes` field on a specific recipe version. */
export async function updateVersionNotes(versionId: string, notes: string) {
  await db.update(recipeVersions)
    .set({ personalNotes: notes })
    .where(eq(recipeVersions.id, versionId));
}

/** Fetch a paginated feed of public recipes from a set of followed author IDs. */
export async function getFeed(authorIds: string[], page: number, perPage: number) {
  const where = and(
    inArray(recipes.authorId, authorIds),
    eq(recipes.visibility, 'public'),
  );
  return findMany(where, page, perPage, 'createdAt', 'desc');
}

/**
 * Fetch a paginated, filtered list of recipes the given user has favourited.
 *
 * Supports filtering by brew method, drink type, text search (title + product name),
 * main brewer, equipment, and taste notes. All filters are combined with AND.
 *
 * @param userId  - UUID of the user whose favourites to query
 * @param filters - Optional filter criteria (brewMethod, drinkType, search, equipmentId,
 *                  tasteNoteIds, mainBrewer, sortBy, sortOrder)
 * @param page    - One-based page number
 * @param perPage - Number of recipes per page
 * @returns Paginated result with `recipes` array and `total` count
 */
export async function findStarred(
  userId: string,
  filters: {
    brewMethod?: string;
    drinkType?: string;
    search?: string;
    equipmentId?: string;
    tasteNoteIds?: string;
    mainBrewer?: string;
    coffeeVarietyId?: string;
    sortBy?: string;
    sortOrder?: string;
  },
  page: number,
  perPage: number,
) {
  const conditions: any[] = [
    eq(recipes.visibility, 'public'),
  ];

  if (filters.brewMethod) {
    conditions.push(
      inArray(
        recipes.id,
        db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
          eq(recipeVersions.brewMethod, filters.brewMethod as any),
        ),
      ),
    );
  }

  if (filters.drinkType) {
    conditions.push(
      inArray(
        recipes.id,
        db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
          eq(recipeVersions.drinkType, filters.drinkType as any),
        ),
      ),
    );
  }

  if (filters.search) {
    const sanitized = filters.search.replace(/[%_]/g, '');
    if (sanitized) {
      const searchTerm = `%${sanitized}%`;
      conditions.push(
        or(
          ilike(recipes.title, searchTerm),
          inArray(
            recipes.id,
            db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
              ilike(recipeVersions.productName, searchTerm),
            ),
          ),
        ),
      );
    }
  }

  if (filters.mainBrewer) {
    const sanitized = filters.mainBrewer.replace(/[%_]/g, '');
    if (sanitized) {
      const searchTerm = `%${sanitized}%`;
      conditions.push(
        inArray(
          recipes.id,
          db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
            ilike(recipeVersions.brewerDetails, searchTerm),
          ),
        ),
      );
    }
  }

  if (filters.coffeeVarietyId) {
    conditions.push(
      inArray(
        recipes.id,
        db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
          eq(recipeVersions.coffeeVarietyId, filters.coffeeVarietyId),
        ),
      ),
    );
  }

  if (filters.equipmentId) {
    conditions.push(
      inArray(
        recipes.currentVersionId,
        db.select({ id: recipeEquipment.recipeVersionId }).from(recipeEquipment).where(
          eq(recipeEquipment.equipmentId, filters.equipmentId),
        ),
      ),
    );
  }

  if (filters.tasteNoteIds) {
    const ids = filters.tasteNoteIds.split(',').map((id: string) => id.trim());
    for (const noteId of ids) {
      conditions.push(
        inArray(
          recipes.currentVersionId,
          db.select({ id: recipeTasteNotes.recipeVersionId }).from(recipeTasteNotes).where(
            eq(recipeTasteNotes.tasteNoteId, noteId),
          ),
        ),
      );
    }
  }

  const where = conditions.length > 1 ? and(...conditions) : conditions[0];

  const starredSubquery = db.select({ recipeId: userRecipeFavourites.recipeId })
    .from(userRecipeFavourites)
    .where(eq(userRecipeFavourites.userId, userId));

  const finalWhere = and(
    where,
    inArray(recipes.id, starredSubquery),
    isNull(recipes.deletedAt),
  );

  const sortBy = filters.sortBy || 'createdAt';
  const sortOrder = filters.sortOrder || 'desc';
  const orderByColumn = sortBy === 'likeCount' ? recipes.likeCount : recipes.createdAt;
  const orderBy = sortOrder === 'asc' ? asc(orderByColumn) : desc(orderByColumn);

  const [data, totalResult] = await Promise.all([
    db.query.recipes.findMany({
      where: finalWhere,
      orderBy,
      limit: perPage,
      offset: (page - 1) * perPage,
      with: {
        author: { columns: { id: true, username: true, displayName: true } },
      },
    }),
    db.select({ count: count() }).from(recipes).where(finalWhere),
  ]);

  return { recipes: data, total: totalResult[0].count };
}
