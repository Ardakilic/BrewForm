// deno-lint-ignore-file no-explicit-any require-await

import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { badges, recipes, recipeVersions, userBadges, users } from '@brewform/db/schema';
import * as model from './model.ts';

/**
 * Helper: insert a user + recipe + recipe version with the circular-FK dance
 * (recipe -> version -> link currentVersionId). Returns the IDs.
 */
async function insertRecipeFixture(
  userId: string,
): Promise<{ recipeId: string; versionId: string }> {
  const recipeId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  await db.insert(recipes).values({
    id: recipeId,
    slug: `test-recipe-${recipeId}`,
    title: `Test Recipe ${recipeId.slice(0, 8)}`,
    authorId: userId,
    visibility: 'public',
  });
  const [version] = await db.insert(recipeVersions).values({
    id: versionId,
    recipeId,
    versionNumber: 1,
    brewMethod: 'v60',
    drinkType: 'pour_over',
    preparationNotes: '',
  }).returning();
  await db.update(recipes).set({ currentVersionId: version.id }).where(eq(recipes.id, recipeId));
  return { recipeId, versionId };
}

/**
 * listBadges — List all available badge definitions ordered by threshold
 * ascending. The CI/seed DB always has badge rows, so this asserts the call
 * returns a non-empty array.
 */
describe('listBadges', { sanitizeOps: false, sanitizeResources: false }, () => {
  it('should return badges ordered by threshold ascending', async () => {
    const result = await model.listBadges();
    expect(result.length).toBeGreaterThan(0);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].threshold).toBeGreaterThanOrEqual(result[i - 1].threshold);
    }
  });
});

/**
 * getUserBadges — Get all badges awarded to a user, with the badge definition
 * joined. Returns one row per user_badge entry, ordered by awardedAt desc.
 *
 * The seed DB already inserts all 10 badge definitions by their unique `rule`,
 * so this test looks up the existing `first_brew` seed badge by rule and uses
 * its ID for the user_badge award row. A badge definition is only inserted if
 * the seed lookup misses (defensive fallback).
 */
describe('getUserBadges', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let badgeId: string;
  let userBadgeId: string;
  let insertedBadge: boolean;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    userBadgeId = crypto.randomUUID();
    insertedBadge = false;
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    // Look up the seed 'first_brew' badge by its unique rule. The seed inserts
    // all 10 badge definitions, so this should always find a row.
    const [existing] = await db.select().from(badges).where(eq(badges.rule, 'first_brew')).limit(1);
    if (existing) {
      badgeId = existing.id;
    } else {
      // Defensive fallback — insert a fresh badge if the seed is missing.
      badgeId = crypto.randomUUID();
      insertedBadge = true;
      await db.insert(badges).values({
        id: badgeId,
        name: 'Test Badge',
        icon: 'test',
        description: 'A test badge',
        rule: 'first_brew',
        threshold: 1,
      });
    }
    await db.insert(userBadges).values({
      id: userBadgeId,
      userId,
      badgeId,
    });
  });

  afterEach(async () => {
    await db.delete(userBadges).where(eq(userBadges.id, userBadgeId));
    if (insertedBadge) {
      await db.delete(badges).where(eq(badges.id, badgeId));
    }
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return awarded badges with the badge definition joined', async () => {
    const result = await model.getUserBadges(userId);
    expect(result.length).toBe(1);
    expect(result[0].userId).toBe(userId);
    expect(result[0].badgeId).toBe(badgeId);
    expect(result[0].badge).toBeDefined();
    expect(result[0].badge!.id).toBe(badgeId);
    expect(result[0].badge!.rule).toBe('first_brew');
    expect(result[0].badge!.threshold).toBe(1);
  });

  it('should return an empty array for a user with no badges', async () => {
    const freshUserId = crypto.randomUUID();
    await db.insert(users).values({
      id: freshUserId,
      email: `fresh-${freshUserId}@example.com`,
      username: `freshuser-${freshUserId}`,
      passwordHash: 'hash',
    });
    try {
      const result = await model.getUserBadges(freshUserId);
      expect(result).toEqual([]);
    } finally {
      await db.delete(users).where(eq(users.id, freshUserId));
    }
  });
});

/**
 * evaluateBadges — Evaluate all badge criteria for a user and award any newly
 * met badges via onConflictDoNothing. The basic case: a user with at least one
 * recipe earns the 'first_brew' badge (seed badge rule), while a user with zero
 * recipes earns no badges.
 */
describe('evaluateBadges', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    // Clean up awarded badges for this user.
    await db.delete(userBadges).where(eq(userBadges.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should award the first_brew badge when the user has at least one recipe', async () => {
    const { recipeId, versionId } = await insertRecipeFixture(userId);
    try {
      await model.evaluateBadges(userId);
      // The seed DB has a first_brew badge; evaluateBadges should have upserted
      // a user_badge row for it.
      const awarded = await db.select().from(userBadges).where(eq(userBadges.userId, userId));
      expect(awarded.length).toBeGreaterThan(0);
      // Verify the first_brew badge is among the awarded ones by joining.
      const userBadgeRows = await model.getUserBadges(userId);
      const rules = userBadgeRows.map((r) => r.badge?.rule).filter((r) => r !== undefined);
      expect(rules).toContain('first_brew');
    } finally {
      await db.delete(recipeVersions).where(eq(recipeVersions.id, versionId));
      await db.delete(recipes).where(eq(recipes.id, recipeId));
    }
  });

  it('should award no badges for a user with zero recipes', async () => {
    await model.evaluateBadges(userId);
    const awarded = await db.select().from(userBadges).where(eq(userBadges.userId, userId));
    // A user with zero recipes, comments, forks, followers, and likes cannot
    // meet any badge threshold (first_brew requires >=1 recipe, etc.).
    expect(awarded).toEqual([]);
  });

  it('should be idempotent — running twice does not create duplicate awards', async () => {
    const { recipeId, versionId } = await insertRecipeFixture(userId);
    try {
      await model.evaluateBadges(userId);
      const afterFirst = await db.select().from(userBadges).where(eq(userBadges.userId, userId));
      const firstCount = afterFirst.length;
      expect(firstCount).toBeGreaterThan(0);

      await model.evaluateBadges(userId);
      const afterSecond = await db.select().from(userBadges).where(eq(userBadges.userId, userId));
      expect(afterSecond.length).toBe(firstCount);
    } finally {
      await db.delete(recipeVersions).where(eq(recipeVersions.id, versionId));
      await db.delete(recipes).where(eq(recipes.id, recipeId));
    }
  });
});
