// deno-lint-ignore-file no-explicit-any require-await
import { prisma } from '@brewform/db';

export async function listBadges() {
  return prisma.badge.findMany({ orderBy: { threshold: 'asc' } });
}

export async function getUserBadges(userId: string) {
  return prisma.userBadge.findMany({
    where: { userId },
    include: { badge: true },
    orderBy: { awardedAt: 'desc' },
  } as any);
}

export async function evaluateBadges(userId: string) {
  const userRecipes = await prisma.recipe.count({ where: { authorId: userId, deletedAt: null } });
  const userComments = await prisma.comment.count({ where: { authorId: userId, deletedAt: null } });
  const userForks = await prisma.recipe.count({ where: { authorId: userId, forkedFromId: { not: null }, deletedAt: null } as any });
  const userFollowers = await prisma.userFollow.count({ where: { followingId: userId } });
  const userRecipesWithLikes = await prisma.recipe.findMany({ where: { authorId: userId } });
  const maxLikes = Math.max(...userRecipesWithLikes.map((r: any) => r.likeCount), 0);
  
  const distinctMethods = await prisma.recipeVersion.findMany({
    where: { recipe: { authorId: userId, deletedAt: null } },
    select: { brewMethod: true },
    distinct: ['brewMethod'],
  } as any);

  const userVersions = await prisma.recipeVersion.findMany({
    where: { recipe: { authorId: userId, deletedAt: null } },
    select: {
      groundWeightGrams: true,
      extractionTimeSeconds: true,
      extractionVolumeMl: true,
      temperatureCelsius: true,
      brewRatio: true,
      flowRate: true,
    },
  } as any);

  const precisionBrewerMet = userVersions.length >= 1 && userVersions.every((v: any) =>
    v.groundWeightGrams !== null &&
    v.extractionTimeSeconds !== null &&
    v.extractionVolumeMl !== null &&
    v.temperatureCelsius !== null &&
    v.brewRatio !== null &&
    v.flowRate !== null
  );

  const checks: Array<{ rule: string; met: boolean }> = [
    { rule: 'first_brew', met: userRecipes >= 1 },
    { rule: 'decade_brewer', met: userRecipes >= 10 },
    { rule: 'centurion', met: userRecipes >= 100 },
    { rule: 'first_fork', met: userForks >= 1 },
    { rule: 'fan_favourite', met: maxLikes >= 10 },
    { rule: 'community_star', met: maxLikes >= 50 },
    { rule: 'conversationalist', met: userComments >= 10 },
    { rule: 'precision_brewer', met: precisionBrewerMet },
    { rule: 'explorer', met: distinctMethods.length >= 5 },
    { rule: 'influencer', met: userFollowers >= 25 },
  ];

  for (const check of checks) {
    if (check.met) {
      const badge = await prisma.badge.findUnique({ where: { rule: check.rule as any } });
      if (badge) {
        await prisma.userBadge.upsert({
          where: { userId_badgeId: { userId, badgeId: badge.id } },
          create: { userId, badgeId: badge.id },
          update: {},
        } as any);
      }
    }
  }
}