/**
 * Route-level integration tests for the brew-log module.
 *
 * Mounts the real brew-log router on a stub Hono app that sets the
 * context variables (requestId, userId, user) and stubs the auth
 * middleware via the `deps` proxy, then exercises the full HTTP stack
 * (Zod validation, service dispatch, envelope response shaping) against
 * a PostgreSQL test database. The 401 tests restore the REAL auth
 * middleware (no token → 401 without DB access).
 */

import '../../test-setup.ts';
import { afterAll, beforeAll, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { AppEnv } from '../../types/hono.ts';
import { db } from '@brewform/db';
import { brewLogs, recipes, recipeVersions, users } from '@brewform/db/schema';
import { inArray } from 'drizzle-orm';
import brewLogRouter, { deps } from './index.ts';
import { createBrewLogRow, createRecipe, createUser } from './test-helpers.ts';

const stubAuth = async (_c: Context, next: Next): Promise<undefined> => {
  await next();
  return undefined;
};
const originalAuthMiddleware = deps.authMiddleware;
const originalOptionalAuthMiddleware = deps.optionalAuthMiddleware;

function createTestApp(userId: string | null) {
  deps.authMiddleware = stubAuth;
  deps.optionalAuthMiddleware = stubAuth;
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    if (userId) {
      c.set('userId', userId);
      c.set('user', {
        id: userId,
        isAdmin: false,
        emailVerifiedAt: new Date(),
        // deno-lint-ignore no-explicit-any -- test mock request body
      } as any);
    } else {
      c.set('userId', null);
      c.set('user', null);
    }
    await next();
  });
  app.route('/api/v1/brew-logs', brewLogRouter);
  return app;
}

/** App with the REAL auth middleware restored — no token yields 401. */
function createUnauthorizedApp() {
  deps.authMiddleware = originalAuthMiddleware;
  deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
  });
  app.route('/api/v1/brew-logs', brewLogRouter);
  return app;
}

async function createRecipeVersion(recipeId: string) {
  const [version] = await db.insert(recipeVersions).values({
    recipeId,
    versionNumber: 1,
    brewMethod: 'v60',
    drinkType: 'pour_over',
    preparationNotes: 'test version',
  }).returning();
  return version;
}

/** Cascade cleanup for router tests: a user's brew logs, owned recipes/versions, then the user. */
async function cleanupUsers(userIds: string[]) {
  if (userIds.length === 0) return;
  await db.delete(brewLogs).where(inArray(brewLogs.userId, userIds));
  const userRecipes = await db.select({ id: recipes.id }).from(recipes).where(
    inArray(recipes.authorId, userIds),
  );
  if (userRecipes.length) {
    const recipeIds = userRecipes.map((r) => r.id);
    await db.delete(brewLogs).where(inArray(brewLogs.recipeId, recipeIds));
    await db.delete(recipeVersions).where(inArray(recipeVersions.recipeId, recipeIds));
    await db.delete(recipes).where(inArray(recipes.id, recipeIds));
  }
  await db.delete(users).where(inArray(users.id, userIds));
}

