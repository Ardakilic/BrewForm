/**
 * Route-level integration tests for GET /api/v1/recipes/:slug/versions/diff.
 *
 * Exercises the full HTTP stack (Zod query validation, optionalAuthGuard,
 * visibility checks, service dispatch, envelope shaping) against the
 * PostgreSQL test database.
 */

import '../../test-setup.ts';
import { afterAll, beforeAll, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { AppEnv } from '../../types/hono.ts';
import { db } from '@brewform/db';
import {
  recipeEquipment,
  recipes,
  recipeTasteNotes,
  recipeVersions,
  userBadges,
  users,
} from '@brewform/db/schema';
import { eq, inArray } from 'drizzle-orm';
import recipeRouter, { deps } from './index.ts';

async function createUser(prefix: string, isAdmin = false) {
  const id = crypto.randomUUID();
  const [user] = await db.insert(users).values({
    id,
    email: `${prefix}-${id}@example.com`,
    username: `${prefix}-${id.slice(0, 8)}`,
    passwordHash: 'hash',
    isAdmin,
  }).returning();
  return user;
}

const stubOptionalAuth = async (_c: Context, next: Next) => {
  await next();
};
const originalOptionalAuth = deps.optionalAuthMiddleware;

function createAnonymousApp() {
  deps.optionalAuthMiddleware = stubOptionalAuth;
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
  });
  app.route('/api/v1/recipes', recipeRouter);
  return app;
}

function createAuthApp(userId: string, isAdmin = false) {
  deps.optionalAuthMiddleware = stubOptionalAuth;
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    c.set('userId', userId);
    c.set('user', {
      id: userId,
      isAdmin,
      emailVerifiedAt: new Date(),
      // deno-lint-ignore no-explicit-any -- test mock request body
    } as any);
    await next();
  });
  app.route('/api/v1/recipes', recipeRouter);
  return app;
}

