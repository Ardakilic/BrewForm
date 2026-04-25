// deno-lint-ignore-file no-explicit-any require-await
import { prisma } from '@brewform/db';

export async function create(data: any) {
  return prisma.recipe.create({
    data,
    include: { versions: true },
  } as any);
}

export async function findById(id: string) {
  return prisma.recipe.findUnique({
    where: { id, deletedAt: null },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      versions: {
        orderBy: { versionNumber: 'desc' },
        include: {
          tasteNotes: { include: { tasteNote: true } },
          equipment: { include: { equipment: true } },
          additionalPreparations: true,
          versionPhotos: { include: { photo: true } },
        },
      },
      photos: true,
      forkedFrom: { select: { id: true, slug: true, title: true } },
    },
  } as any);
}

export async function findBySlug(slug: string) {
  return prisma.recipe.findUnique({
    where: { slug, deletedAt: null },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      versions: {
        orderBy: { versionNumber: 'desc' },
        include: {
          tasteNotes: { include: { tasteNote: true } },
          equipment: { include: { equipment: true } },
          additionalPreparations: true,
          versionPhotos: { include: { photo: true } },
        },
      },
      photos: true,
      forkedFrom: { select: { id: true, slug: true, title: true } },
    },
  } as any);
}

export async function findMany(where: any, page: number, perPage: number, sortBy: string = 'createdAt', sortOrder: string = 'desc') {
  const [recipes, total] = await Promise.all([
    prisma.recipe.findMany({
      where: { ...where, deletedAt: null },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { [sortBy]: sortOrder },
      include: {
        author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        versions: { take: 1, orderBy: { versionNumber: 'desc' } },
        photos: { take: 1 },
      },
    } as any),
    prisma.recipe.count({ where: { ...where, deletedAt: null } }),
  ]);
  return { recipes, total };
}

export async function update(id: string, data: any) {
  return prisma.recipe.update({ where: { id }, data } as any);
}

export async function softDelete(id: string) {
  return prisma.recipe.update({
    where: { id },
    data: { deletedAt: new Date() },
  } as any);
}

export async function createVersion(data: any) {
  return prisma.recipeVersion.create({ data } as any);
}

// deno-lint-ignore no-explicit-any
export async function forkRecipe(sourceId: string, authorId: string, title: string, slug: string) {
  const source: any = await findById(sourceId);
  if (!source) throw new Error('RECIPE_NOT_FOUND');

  const latestVersion = source.versions?.[0];
  if (!latestVersion) throw new Error('RECIPE_NO_VERSIONS');

  const newRecipe: any = await prisma.recipe.create({
    data: {
      slug,
      title,
      authorId,
      visibility: 'draft',
      forkedFromId: sourceId,
      versions: {
        create: {
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
        },
      },
    },
    include: { versions: true },
  } as any);

  await prisma.recipe.update({
    where: { id: newRecipe.id },
    data: { currentVersionId: newRecipe.versions[0].id },
  } as any);
  await prisma.recipe.update({
    where: { id: sourceId },
    data: { forkCount: { increment: 1 } },
  } as any);

  return newRecipe;
}

export async function incrementLikes(id: string) {
  return prisma.recipe.update({ where: { id }, data: { likeCount: { increment: 1 } } } as any);
}

export async function decrementLikes(id: string) {
  return prisma.recipe.update({ where: { id }, data: { likeCount: { decrement: 1 } } } as any);
}

export async function incrementComments(id: string) {
  return prisma.recipe.update({ where: { id }, data: { commentCount: { increment: 1 } } } as any);
}

export async function decrementComments(id: string) {
  return prisma.recipe.update({ where: { id }, data: { commentCount: { decrement: 1 } } } as any);
}

export async function toggleLike(userId: string, recipeId: string) {
  const existing = await prisma.userRecipeLike.findUnique({
    where: { userId_recipeId: { userId, recipeId } },
  } as any);
  if (existing) {
    await prisma.userRecipeLike.delete({ where: { id: existing.id } } as any);
    await decrementLikes(recipeId);
    return { liked: false };
  }
  await prisma.userRecipeLike.create({ data: { userId, recipeId } } as any);
  await incrementLikes(recipeId);
  return { liked: true };
}

export async function toggleFavourite(userId: string, recipeId: string) {
  const existing = await prisma.userRecipeFavourite.findUnique({
    where: { userId_recipeId: { userId, recipeId } },
  } as any);
  if (existing) {
    await prisma.userRecipeFavourite.delete({ where: { id: existing.id } } as any);
    return { favourited: false };
  }
  await prisma.userRecipeFavourite.create({ data: { userId, recipeId } } as any);
  return { favourited: true };
}

export async function toggleFeature(id: string) {
  const recipe = await prisma.recipe.findUnique({ where: { id } } as any);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  await prisma.recipe.update({
    where: { id },
    data: { featured: !recipe.featured },
  } as any);
  return { featured: !recipe.featured };
}

export async function getFeed(authorIds: string[], page: number, perPage: number) {
  return findMany({
    authorId: { in: authorIds },
    visibility: 'public',
  }, page, perPage, 'createdAt', 'desc');
}