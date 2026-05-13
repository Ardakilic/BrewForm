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

export async function create(data: typeof recipes.$inferInsert) {
  const [recipe] = await db.insert(recipes).values(data).returning();
  return recipe;
}

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
    db.select().from(recipes).where(finalWhere).orderBy(orderBy).limit(perPage).offset(
      (page - 1) * perPage,
    ),
    db.select({ count: count() }).from(recipes).where(finalWhere),
  ]);

  return { recipes: data, total: totalResult[0].count };
}

export async function update(id: string, data: Partial<typeof recipes.$inferInsert>) {
  const [result] = await db.update(recipes).set(data).where(eq(recipes.id, id)).returning();
  return result ?? null;
}

export async function softDelete(id: string) {
  const [result] = await db.update(recipes).set({ deletedAt: new Date() }).where(eq(recipes.id, id))
    .returning();
  return result ?? null;
}

export async function createVersion(data: typeof recipeVersions.$inferInsert) {
  const [result] = await db.insert(recipeVersions).values(data).returning();
  return result;
}

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

export async function incrementLikes(id: string) {
  const [result] = await db.update(recipes).set({ likeCount: sql`${recipes.likeCount} + 1` }).where(
    eq(recipes.id, id),
  ).returning();
  return result ?? null;
}

export async function decrementLikes(id: string) {
  const [result] = await db.update(recipes).set({ likeCount: sql`${recipes.likeCount} - 1` }).where(
    eq(recipes.id, id),
  ).returning();
  return result ?? null;
}

export async function incrementComments(id: string) {
  const [result] = await db.update(recipes).set({ commentCount: sql`${recipes.commentCount} + 1` })
    .where(eq(recipes.id, id)).returning();
  return result ?? null;
}

export async function decrementComments(id: string) {
  const [result] = await db.update(recipes).set({ commentCount: sql`${recipes.commentCount} - 1` })
    .where(eq(recipes.id, id)).returning();
  return result ?? null;
}

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

export async function getUserRating(userId: string, recipeId: string): Promise<number | null> {
  const [result] = await db.select({ rating: userRecipeRatings.rating })
    .from(userRecipeRatings)
    .where(and(eq(userRecipeRatings.userId, userId), eq(userRecipeRatings.recipeId, recipeId)))
    .limit(1);
  return result?.rating ?? null;
}

export async function getFavouriteCount(recipeId: string): Promise<number> {
  const [result] = await db.select({ count: count() })
    .from(userRecipeFavourites)
    .where(eq(userRecipeFavourites.recipeId, recipeId));
  return result?.count ?? 0;
}

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

export async function toggleFeature(id: string) {
  const [recipe] = await db.update(recipes)
    .set({ featured: sql`not ${recipes.featured}` })
    .where(eq(recipes.id, id))
    .returning();

  if (!recipe) throw new Error('RECIPE_NOT_FOUND');

  return { featured: recipe.featured };
}

export async function updateVersionNotes(versionId: string, notes: string) {
  await db.update(recipeVersions)
    .set({ personalNotes: notes, updatedAt: new Date() })
    .where(eq(recipeVersions.id, versionId));
}

export async function getFeed(authorIds: string[], page: number, perPage: number) {
  const where = and(
    inArray(recipes.authorId, authorIds),
    eq(recipes.visibility, 'public'),
  );
  return findMany(where, page, perPage, 'createdAt', 'desc');
}

export async function findStarred(
  userId: string,
  filters: {
    brewMethod?: string;
    drinkType?: string;
    search?: string;
    equipmentId?: string;
    tasteNoteIds?: string;
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
          eq(recipeVersions.brewMethod, filters.brewMethod),
        ),
      ),
    );
  }

  if (filters.drinkType) {
    conditions.push(
      inArray(
        recipes.id,
        db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
          eq(recipeVersions.drinkType, filters.drinkType),
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
    db.select().from(recipes).where(finalWhere).orderBy(orderBy).limit(perPage).offset(
      (page - 1) * perPage,
    ),
    db.select({ count: count() }).from(recipes).where(finalWhere),
  ]);

  return { recipes: data, total: totalResult[0].count };
}
