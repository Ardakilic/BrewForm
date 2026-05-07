import { db } from '@brewform/db';
import {
  badges,
  comments,
  recipes,
  recipeVersions,
  userBadges,
  userFollows,
} from '@brewform/db/schema';
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';

export async function listBadges() {
  return db.select().from(badges).orderBy(asc(badges.threshold));
}

export async function getUserBadges(userId: string) {
  return db.select({
    id: userBadges.id,
    userId: userBadges.userId,
    badgeId: userBadges.badgeId,
    awardedAt: userBadges.awardedAt,
    badge: {
      id: badges.id,
      name: badges.name,
      icon: badges.icon,
      description: badges.description,
      rule: badges.rule,
      threshold: badges.threshold,
    },
  })
    .from(userBadges)
    .leftJoin(badges, eq(userBadges.badgeId, badges.id))
    .where(eq(userBadges.userId, userId))
    .orderBy(desc(userBadges.awardedAt));
}

export async function evaluateBadges(userId: string) {
  const userRecipesResult = await db.select({ count: count() }).from(recipes)
    .where(and(eq(recipes.authorId, userId), isNull(recipes.deletedAt)));
  const userRecipes = userRecipesResult[0].count;

  const userCommentsResult = await db.select({ count: count() }).from(comments)
    .where(and(eq(comments.authorId, userId), isNull(comments.deletedAt)));
  const userComments = userCommentsResult[0].count;

  const userForksResult = await db.select({ count: count() }).from(recipes)
    .where(
      and(
        eq(recipes.authorId, userId),
        isNull(recipes.deletedAt),
        sql`${recipes.forkedFromId} is not null`,
      ),
    );
  const userForks = userForksResult[0].count;

  const userFollowersResult = await db.select({ count: count() }).from(userFollows)
    .where(eq(userFollows.followingId, userId));
  const userFollowers = userFollowersResult[0].count;

  const maxLikesResult = await db.select({
    maxLikes: sql<number>`coalesce(max(${recipes.likeCount}), 0)`,
  }).from(recipes)
    .where(and(eq(recipes.authorId, userId), isNull(recipes.deletedAt)));
  const maxLikes = maxLikesResult[0].maxLikes;

  const distinctMethodsResult = await db.selectDistinct({ brewMethod: recipeVersions.brewMethod })
    .from(recipeVersions)
    .innerJoin(recipes, eq(recipeVersions.recipeId, recipes.id))
    .where(and(eq(recipes.authorId, userId), isNull(recipes.deletedAt)));
  const distinctMethods = distinctMethodsResult;

  const userVersions = await db.select({
    groundWeightGrams: recipeVersions.groundWeightGrams,
    extractionTimeSeconds: recipeVersions.extractionTimeSeconds,
    extractionVolumeMl: recipeVersions.extractionVolumeMl,
    temperatureCelsius: recipeVersions.temperatureCelsius,
    brewRatio: recipeVersions.brewRatio,
    flowRate: recipeVersions.flowRate,
  })
    .from(recipeVersions)
    .innerJoin(recipes, eq(recipeVersions.recipeId, recipes.id))
    .where(and(eq(recipes.authorId, userId), isNull(recipes.deletedAt)));

  const precisionBrewerMet = userVersions.length >= 1 &&
    userVersions.every((v) =>
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
      const badgeResult = await db.select().from(badges).where(eq(badges.rule, check.rule as any))
        .limit(1);
      if (badgeResult.length > 0) {
        const badge = badgeResult[0];
        await db.insert(userBadges)
          .values({ userId, badgeId: badge.id })
          .onConflictDoNothing({ target: [userBadges.userId, userBadges.badgeId] });
      }
    }
  }
}
