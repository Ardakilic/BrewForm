// deno-lint-ignore-file no-explicit-any require-await
import { prisma } from '@brewform/db';

export async function searchRecipes(filters: any, page: number, perPage: number, sortBy: string = 'createdAt', sortOrder: string = 'desc') {
  const where: any = { deletedAt: null };

  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q } },
      { versions: { some: { productName: { contains: filters.q } } } },
      { versions: { some: { coffeeBrand: { contains: filters.q } } } },
    ];
  }
  if (filters.brewMethod) {
    where.versions = { some: { brewMethod: filters.brewMethod } };
  }
  if (filters.drinkType) {
    if (where.versions && where.versions.some) {
      where.versions.some.brewMethod = filters.brewMethod;
      where.versions.some.drinkType = filters.drinkType;
    } else {
      where.versions = { some: { brewMethod: filters.brewMethod, drinkType: filters.drinkType } };
    }
  }
  if (filters.authorId) {
    where.authorId = filters.authorId;
  }
  if (filters.visibility) {
    where.visibility = filters.visibility;
  } else {
    where.visibility = 'public';
  }
  if (filters.grinder) {
    where.versions = { some: { ...(where.versions?.some || {}), grinder: { contains: filters.grinder } } };
  }

  const [recipes, total] = await Promise.all([
    prisma.recipe.findMany({
      where,
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { [sortBy]: sortOrder },
      include: {
        author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        versions: { take: 1, orderBy: { versionNumber: 'desc' } },
        photos: { take: 1 },
      },
    } as any),
    prisma.recipe.count({ where }),
  ]);
  return { recipes, total };
}