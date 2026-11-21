import '../../test-setup.ts';
import { db } from '@brewform/db';
import { badges, recipes, recipeVersions, userBadges, users } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  const [version] = await db
    .insert(recipeVersions)
    .values({
      id: versionId,
      recipeId,
      versionNumber: 1,
      brewMethod: 'v60',
      drinkType: 'pour_over',
      preparationNotes: '',
    })
    .returning();
  await db.update(recipes).set({ currentVersionId: version.id }).where(eq(recipes.id, recipeId));
  return { recipeId, versionId };
}

/**
 * listBadges — List all available badge definitions ordered by threshold
 * ascending. The CI/seed DB always has badge rows, so this asserts the call
 * returns a non-empty array.
 */
describe('listBadges', () => {
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
describe('getUserBadges', () => {
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
describe('evaluateBadges', () => {
  let userId: string;
  let badgeId: string;
  let insertedBadge: boolean;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    insertedBadge = false;
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    // evaluateBadges silently no-ops when the badge definition row is missing,
    // so mirror the getUserBadges test's defensive fallback: look up the seed
    // 'first_brew' badge by rule and insert a fresh row only if the seed is
    // absent. This keeps the award assertions stable even on a seedless DB.
    const [existing] = await db.select().from(badges).where(eq(badges.rule, 'first_brew')).limit(1);
    if (existing) {
      badgeId = existing.id;
    } else {
      badgeId = crypto.randomUUID();
      insertedBadge = true;
      await db.insert(badges).values({
        id: badgeId,
        name: 'First Brew',
        icon: 'coffee',
        description: 'Logged your first recipe',
        rule: 'first_brew',
        threshold: 1,
      });
    }
  });

  afterEach(async () => {
    // Clean up awarded badges for this user.
    await db.delete(userBadges).where(eq(userBadges.userId, userId));
    if (insertedBadge) {
      await db.delete(badges).where(eq(badges.id, badgeId));
    }
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should award the first_brew badge when the user has at least one recipe', async () => {
    const { recipeId, versionId } = await insertRecipeFixture(userId);
    try {
      await model.evaluateBadges(userId);
      // The first_brew badge definition is ensured in beforeEach (seed or
      // fallback insert), so evaluateBadges should have inserted a user_badge
      // row for it via onConflictDoNothing.
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

/** All six metrics the `precision_brewer` rule requires on every version. */
const PRECISION_METRICS = {
  groundWeightGrams: 18,
  extractionTimeSeconds: 28,
  extractionVolumeMl: 36,
  temperatureCelsius: 93,
  brewRatio: 2,
  flowRate: 1.3,
};

/**
 * evaluateBadges — `precision_brewer` is met when the user has at least one recipe version and
 * every version records all six precision metrics (ground weight, extraction time and volume,
 * temperature, brew ratio, flow rate). Replaces the deleted inline-copy `badge/service.test.ts`.
 */
describe('evaluateBadges — precision_brewer', () => {
  let userId: string;
  let badgeId: string;
  let insertedBadge: boolean;
  let fixture: { recipeId: string; versionId: string };

  beforeEach(async () => {
    userId = crypto.randomUUID();
    insertedBadge = false;
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    // Same defensive fallback as the first_brew block: reuse the seeded definition, else add one.
    const [existing] = await db
      .select()
      .from(badges)
      .where(eq(badges.rule, 'precision_brewer'))
      .limit(1);
    if (existing) {
      badgeId = existing.id;
    } else {
      badgeId = crypto.randomUUID();
      insertedBadge = true;
      await db.insert(badges).values({
        id: badgeId,
        name: 'Precision Brewer',
        icon: 'dart',
        description: 'Filled every precision metric',
        rule: 'precision_brewer',
        threshold: 10,
      });
    }
    fixture = await insertRecipeFixture(userId);
  });

  afterEach(async () => {
    await db.delete(userBadges).where(eq(userBadges.userId, userId));
    await db.delete(recipeVersions).where(eq(recipeVersions.id, fixture.versionId));
    await db.delete(recipes).where(eq(recipes.id, fixture.recipeId));
    if (insertedBadge) {
      await db.delete(badges).where(eq(badges.id, badgeId));
    }
    await db.delete(users).where(eq(users.id, userId));
  });

  /**
   * Lists the rules of the badges the test user holds.
   *
   * @returns The awarded badge rules.
   */
  async function awardedRules(): Promise<string[]> {
    const rows = await model.getUserBadges(userId);
    return rows.map((r) => r.badge?.rule).filter((r): r is NonNullable<typeof r> => r != null);
  }

  it('awards precision_brewer when every version records all six metrics', async () => {
    await db
      .update(recipeVersions)
      .set(PRECISION_METRICS)
      .where(eq(recipeVersions.id, fixture.versionId));

    await model.evaluateBadges(userId);

    expect(await awardedRules()).toContain('precision_brewer');
  });

  it('does not award precision_brewer while a version lacks one metric', async () => {
    await db
      .update(recipeVersions)
      .set({ ...PRECISION_METRICS, flowRate: null })
      .where(eq(recipeVersions.id, fixture.versionId));

    await model.evaluateBadges(userId);
    expect(await awardedRules()).not.toContain('precision_brewer');

    // The missing metric was the only blocker: recording it earns the badge.
    await db
      .update(recipeVersions)
      .set({ flowRate: PRECISION_METRICS.flowRate })
      .where(eq(recipeVersions.id, fixture.versionId));
    await model.evaluateBadges(userId);
    expect(await awardedRules()).toContain('precision_brewer');
  });
});
