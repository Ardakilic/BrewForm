/**
 * Badge database operations and evaluation logic for BrewForm.
 *
 * Lists available badge definitions, retrieves awarded badges for a user, and
 * evaluates badge criteria (recipe count, likes, comments, forks, followers,
 * brewing methods, precision metrics) awarding them via upsert.
 */
import { db } from '@brewform/db';
import {
  badges,
  comments,
  recipes,
  recipeVersions,
  userBadges,
  userFollows,
} from '@brewform/db/schema';
import { and, asc, count, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { BadgeRule } from '@brewform/shared/types';

/** List all available badge definitions ordered by threshold ascending. */
export async function listBadges() {
  return db.select().from(badges).orderBy(asc(badges.threshold));
}

/** Get all badges awarded to a user, with badge definition joined. */
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

/**
 * Evaluate all badge criteria for a user and award any newly met badges.
 *
 * Checks: first_brew, decade_brewer, centurion, first_fork, fan_favourite,
 * community_star, conversationalist, precision_brewer, explorer, influencer.
 * Uses onConflictDoNothing to avoid duplicate awards.
 */
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
        isNotNull(recipes.forkedFromId),
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
    .where(
      and(
        eq(recipes.authorId, userId),
        isNull(recipes.deletedAt),
        isNotNull(recipeVersions.brewMethod),
      ),
    );
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

  const checks: Array<{ rule: BadgeRule; met: boolean }> = [
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
      const badgeResult = await db.select().from(badges).where(eq(badges.rule, check.rule))
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