describe(
  {
    name: 'POST /api/v1/brew-logs — create',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let user: typeof users.$inferSelect;
    let publicRecipe: typeof recipes.$inferSelect;
    let otherRecipe: typeof recipes.$inferSelect;
    const createdLogIds: string[] = [];

    beforeAll(async () => {
      user = await createUser('bl-create');
      publicRecipe = await createRecipe(user.id);
      otherRecipe = await createRecipe(user.id);
    });

    afterAll(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
      if (createdLogIds.length) {
        await db.delete(brewLogs).where(inArray(brewLogs.id, createdLogIds));
      }
      await cleanupUsers([user.id]);
    });

    it('returns 201 with the created brew log for a public recipe', async () => {
      const app = createTestApp(user.id);
      const res = await app.request('/api/v1/brew-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeId: publicRecipe.id,
          yieldActual: 220,
          doseActual: 15,
          notes: 'first brew',
          personalRating: 8,
        }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.recipeId).toBe(publicRecipe.id);
      expect(body.data.userId).toBe(user.id);
      expect(body.data.notes).toBe('first brew');
      expect(body.data.personalRating).toBe(8);
      expect(typeof body.data.brewedAt).toBe('string');
      expect(typeof body.data.createdAt).toBe('string');
      createdLogIds.push(body.data.id);
    });

    it('returns 401 when unauthenticated', async () => {
      const app = createUnauthorizedApp();
      const res = await app.request('/api/v1/brew-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: publicRecipe.id }),
      });
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid body (personalRating out of range)', async () => {
      const app = createTestApp(user.id);
      const res = await app.request('/api/v1/brew-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: publicRecipe.id, personalRating: 11 }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when the recipe version belongs to another recipe', async () => {
      const foreignVersion = await createRecipeVersion(otherRecipe.id);
      const app = createTestApp(user.id);
      const res = await app.request('/api/v1/brew-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeId: publicRecipe.id,
          recipeVersionId: foreignVersion.id,
        }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for a non-existent recipe', async () => {
      const app = createTestApp(user.id);
      const res = await app.request('/api/v1/brew-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: crypto.randomUUID() }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  },
);

describe(
  {
    name: 'GET /api/v1/brew-logs — list my brew logs',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let user: typeof users.$inferSelect;
    let recipe: typeof recipes.$inferSelect;
    const logIds: string[] = [];

    beforeAll(async () => {
      user = await createUser('bl-list');
      recipe = await createRecipe(user.id);
      const older = await createBrewLogRow(user.id, recipe.id, {
        brewedAt: new Date('2024-01-01T00:00:00Z'),
        notes: 'older',
      });
      const middle = await createBrewLogRow(user.id, recipe.id, {
        brewedAt: new Date('2024-03-01T00:00:00Z'),
        notes: 'middle',
      });
      const newer = await createBrewLogRow(user.id, recipe.id, {
        brewedAt: new Date('2024-06-01T00:00:00Z'),
        notes: 'newer',
      });
      logIds.push(older.id, middle.id, newer.id);
    });

    afterAll(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
      await cleanupUsers([user.id]);
    });

    it('returns paginated brew logs newest-first with recipe title/slug', async () => {
      const app = createTestApp(user.id);
      const res = await app.request('/api/v1/brew-logs?page=1&perPage=10');
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.length).toBe(3);
      expect(body.meta.pagination.total).toBe(3);
      expect(body.meta.pagination.totalPages).toBe(1);
      // deno-lint-ignore no-explicit-any -- test mock
      const notes = body.data.map((l: any) => l.notes);
      expect(notes).toEqual(['newer', 'middle', 'older']);
      for (const l of body.data) {
        expect(l.recipeTitle).toBe(recipe.title);
        expect(l.recipeSlug).toBe(recipe.slug);
      }
    });

    it('returns 401 when unauthenticated', async () => {
      const app = createUnauthorizedApp();
      const res = await app.request('/api/v1/brew-logs');
      expect(res.status).toBe(401);
    });
  },
);

describe(
  {
    name: 'GET /api/v1/brew-logs/:id — get one of my brew logs',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let owner: typeof users.$inferSelect;
    let stranger: typeof users.$inferSelect;
    let recipe: typeof recipes.$inferSelect;
    let logId: string;

    beforeAll(async () => {
      owner = await createUser('bl-get-owner');
      stranger = await createUser('bl-get-stranger');
      recipe = await createRecipe(owner.id);
      const row = await createBrewLogRow(owner.id, recipe.id, { notes: 'single' });
      logId = row.id;
    });

    afterAll(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
      await cleanupUsers([owner.id, stranger.id]);
    });

    it('returns the log to its owner', async () => {
      const app = createTestApp(owner.id);
      const res = await app.request(`/api/v1/brew-logs/${logId}`);
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(logId);
      expect(body.data.notes).toBe('single');
    });

    it('returns 404 for a foreign log', async () => {
      const app = createTestApp(stranger.id);
      const res = await app.request(`/api/v1/brew-logs/${logId}`);
      expect(res.status).toBe(404);
    });

    it('returns 404 for an unknown id', async () => {
      const app = createTestApp(owner.id);
      const res = await app.request(`/api/v1/brew-logs/${crypto.randomUUID()}`);
      expect(res.status).toBe(404);
    });

    it('returns 401 when unauthenticated', async () => {
      const app = createUnauthorizedApp();
      const res = await app.request(`/api/v1/brew-logs/${logId}`);
      expect(res.status).toBe(401);
    });
  },
);

