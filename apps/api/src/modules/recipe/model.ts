import { db } from '@brewform/db';
import {
  recipes,
  recipeVersions,
  userRecipeFavourites,
  userRecipeLikes,
} from '@brewform/db/schema';
import { and, asc, count, desc, eq, inArray, isNull, SQL, sql } from 'drizzle-orm';

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
      personalNotes: latestVersion.personalNotes,
      isFavourite: false,
    }).returning();

    await tx.update(recipes).set({ currentVersionId: newVersion.id }).where(
      eq(recipes.id, newRecipe.id),
    );
    await tx.update(recipes).set({ forkCount: sql`${recipes.forkCount} + 1` }).where(
      eq(recipes.id, sourceId),
    );

    return { ...newRecipe, versions: [newVersion] };
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

export async function toggleLike(userId: string, recipeId: string) {
  const existing = await db.select().from(userRecipeLikes)
    .where(and(eq(userRecipeLikes.userId, userId), eq(userRecipeLikes.recipeId, recipeId)))
    .limit(1);

  if (existing.length > 0) {
    await db.delete(userRecipeLikes).where(eq(userRecipeLikes.id, existing[0].id));
    await decrementLikes(recipeId);
    return { liked: false };
  }

  await db.insert(userRecipeLikes).values({ userId, recipeId });
  await incrementLikes(recipeId);
  return { liked: true };
}

export async function toggleFavourite(userId: string, recipeId: string) {
  const existing = await db.select().from(userRecipeFavourites)
    .where(
      and(eq(userRecipeFavourites.userId, userId), eq(userRecipeFavourites.recipeId, recipeId)),
    )
    .limit(1);

  if (existing.length > 0) {
    await db.delete(userRecipeFavourites).where(eq(userRecipeFavourites.id, existing[0].id));
    return { favourited: false };
  }

  await db.insert(userRecipeFavourites).values({ userId, recipeId });
  return { favourited: true };
}

export async function toggleFeature(id: string) {
  const recipe = await db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
  if (!recipe[0]) throw new Error('RECIPE_NOT_FOUND');
  const newFeatured = !recipe[0].featured;
  await db.update(recipes).set({ featured: newFeatured }).where(eq(recipes.id, id));
  return { featured: newFeatured };
}

export async function getFeed(authorIds: string[], page: number, perPage: number) {
  const where = and(
    inArray(recipes.authorId, authorIds),
    eq(recipes.visibility, 'public'),
  );
  return findMany(where, page, perPage, 'createdAt', 'desc');
}
