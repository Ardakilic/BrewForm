/**
 * DB integration tests for the brew-log service layer.
 *
 * Verifies recipe visibility checks, version matching, ownership rules, and
 * delegation shapes by exercising the service functions against real DB rows.
 */

import '../../test-setup.ts';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { db } from '@brewform/db';
import { brewLogs, recipes, recipeVersions, users } from '@brewform/db/schema';
import { eq, inArray } from 'drizzle-orm';
import * as service from './service.ts';
import * as model from './model.ts';

async function createUser(prefix: string) {
  const id = crypto.randomUUID();
  const [user] = await db.insert(users).values({
    id,
    email: `${prefix}-${id}@example.com`,
    username: `${prefix}-${id.slice(0, 8)}`,
    passwordHash: 'hash',
  }).returning();
  return user;
}

async function createRecipe(
  authorId: string,
  visibility: 'private' | 'public' | 'draft' | 'unlisted' = 'public',
) {
  const id = crypto.randomUUID();
  const [recipe] = await db.insert(recipes).values({
    id,
    slug: `slug-${id.slice(0, 8)}`,
    title: `Recipe ${id.slice(0, 4)}`,
    authorId,
    visibility,
    createdAt: new Date(),
  }).returning();
  return recipe;
}

async function createVersion(recipeId: string) {
  const id = crypto.randomUUID();
  const [version] = await db.insert(recipeVersions).values({
    id,
    recipeId,
    versionNumber: 1,
    brewMethod: 'v60',
    drinkType: 'espresso',
    preparationNotes: 'test version',
  }).returning();
  return version;
}

async function cleanupBrewLogs(userIds: string[], recipeIds: string[]) {
  if (userIds.length) await db.delete(brewLogs).where(inArray(brewLogs.userId, userIds));
  if (recipeIds.length) await db.delete(brewLogs).where(inArray(brewLogs.recipeId, recipeIds));
}

async function cleanupRecipes(recipeIds: string[]) {
  if (recipeIds.length === 0) return;
  await db.delete(recipes).where(inArray(recipes.id, recipeIds));
}

async function cleanupUsers(userIds: string[]) {
  if (userIds.length === 0) return;
  await db.delete(users).where(inArray(users.id, userIds));
}