describe(
  { name: 'GET /api/v1/recipes/:slug/versions/diff', sanitizeResources: false, sanitizeOps: false },
  () => {
    let author: typeof users.$inferSelect;
    let outsider: typeof users.$inferSelect;
    let admin: typeof users.$inferSelect;
    let publicRecipeId: string;
    let privateRecipeId: string;
    let otherRecipeId: string;
    let v1Id: string;
    let v2Id: string;
    let privateV1Id: string;
    let privateV2Id: string;
    let otherVersionId: string;

    beforeAll(async () => {
      author = await createUser('diff-route-author');
      outsider = await createUser('diff-route-outsider');
      admin = await createUser('diff-route-admin', true);

      publicRecipeId = crypto.randomUUID();
      privateRecipeId = crypto.randomUUID();
      otherRecipeId = crypto.randomUUID();
      v1Id = crypto.randomUUID();
      v2Id = crypto.randomUUID();
      privateV1Id = crypto.randomUUID();
      privateV2Id = crypto.randomUUID();
      otherVersionId = crypto.randomUUID();

      await db.insert(recipes).values([
        {
          id: publicRecipeId,
          slug: `diff-pub-${publicRecipeId.slice(0, 8)}`,
          title: 'Public Diff Recipe',
          authorId: author.id,
          visibility: 'public',
        },
        {
          id: privateRecipeId,
          slug: `diff-priv-${privateRecipeId.slice(0, 8)}`,
          title: 'Private Diff Recipe',
          authorId: author.id,
          visibility: 'private',
        },
        {
          id: otherRecipeId,
          slug: `diff-other-${otherRecipeId.slice(0, 8)}`,
          title: 'Other Recipe',
          authorId: author.id,
          visibility: 'public',
        },
      ]);

      await db.insert(recipeVersions).values([
        {
          id: v1Id,
          recipeId: publicRecipeId,
          versionNumber: 1,
          brewMethod: 'v60',
          drinkType: 'pour_over',
          grindSize: 'medium',
          groundWeightGrams: 18,
          preparationNotes: 'Bloom 30s',
          brewDate: new Date('2025-01-01'),
          isFavourite: false,
        },
        {
          id: v2Id,
          recipeId: publicRecipeId,
          versionNumber: 2,
          brewMethod: 'espresso_machine',
          drinkType: 'pour_over',
          grindSize: 'fine',
          groundWeightGrams: 20,
          preparationNotes: 'WDT + tamp',
          brewDate: new Date('2025-02-01'),
          isFavourite: true,
        },
        {
          id: privateV1Id,
          recipeId: privateRecipeId,
          versionNumber: 1,
          brewMethod: 'french_press',
          drinkType: 'drip_coffee',
          preparationNotes: 'Steep 4min',
          brewDate: new Date('2025-01-15'),
          isFavourite: false,
        },
        {
          id: privateV2Id,
          recipeId: privateRecipeId,
          versionNumber: 2,
          brewMethod: 'aeropress',
          drinkType: 'drip_coffee',
          preparationNotes: 'Inverted 2min',
          brewDate: new Date('2025-03-01'),
          isFavourite: false,
        },
        {
          id: otherVersionId,
          recipeId: otherRecipeId,
          versionNumber: 1,
          brewMethod: 'cold_brew',
          drinkType: 'cold_brew',
          preparationNotes: '12h steep',
          brewDate: new Date('2025-04-01'),
          isFavourite: false,
        },
      ]);
    });

    afterAll(async () => {
      const allVersionIds = [v1Id, v2Id, privateV1Id, privateV2Id, otherVersionId];
      await db.delete(recipeTasteNotes).where(
        inArray(recipeTasteNotes.recipeVersionId, allVersionIds),
      );
      await db.delete(recipeEquipment).where(
        inArray(recipeEquipment.recipeVersionId, allVersionIds),
      );
      await db.delete(recipeVersions).where(inArray(recipeVersions.id, allVersionIds));
      await db.delete(recipes).where(
        inArray(recipes.id, [publicRecipeId, privateRecipeId, otherRecipeId]),
      );
      for (const u of [author, outsider, admin]) {
        await db.delete(userBadges).where(eq(userBadges.userId, u.id));
        await db.delete(users).where(eq(users.id, u.id));
      }
      deps.optionalAuthMiddleware = originalOptionalAuth;
    });

    function diffUrl(slug: string, v1: string, v2?: string) {
      const params = new URLSearchParams({ v1 });
      if (v2) params.set('v2', v2);
      return `/api/v1/recipes/${slug}/versions/diff?${params}`;
    }

    const publicSlug = () => `diff-pub-${publicRecipeId.slice(0, 8)}`;
    const privateSlug = () => `diff-priv-${privateRecipeId.slice(0, 8)}`;

    it('anonymous user can diff a public recipe', async () => {
      const app = createAnonymousApp();
      const res = await app.request(diffUrl(publicSlug(), v1Id, v2Id));
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.version1).toBeDefined();
      expect(body.data.version2).toBeDefined();
    });

    it('non-author cannot diff a private recipe', async () => {
      const app = createAuthApp(outsider.id);
      const res = await app.request(diffUrl(privateSlug(), privateV1Id, privateV2Id));
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('admin can diff a private recipe', async () => {
      const app = createAuthApp(admin.id, true);
      const res = await app.request(diffUrl(privateSlug(), privateV1Id, privateV2Id));
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.version1).toBeDefined();
    });

    it('returns 400 when v2 is missing', async () => {
      const app = createAnonymousApp();
      const res = await app.request(diffUrl(publicSlug(), v1Id));
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when v1 === v2', async () => {
      const app = createAnonymousApp();
      const res = await app.request(diffUrl(publicSlug(), v1Id, v1Id));
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 when version belongs to a different recipe', async () => {
      const app = createAnonymousApp();
      const res = await app.request(diffUrl(publicSlug(), v1Id, otherVersionId));
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VERSION_NOT_FOUND');
    });

    it('returns full diff response shape', async () => {
      const app = createAuthApp(author.id);
      const res = await app.request(diffUrl(publicSlug(), v1Id, v2Id));
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.version1.id).toBe(v1Id);
      expect(body.data.version2.id).toBe(v2Id);
      expect(body.data.fields).toBeInstanceOf(Array);
      expect(body.data.tasteNotes).toBeDefined();
      expect(body.data.equipment).toBeDefined();

      const brewMethod = body.data.fields.find(
        // deno-lint-ignore no-explicit-any -- test assertion cast
        (f: any) => f.field === 'brewMethod',
      );
      expect(brewMethod).toBeDefined();
      expect(brewMethod.status).toBe('modified');
      expect(brewMethod.value1).toBe('v60');
      expect(brewMethod.value2).toBe('espresso_machine');
    });
  },
);
