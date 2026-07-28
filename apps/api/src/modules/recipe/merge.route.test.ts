import '../../test-setup.ts';
import { afterAll, afterEach, beforeAll, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { AppEnv } from '../../types/hono.ts';
import { db } from '@brewform/db';
import {
  recipeAdditionalPreparations,
  recipeEquipment,
  recipes,
  recipeTasteNotes,
  recipeVersionPhotos,
  recipeVersions,
  userBadges,
  users,
} from '@brewform/db/schema';
import { eq, inArray } from 'drizzle-orm';
import recipeRouter, { deps } from './index.ts';
import { evaluateBadges } from '../badge/service.ts';

async function createUser(prefix: string) {
  const id = crypto.randomUUID();
  const [user] = await db.insert(users).values({
    id,
    email: `${prefix}-${id}@example.com`,
    username: `${prefix}-${id.slice(0, 8)}`,
    passwordHash: 'hash',
    emailVerifiedAt: new Date(),
  }).returning();
  return user;
}

const stubAuth = async (_c: Context, next: Next) => {
  await next();
};
const originalAuthMiddleware = deps.authMiddleware;

function createTestApp(userId: string | null, emailVerified = true) {
  deps.authMiddleware = stubAuth;
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    if (userId) {
      c.set('userId', userId);
      c.set('user', {
        id: userId,
        isAdmin: false,
        emailVerifiedAt: emailVerified ? new Date() : null,
        // deno-lint-ignore no-explicit-any -- test mock request body
      } as any);
    }
    await next();
  });
  app.route('/api/v1/recipes', recipeRouter);
  return app;
}

function createUnauthenticatedApp() {
  deps.authMiddleware = originalAuthMiddleware;
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
  });
  app.route('/api/v1/recipes', recipeRouter);
  return app;
}

describe(
  { name: 'POST /api/v1/recipes/merge', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    let recipeId1: string;
    let recipeId2: string;
    let versionId1: string;
    let versionId2: string;
    const createdRecipeIds: string[] = [];

    beforeAll(async () => {
      user = await createUser('merge-route');
      recipeId1 = crypto.randomUUID();
      recipeId2 = crypto.randomUUID();
      versionId1 = crypto.randomUUID();
      versionId2 = crypto.randomUUID();

      await db.insert(recipes).values([
        {
          id: recipeId1,
          slug: `mr-r1-${recipeId1.slice(0, 8)}`,
          title: 'Route Source V1',
          authorId: user.id,
          visibility: 'public',
        },
        {
          id: recipeId2,
          slug: `mr-r2-${recipeId2.slice(0, 8)}`,
          title: 'Route Source V2',
          authorId: user.id,
          visibility: 'public',
        },
      ]);

      await db.insert(recipeVersions).values({
        id: versionId1,
        recipeId: recipeId1,
        versionNumber: 1,
        brewMethod: 'v60',
        drinkType: 'pour_over',
        preparationNotes: 'Bloom 30s',
        personalNotes: '',
        brewDate: new Date(),
        isFavourite: false,
      });
      await db.insert(recipeVersions).values({
        id: versionId2,
        recipeId: recipeId2,
        versionNumber: 1,
        brewMethod: 'french_press',
        drinkType: 'drip_coffee',
        preparationNotes: 'Steep 4min',
        personalNotes: '',
        brewDate: new Date(),
        isFavourite: false,
      });
    });

    afterEach(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      if (createdRecipeIds.length) {
        const versionIdsSubquery = db.select({ id: recipeVersions.id }).from(recipeVersions)
          .where(inArray(recipeVersions.recipeId, createdRecipeIds));
        await db.delete(recipeTasteNotes).where(
          inArray(recipeTasteNotes.recipeVersionId, versionIdsSubquery),
        );
        await db.delete(recipeEquipment).where(
          inArray(recipeEquipment.recipeVersionId, versionIdsSubquery),
        );
        await db.delete(recipeAdditionalPreparations).where(
          inArray(recipeAdditionalPreparations.recipeVersionId, versionIdsSubquery),
        );
        await db.delete(recipeVersionPhotos).where(
          inArray(recipeVersionPhotos.recipeVersionId, versionIdsSubquery),
        );
        await db.delete(recipeVersions).where(
          inArray(recipeVersions.recipeId, createdRecipeIds),
        );
        await db.delete(recipes).where(inArray(recipes.id, createdRecipeIds));
        createdRecipeIds.length = 0;
      }
    });

    afterAll(async () => {
      const srcVersionIds = [versionId1, versionId2];
      await db.delete(recipeVersions).where(inArray(recipeVersions.id, srcVersionIds));
      await db.delete(recipes).where(inArray(recipes.id, [recipeId1, recipeId2]));
      await evaluateBadges(user.id);
      await db.delete(userBadges).where(eq(userBadges.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    });

    it('returns 201 with success envelope', async () => {
      const app = createTestApp(user.id);
      const res = await app.request('/api/v1/recipes/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeVersionId1: versionId1,
          recipeVersionId2: versionId2,
          title: 'Route Merged Recipe',
          selections: { brewMethod: 'v1', drinkType: 'v2' },
        }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.visibility).toBe('draft');
      expect(body.data.title).toBe('Route Merged Recipe');
      createdRecipeIds.push(body.data.id);
    });

    it('returns 401 without auth token', async () => {
      const app = createUnauthenticatedApp();
      const res = await app.request('/api/v1/recipes/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeVersionId1: versionId1,
          recipeVersionId2: versionId2,
          title: 'Should Fail Auth',
          selections: {},
        }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 when email is not verified', async () => {
      const app = createTestApp(user.id, false);
      const res = await app.request('/api/v1/recipes/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeVersionId1: versionId1,
          recipeVersionId2: versionId2,
          title: 'Should Fail Verification',
          selections: {},
        }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('returns 404 for non-existent version ID', async () => {
      const app = createTestApp(user.id);
      const res = await app.request('/api/v1/recipes/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeVersionId1: versionId1,
          recipeVersionId2: crypto.randomUUID(),
          title: 'Should Not Find',
          selections: {},
        }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid payload (missing title)', async () => {
      const app = createTestApp(user.id);
      const res = await app.request('/api/v1/recipes/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeVersionId1: versionId1,
          recipeVersionId2: versionId2,
          selections: {},
        }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toBeDefined();
    });
  },
);