describe(
  { name: 'brew-log service — createBrewLog', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    let other: typeof users.$inferSelect;
    let publicRecipe: typeof recipes.$inferSelect;
    let ownPrivate: typeof recipes.$inferSelect;
    let otherPrivate: typeof recipes.$inferSelect;
    let deletedRecipe: typeof recipes.$inferSelect;
    const recipeIds: string[] = [];

    beforeAll(async () => {
      user = await createUser('bl-svc-create');
      other = await createUser('bl-svc-create-other');
      publicRecipe = await createRecipe(other.id, 'public');
      ownPrivate = await createRecipe(user.id, 'private');
      otherPrivate = await createRecipe(other.id, 'private');
      deletedRecipe = await createRecipe(other.id, 'public');
      recipeIds.push(publicRecipe.id, ownPrivate.id, otherPrivate.id, deletedRecipe.id);
      await db.update(recipes).set({ deletedAt: new Date() }).where(
        eq(recipes.id, deletedRecipe.id),
      );
    });

    afterAll(async () => {
      await cleanupBrewLogs([user.id, other.id], recipeIds);
      await cleanupRecipes(recipeIds);
      await cleanupUsers([user.id, other.id]);
    });

    it("creates a log on another user's public recipe with brewedAt defaulting to now", async () => {
      const before = Date.now();
      const created = await service.createBrewLog(user.id, {
        recipeId: publicRecipe.id,
        yieldActual: 40,
        doseActual: 20,
        notes: 'public brew',
        personalRating: 7,
      });
      expect(created.id).toBeDefined();
      expect(created.userId).toBe(user.id);
      expect(created.recipeId).toBe(publicRecipe.id);
      expect(created.notes).toBe('public brew');
      expect(created.brewedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(created.brewedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('creates a log on the user’s own private recipe', async () => {
      const created = await service.createBrewLog(user.id, { recipeId: ownPrivate.id });
      expect(created.recipeId).toBe(ownPrivate.id);
    });

    it('honours an explicit brewedAt', async () => {
      const brewedAt = '2026-01-02T03:04:05.000Z';
      const created = await service.createBrewLog(user.id, {
        recipeId: publicRecipe.id,
        brewedAt,
      });
      expect(created.brewedAt.toISOString()).toBe(brewedAt);
    });

    it('throws RECIPE_NOT_FOUND for a missing recipe and inserts nothing', async () => {
      const missingId = crypto.randomUUID();
      await expect(
        service.createBrewLog(user.id, { recipeId: missingId }),
      ).rejects.toThrow('RECIPE_NOT_FOUND');
      const rows = await db.select({ id: brewLogs.id }).from(brewLogs).where(
        eq(brewLogs.recipeId, missingId),
      );
      expect(rows.length).toBe(0);
    });

    it('throws RECIPE_NOT_FOUND for a soft-deleted recipe', async () => {
      await expect(
        service.createBrewLog(user.id, { recipeId: deletedRecipe.id }),
      ).rejects.toThrow('RECIPE_NOT_FOUND');
    });

    it("throws RECIPE_NOT_FOUND for another user's private recipe and inserts nothing", async () => {
      await expect(
        service.createBrewLog(user.id, { recipeId: otherPrivate.id }),
      ).rejects.toThrow('RECIPE_NOT_FOUND');
      const rows = await db.select({ id: brewLogs.id }).from(brewLogs).where(
        eq(brewLogs.recipeId, otherPrivate.id),
      );
      expect(rows.length).toBe(0);
    });

    it('throws RECIPE_VERSION_MISMATCH for a version of a different recipe', async () => {
      const foreignVersion = await createVersion(ownPrivate.id);
      try {
        await expect(
          service.createBrewLog(user.id, {
            recipeId: publicRecipe.id,
            recipeVersionId: foreignVersion.id,
          }),
        ).rejects.toThrow('RECIPE_VERSION_MISMATCH');
      } finally {
        await db.delete(recipeVersions).where(eq(recipeVersions.id, foreignVersion.id));
      }
    });

    it('accepts a version belonging to the recipe', async () => {
      const version = await createVersion(publicRecipe.id);
      try {
        const created = await service.createBrewLog(user.id, {
          recipeId: publicRecipe.id,
          recipeVersionId: version.id,
        });
        expect(created.recipeVersionId).toBe(version.id);
      } finally {
        await db.delete(brewLogs).where(eq(brewLogs.recipeVersionId, version.id));
        await db.delete(recipeVersions).where(eq(recipeVersions.id, version.id));
      }
    });
  },
);

describe(
  { name: 'brew-log service — getBrewLog', sanitizeResources: false, sanitizeOps: false },
  () => {
    let owner: typeof users.$inferSelect;
    let stranger: typeof users.$inferSelect;
    let recipe: typeof recipes.$inferSelect;
    let log: typeof brewLogs.$inferSelect;

    beforeEach(async () => {
      owner = await createUser('bl-svc-get-owner');
      stranger = await createUser('bl-svc-get-stranger');
      recipe = await createRecipe(owner.id);
      log = await service.createBrewLog(owner.id, { recipeId: recipe.id, notes: 'mine' });
    });

    afterEach(async () => {
      await cleanupBrewLogs([owner.id, stranger.id], [recipe.id]);
      await cleanupRecipes([recipe.id]);
      await cleanupUsers([owner.id, stranger.id]);
    });

    it('returns the log to its owner', async () => {
      const found = await service.getBrewLog(owner.id, log.id);
      expect(found.id).toBe(log.id);
      expect(found.notes).toBe('mine');
    });

    it('cross-user read throws BREW_LOG_NOT_FOUND', async () => {
      await expect(service.getBrewLog(stranger.id, log.id)).rejects.toThrow('BREW_LOG_NOT_FOUND');
    });

    it('missing log throws BREW_LOG_NOT_FOUND', async () => {
      await expect(service.getBrewLog(owner.id, crypto.randomUUID())).rejects.toThrow(
        'BREW_LOG_NOT_FOUND',
      );
    });
  },
);

describe(
  { name: 'brew-log service — updateBrewLog', sanitizeResources: false, sanitizeOps: false },
  () => {
    let owner: typeof users.$inferSelect;
    let stranger: typeof users.$inferSelect;
    let recipe: typeof recipes.$inferSelect;
    let log: typeof brewLogs.$inferSelect;

    beforeEach(async () => {
      owner = await createUser('bl-svc-update-owner');
      stranger = await createUser('bl-svc-update-stranger');
      recipe = await createRecipe(owner.id);
      log = await service.createBrewLog(owner.id, {
        recipeId: recipe.id,
        notes: 'original',
        personalRating: 5,
      });
    });

    afterEach(async () => {
      await cleanupBrewLogs([owner.id, stranger.id], [recipe.id]);
      await cleanupRecipes([recipe.id]);
      await cleanupUsers([owner.id, stranger.id]);
    });

    it('cross-user update throws BREW_LOG_NOT_FOUND and leaves the row unchanged', async () => {
      await expect(
        service.updateBrewLog(stranger.id, log.id, { notes: 'hacked' }),
      ).rejects.toThrow('BREW_LOG_NOT_FOUND');
      const unchanged = await model.findById(log.id);
      expect(unchanged!.notes).toBe('original');
      expect(unchanged!.personalRating).toBe(5);
    });

    it('missing log throws BREW_LOG_NOT_FOUND', async () => {
      await expect(
        service.updateBrewLog(owner.id, crypto.randomUUID(), { notes: 'nope' }),
      ).rejects.toThrow('BREW_LOG_NOT_FOUND');
    });

    it('owner update round-trips fields and clears a field with null', async () => {
      const updated = await service.updateBrewLog(owner.id, log.id, {
        notes: null,
        personalRating: 9,
        brewedAt: '2026-02-03T04:05:06.000Z',
      });
      expect(updated).not.toBeNull();
      expect(updated!.notes).toBeNull();
      expect(updated!.personalRating).toBe(9);
      expect(updated!.brewedAt.toISOString()).toBe('2026-02-03T04:05:06.000Z');
    });
  },
);

describe(
  { name: 'brew-log service — deleteBrewLog', sanitizeResources: false, sanitizeOps: false },
  () => {
    let owner: typeof users.$inferSelect;
    let stranger: typeof users.$inferSelect;
    let recipe: typeof recipes.$inferSelect;
    let log: typeof brewLogs.$inferSelect;

    beforeEach(async () => {
      owner = await createUser('bl-svc-delete-owner');
      stranger = await createUser('bl-svc-delete-stranger');
      recipe = await createRecipe(owner.id);
      log = await service.createBrewLog(owner.id, { recipeId: recipe.id });
    });

    afterEach(async () => {
      await cleanupBrewLogs([owner.id, stranger.id], [recipe.id]);
      await cleanupRecipes([recipe.id]);
      await cleanupUsers([owner.id, stranger.id]);
    });

    it('cross-user delete throws BREW_LOG_NOT_FOUND and leaves the row intact', async () => {
      await expect(service.deleteBrewLog(stranger.id, log.id)).rejects.toThrow(
        'BREW_LOG_NOT_FOUND',
      );
      const stillThere = await model.findById(log.id);
      expect(stillThere).toBeDefined();
    });

    it('owner delete soft-deletes and returns the row', async () => {
      const deleted = await service.deleteBrewLog(owner.id, log.id);
      expect(deleted).not.toBeNull();
      expect(deleted!.deletedAt).toBeInstanceOf(Date);
      const found = await model.findById(log.id);
      expect(found).toBeUndefined();
    });
  },
);

describe(
  { name: 'brew-log service — list scoping', sanitizeResources: false, sanitizeOps: false },
  () => {
    let userA: typeof users.$inferSelect;
    let userB: typeof users.$inferSelect;
    let r1: typeof recipes.$inferSelect;
    let r2: typeof recipes.$inferSelect;

    beforeAll(async () => {
      userA = await createUser('bl-svc-list-a');
      userB = await createUser('bl-svc-list-b');
      r1 = await createRecipe(userA.id);
      r2 = await createRecipe(userB.id);
      await service.createBrewLog(userA.id, { recipeId: r1.id, notes: 'A-r1' });
      await service.createBrewLog(userA.id, { recipeId: r2.id, notes: 'A-r2' });
      await service.createBrewLog(userB.id, { recipeId: r1.id, notes: 'B-r1' });
    });

    afterAll(async () => {
      await cleanupBrewLogs([userA.id, userB.id], [r1.id, r2.id]);
      await cleanupRecipes([r1.id, r2.id]);
      await cleanupUsers([userA.id, userB.id]);
    });

    it("listUserBrewLogs returns only the user's logs", async () => {
      const result = await service.listUserBrewLogs(userA.id, 1, 10);
      expect(result.total).toBe(2);
      for (const l of result.brewLogs) {
        expect(l.userId).toBe(userA.id);
      }
    });

    it("listRecipeBrewLogs returns only the user's logs for that recipe", async () => {
      const result = await service.listRecipeBrewLogs(userA.id, r1.id, 1, 10);
      expect(result.total).toBe(1);
      expect(result.brewLogs[0].notes).toBe('A-r1');
    });
  },
);

describe(
  { name: 'brew-log service — stats passthrough', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    let recipe: typeof recipes.$inferSelect;

    beforeAll(async () => {
      user = await createUser('bl-svc-stats');
      recipe = await createRecipe(user.id);
      await service.createBrewLog(user.id, { recipeId: recipe.id, personalRating: 6 });
      await service.createBrewLog(user.id, { recipeId: recipe.id, personalRating: 8 });
    });

    afterAll(async () => {
      await cleanupBrewLogs([user.id], [recipe.id]);
      await cleanupRecipes([recipe.id]);
      await cleanupUsers([user.id]);
    });

    it('getRecipeBrewStats returns the recipe aggregate shape', async () => {
      const stats = await service.getRecipeBrewStats(recipe.id);
      expect(stats).toEqual({ recipeId: recipe.id, brewCount: 2, avgBrewRating: 7 });
    });

    it('getUserBrewStats returns the user aggregate shape', async () => {
      const stats = await service.getUserBrewStats(user.id);
      expect(stats.totalBrews).toBe(2);
      expect(stats.last30Days).toBe(2);
      expect(stats.distinctRecipeCount).toBe(1);
      expect(typeof stats.firstBrewedAt).toBe('string');
      expect(typeof stats.lastBrewedAt).toBe('string');
    });
  },
);