describe(
  {
    name: 'GET /api/v1/brew-logs/stats/user — my brew stats',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let user: typeof users.$inferSelect;
    let recipeA: typeof recipes.$inferSelect;
    let recipeB: typeof recipes.$inferSelect;

    beforeAll(async () => {
      user = await createUser('bl-stats-user');
      recipeA = await createRecipe(user.id);
      recipeB = await createRecipe(user.id);
      await createBrewLogRow(user.id, recipeA.id, { personalRating: 7 });
      await createBrewLogRow(user.id, recipeA.id);
      await createBrewLogRow(user.id, recipeB.id, { personalRating: 9 });
    });

    afterAll(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
      await cleanupUsers([user.id]);
    });

    it('returns the journal stats shape', async () => {
      const app = createTestApp(user.id);
      const res = await app.request('/api/v1/brew-logs/stats/user');
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.totalBrews).toBe(3);
      expect(body.data.last30Days).toBe(3);
      expect(body.data.distinctRecipeCount).toBe(2);
      expect(typeof body.data.firstBrewedAt).toBe('string');
      expect(typeof body.data.lastBrewedAt).toBe('string');
    });

    it('returns 401 when unauthenticated', async () => {
      const app = createUnauthorizedApp();
      const res = await app.request('/api/v1/brew-logs/stats/user');
      expect(res.status).toBe(401);
    });
  },
);

describe(
  {
    name: 'GET /api/v1/brew-logs/stats/recipe/:recipeId — recipe brew stats',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let user: typeof users.$inferSelect;
    let ratedRecipe: typeof recipes.$inferSelect;
    let unratedRecipe: typeof recipes.$inferSelect;

    beforeAll(async () => {
      user = await createUser('bl-stats-recipe');
      ratedRecipe = await createRecipe(user.id);
      unratedRecipe = await createRecipe(user.id);
      await createBrewLogRow(user.id, ratedRecipe.id, { personalRating: 8 });
      await createBrewLogRow(user.id, ratedRecipe.id, { personalRating: 10 });
      await createBrewLogRow(user.id, unratedRecipe.id);
    });

    afterAll(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
      await cleanupUsers([user.id]);
    });

    it('returns brew count and average rating without authentication', async () => {
      const app = createUnauthorizedApp();
      const res = await app.request(`/api/v1/brew-logs/stats/recipe/${ratedRecipe.id}`);
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.recipeId).toBe(ratedRecipe.id);
      expect(body.data.brewCount).toBe(2);
      expect(body.data.avgBrewRating).toBe(9);
    });

    it('returns null avgBrewRating when no brew has a rating', async () => {
      const app = createUnauthorizedApp();
      const res = await app.request(`/api/v1/brew-logs/stats/recipe/${unratedRecipe.id}`);
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.data.brewCount).toBe(1);
      expect(body.data.avgBrewRating).toBeNull();
    });
  },
);

describe(
  {
    name: 'GET /api/v1/brew-logs/recipe/:recipeId — list by recipe',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let userA: typeof users.$inferSelect;
    let userB: typeof users.$inferSelect;
    let recipe: typeof recipes.$inferSelect;

    beforeAll(async () => {
      userA = await createUser('bl-byrecipe-a');
      userB = await createUser('bl-byrecipe-b');
      recipe = await createRecipe(userA.id);
      await createBrewLogRow(userA.id, recipe.id, { notes: 'A brew' });
      await createBrewLogRow(userB.id, recipe.id, { notes: 'B brew' });
    });

    afterAll(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
      await cleanupUsers([userA.id, userB.id]);
    });

    it("returns only the requester's brew logs for the recipe", async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(`/api/v1/brew-logs/recipe/${recipe.id}`);
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.length).toBe(1);
      expect(body.data[0].notes).toBe('A brew');
      expect(body.data[0].userId).toBe(userA.id);
    });

    it('returns 401 when unauthenticated', async () => {
      const app = createUnauthorizedApp();
      const res = await app.request(`/api/v1/brew-logs/recipe/${recipe.id}`);
      expect(res.status).toBe(401);
    });
  },
);

