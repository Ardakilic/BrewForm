/**
 * DB integration tests for the brew-log model layer.
 *
 * Each test creates its own users, recipes, and brew logs (cleaned up in
 * afterEach / afterAll) and exercises the model functions directly against
 * a PostgreSQL test database.
 */

import '../../test-setup.ts';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { db } from '@brewform/db';
import { recipes, users } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';
import * as model from './model.ts';
import {
  cleanupBrewLogs,
  cleanupRecipes,
  cleanupUsers,
  createBrewLogRow,
  createRecipe,
  createUser,
  daysAgo,
} from './test-helpers.ts';

describe(
  { name: 'brew-log model — create/findById', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    let recipe: typeof recipes.$inferSelect;
    const logIds: string[] = [];

    beforeEach(async () => {
      user = await createUser('bl-create');
      recipe = await createRecipe(user.id);
    });

    afterEach(async () => {
      await cleanupBrewLogs([user.id], [recipe.id]);
      await cleanupRecipes([recipe.id]);
      await cleanupUsers([user.id]);
    });

    it('inserts and returns the created row, retrievable via findById', async () => {
      const row = await model.create({
        userId: user.id,
        recipeId: recipe.id,
        yieldActual: 36.5,
        doseActual: 18,
        notes: 'great brew',
        personalRating: 9,
      });
      logIds.push(row.id);
      expect(row.id).toBeDefined();
      expect(row.userId).toBe(user.id);
      expect(row.recipeId).toBe(recipe.id);
      expect(row.brewedAt).toBeInstanceOf(Date);
      const found = await model.findById(row.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(row.id);
      expect(found!.notes).toBe('great brew');
    });

    it('findById returns undefined for a missing id', async () => {
      const found = await model.findById(crypto.randomUUID());
      expect(found).toBeUndefined();
    });

    it('findById excludes soft-deleted logs', async () => {
      const row = await model.create({ userId: user.id, recipeId: recipe.id });
      logIds.push(row.id);
      await model.softDelete(row.id, user.id);
      const found = await model.findById(row.id);
      expect(found).toBeUndefined();
    });
  },
);

describe(
  { name: 'brew-log model — findByUserId', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    let recipe: typeof recipes.$inferSelect;

    beforeAll(async () => {
      user = await createUser('bl-list');
      recipe = await createRecipe(user.id);
      await createBrewLogRow(user.id, recipe.id, { brewedAt: daysAgo(3), notes: 'oldest' });
      await createBrewLogRow(user.id, recipe.id, { brewedAt: daysAgo(1), notes: 'newest' });
      await createBrewLogRow(user.id, recipe.id, { brewedAt: daysAgo(2), notes: 'middle' });
    });

    afterAll(async () => {
      await cleanupBrewLogs([user.id], [recipe.id]);
      await cleanupRecipes([recipe.id]);
      await cleanupUsers([user.id]);
    });

    it('returns logs newest-first with recipe title/slug and correct total', async () => {
      const result = await model.findByUserId(user.id, 1, 10);
      expect(result.total).toBe(3);
      expect(result.brewLogs.length).toBe(3);
      expect(result.brewLogs.map((l) => l.notes)).toEqual(['newest', 'middle', 'oldest']);
      for (const l of result.brewLogs) {
        expect(l.recipeTitle).toBe(recipe.title);
        expect(l.recipeSlug).toBe(recipe.slug);
      }
    });

    it('paginates with perPage while keeping the full total', async () => {
      const page1 = await model.findByUserId(user.id, 1, 2);
      expect(page1.brewLogs.length).toBe(2);
      expect(page1.total).toBe(3);
      const page2 = await model.findByUserId(user.id, 2, 2);
      expect(page2.brewLogs.length).toBe(1);
      expect(page2.total).toBe(3);
    });
  },
);

describe(
  { name: 'brew-log model — soft-delete exclusion', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    let recipe: typeof recipes.$inferSelect;

    beforeAll(async () => {
      user = await createUser('bl-softdel');
      recipe = await createRecipe(user.id);
      await createBrewLogRow(user.id, recipe.id, { notes: 'kept' });
      const doomed = await createBrewLogRow(user.id, recipe.id, { notes: 'doomed' });
      await model.softDelete(doomed.id, user.id);
    });

    afterAll(async () => {
      await cleanupBrewLogs([user.id], [recipe.id]);
      await cleanupRecipes([recipe.id]);
      await cleanupUsers([user.id]);
    });

    it('excludes the deleted log from the list AND the total', async () => {
      const result = await model.findByUserId(user.id, 1, 10);
      expect(result.total).toBe(1);
      expect(result.brewLogs.length).toBe(1);
      expect(result.brewLogs[0].notes).toBe('kept');
    });
  },
);

describe(
  {
    name: 'brew-log model — deleted-recipe exclusion',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let user: typeof users.$inferSelect;
    let alive: typeof recipes.$inferSelect;
    let dead: typeof recipes.$inferSelect;
    let hiddenLogId: string;

    beforeAll(async () => {
      user = await createUser('bl-deadrecipe');
      alive = await createRecipe(user.id);
      dead = await createRecipe(user.id);
      await createBrewLogRow(user.id, alive.id, { notes: 'visible' });
      const hidden = await createBrewLogRow(user.id, dead.id, {
        notes: 'hidden',
        personalRating: 7,
      });
      hiddenLogId = hidden.id;
      await db.update(recipes).set({ deletedAt: new Date() }).where(eq(recipes.id, dead.id));
    });

    afterAll(async () => {
      await cleanupBrewLogs([user.id], [alive.id, dead.id]);
      await cleanupRecipes([alive.id, dead.id]);
      await cleanupUsers([user.id]);
    });

    it('excludes logs of soft-deleted recipes from findByUserId', async () => {
      const result = await model.findByUserId(user.id, 1, 10);
      expect(result.total).toBe(1);
      expect(result.brewLogs[0].notes).toBe('visible');
    });

    it('excludes logs of soft-deleted recipes from getRecipeBrewStats', async () => {
      const stats = await model.getRecipeBrewStats(dead.id);
      expect(stats.brewCount).toBe(0);
      expect(stats.avgBrewRating).toBeNull();
    });

    it('excludes logs of soft-deleted recipes from findById', async () => {
      const found = await model.findById(hiddenLogId);
      expect(found).toBeUndefined();
    });
  },
);

describe(
  { name: 'brew-log model — findByRecipeIdAndUser', sanitizeResources: false, sanitizeOps: false },
  () => {
    let userA: typeof users.$inferSelect;
    let userB: typeof users.$inferSelect;
    let recipe: typeof recipes.$inferSelect;

    beforeAll(async () => {
      userA = await createUser('bl-scoped-a');
      userB = await createUser('bl-scoped-b');
      recipe = await createRecipe(userA.id);
      await createBrewLogRow(userA.id, recipe.id, { notes: 'A1' });
      await createBrewLogRow(userA.id, recipe.id, { notes: 'A2' });
      await createBrewLogRow(userB.id, recipe.id, { notes: 'B1' });
    });

    afterAll(async () => {
      await cleanupBrewLogs([userA.id, userB.id], [recipe.id]);
      await cleanupRecipes([recipe.id]);
      await cleanupUsers([userA.id, userB.id]);
    });

    it("returns only the given user's logs for the recipe", async () => {
      const result = await model.findByRecipeIdAndUser(recipe.id, userA.id, 1, 10);
      expect(result.total).toBe(2);
      for (const l of result.brewLogs) {
        expect(l.userId).toBe(userA.id);
        expect(l.recipeId).toBe(recipe.id);
      }
    });
  },
);

describe(
  { name: 'brew-log model — getRecipeBrewStats', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    let rated: typeof recipes.$inferSelect;
    let unrated: typeof recipes.$inferSelect;

    beforeAll(async () => {
      user = await createUser('bl-recipestats');
      rated = await createRecipe(user.id);
      unrated = await createRecipe(user.id);
      await createBrewLogRow(user.id, rated.id, { personalRating: 8 });
      await createBrewLogRow(user.id, rated.id, { personalRating: 10 });
      await createBrewLogRow(user.id, rated.id);
      await createBrewLogRow(user.id, unrated.id);
    });

    afterAll(async () => {
      await cleanupBrewLogs([user.id], [rated.id, unrated.id]);
      await cleanupRecipes([rated.id, unrated.id]);
      await cleanupUsers([user.id]);
    });

    it('averages only non-null ratings (8 and 10 → 9) and counts all logs', async () => {
      const stats = await model.getRecipeBrewStats(rated.id);
      expect(stats.recipeId).toBe(rated.id);
      expect(stats.brewCount).toBe(3);
      expect(stats.avgBrewRating).toBe(9);
    });

    it('returns a null average when no brew is rated', async () => {
      const stats = await model.getRecipeBrewStats(unrated.id);
      expect(stats.brewCount).toBe(1);
      expect(stats.avgBrewRating).toBeNull();
    });
  },
);

describe(
  { name: 'brew-log model — getUserBrewStats', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    let r1: typeof recipes.$inferSelect;
    let r2: typeof recipes.$inferSelect;
    let oldIso: string;
    let recentIso: string;

    beforeAll(async () => {
      user = await createUser('bl-userstats');
      r1 = await createRecipe(user.id);
      r2 = await createRecipe(user.id);
      const old = await createBrewLogRow(user.id, r1.id, { brewedAt: daysAgo(40) });
      const recent = await createBrewLogRow(user.id, r2.id, { brewedAt: daysAgo(1) });
      oldIso = old.brewedAt.toISOString();
      recentIso = recent.brewedAt.toISOString();
    });

    afterAll(async () => {
      await cleanupBrewLogs([user.id], [r1.id, r2.id]);
      await cleanupRecipes([r1.id, r2.id]);
      await cleanupUsers([user.id]);
    });

    it('returns totals, last30Days, distinct recipes, and first/last brew', async () => {
      const stats = await model.getUserBrewStats(user.id);
      expect(stats.totalBrews).toBe(2);
      expect(stats.last30Days).toBe(1);
      expect(stats.distinctRecipeCount).toBe(2);
      expect(stats.firstBrewedAt).toBe(oldIso);
      expect(stats.lastBrewedAt).toBe(recentIso);
    });

    it('returns zeros and nulls for a user with no brews', async () => {
      const stats = await model.getUserBrewStats(crypto.randomUUID());
      expect(stats.totalBrews).toBe(0);
      expect(stats.last30Days).toBe(0);
      expect(stats.distinctRecipeCount).toBe(0);
      expect(stats.firstBrewedAt).toBeNull();
      expect(stats.lastBrewedAt).toBeNull();
    });
  },
);