describe(
  {
    name: 'PATCH /api/v1/brew-logs/:id — update',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let userA: typeof users.$inferSelect;
    let userB: typeof users.$inferSelect;
    let recipe: typeof recipes.$inferSelect;
    let log: typeof brewLogs.$inferSelect;

    beforeAll(async () => {
      userA = await createUser('bl-update-a');
      userB = await createUser('bl-update-b');
      recipe = await createRecipe(userA.id);
      log = await createBrewLogRow(userA.id, recipe.id, { notes: 'before' });
    });

    afterAll(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
      await cleanupUsers([userA.id, userB.id]);
    });

    it('returns 200 with the updated notes for the owner', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(`/api/v1/brew-logs/${log.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'after' }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(log.id);
      expect(body.data.notes).toBe('after');
    });

    it('returns 401 when unauthenticated', async () => {
      const app = createUnauthorizedApp();
      const res = await app.request(`/api/v1/brew-logs/${log.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'x' }),
      });
      expect(res.status).toBe(401);
    });

    it('returns 404 for a non-existent brew log', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(`/api/v1/brew-logs/${crypto.randomUUID()}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'x' }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when another user tries to update it', async () => {
      const app = createTestApp(userB.id);
      const res = await app.request(`/api/v1/brew-logs/${log.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'hacked' }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  },
);

describe(
  {
    name: 'DELETE /api/v1/brew-logs/:id — delete',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let userA: typeof users.$inferSelect;
    let userB: typeof users.$inferSelect;
    let recipe: typeof recipes.$inferSelect;
    let logOwned: typeof brewLogs.$inferSelect;
    let logOther: typeof brewLogs.$inferSelect;

    beforeAll(async () => {
      userA = await createUser('bl-delete-a');
      userB = await createUser('bl-delete-b');
      recipe = await createRecipe(userA.id);
      logOwned = await createBrewLogRow(userA.id, recipe.id);
      logOther = await createBrewLogRow(userB.id, recipe.id);
    });

    afterAll(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
      await cleanupUsers([userA.id, userB.id]);
    });

    it('returns 200 for the owner and the log is absent from GET /', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(`/api/v1/brew-logs/${logOwned.id}`, { method: 'DELETE' });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.message).toBeDefined();

      const listRes = await app.request('/api/v1/brew-logs');
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const listBody = await listRes.json() as any;
      expect(listRes.status).toBe(200);
      // deno-lint-ignore no-explicit-any -- test mock
      const ids = listBody.data.map((l: any) => l.id);
      expect(ids).not.toContain(logOwned.id);
    });

    it('returns 401 when unauthenticated', async () => {
      const app = createUnauthorizedApp();
      const res = await app.request(`/api/v1/brew-logs/${logOther.id}`, { method: 'DELETE' });
      expect(res.status).toBe(401);
    });

    it('returns 404 for a non-existent brew log', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(`/api/v1/brew-logs/${crypto.randomUUID()}`, {
        method: 'DELETE',
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when another user tries to delete it', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(`/api/v1/brew-logs/${logOther.id}`, { method: 'DELETE' });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  },
);

describe(
  {
    name: 'brew-log routes — UUID path param validation',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    afterAll(() => {
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
    });

    it('rejects malformed :id and :recipeId params with 400', async () => {
      const app = createTestApp(crypto.randomUUID());
      const cases: Array<[string, string]> = [
        ['GET', '/api/v1/brew-logs/not-a-uuid'],
        ['GET', '/api/v1/brew-logs/recipe/not-a-uuid'],
        ['GET', '/api/v1/brew-logs/stats/recipe/not-a-uuid'],
        ['PATCH', '/api/v1/brew-logs/not-a-uuid'],
        ['DELETE', '/api/v1/brew-logs/not-a-uuid'],
      ];
      for (const [method, path] of cases) {
        const res = await app.request(path, { method });
        expect(res.status).toBe(400);
      }
    });
  },
);
