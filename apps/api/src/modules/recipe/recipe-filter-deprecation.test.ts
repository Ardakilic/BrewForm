/**
 * Tests for the D28 deprecation signal on the recipe filter.
 *
 * Asserts that:
 *  - `tasteNoteId` (singular) only -> `deprecations.tasteNoteId === true`
 *  - `tasteNoteIds` (plural) only -> no flag
 *  - Both set (plural wins per the existing `else if`) -> no flag
 *  - Neither set -> no flag
 *
 * Also exercises the controller boundary via Hono's `app.request(...)` to
 * assert the `Deprecation: true` header is present on the response (both
 * offset and cursor modes).
 */

import '../../test-setup.ts';
import { afterEach, beforeAll, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import type { AppEnv } from '../../types/hono.ts';
import recipeRouter from './index.ts';
import * as service from './service.ts';
import { db } from '@brewform/db';
import { recipes, recipeTasteNotes, recipeVersions, tasteNotes, users } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';
import { signAccessToken } from '../auth/jwt.ts';
import { encodeCursor } from '@brewform/shared/utils';

/** Valid v4 UUID used as a placeholder taste-note ID in filter tests. */
const TEST_TASTE_NOTE_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const TEST_TASTE_NOTE_ID_2 = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

let testUserId: string;
let testUserRecord: { id: string; email: string; username: string; isAdmin: boolean };
let testRecipeVersionId: string;
let testTasteNoteId: string;
let testRecipe: { id: string; createdAt: Date };

async function createTestUser(): Promise<string> {
  const [user] = await db.insert(users).values({
    email: `d28-test-${Date.now()}@test.brewform.dev`,
    username: `d28test${Date.now() % 100000}`,
    passwordHash: 'test-hash',
  }).returning({ id: users.id });
  return user.id;
}

async function createTestRecipe(
  authorId: string,
): Promise<{ recipeId: string; versionId: string; createdAt: Date }> {
  const [recipe] = await db.insert(recipes).values({
    slug: `d28-test-recipe-${Date.now() % 100000}`,
    title: 'D28 Test Recipe',
    authorId,
    visibility: 'public',
  }).returning({ id: recipes.id, createdAt: recipes.createdAt });

  const [version] = await db.insert(recipeVersions).values({
    recipeId: recipe.id,
    versionNumber: 1,
    brewMethod: 'v60',
    drinkType: 'pour_over',
    preparationNotes: 'Test preparation notes',
  }).returning({ id: recipeVersions.id });

  await db.update(recipes).set({ currentVersionId: version.id }).where(eq(recipes.id, recipe.id));

  return { recipeId: recipe.id, versionId: version.id, createdAt: recipe.createdAt };
}

async function linkTasteNoteToRecipe(recipeVersionId: string): Promise<string> {
  const [tasteNote] = await db.insert(tasteNotes).values({
    name: 'D28 Test Taste Note',
  }).returning({ id: tasteNotes.id });

  await db.insert(recipeTasteNotes).values({
    recipeVersionId,
    tasteNoteId: tasteNote.id,
  });
  return tasteNote.id;
}

/**
 * Build a minimal Hono app mounting the recipe router with context vars
 * preset for the /recipes (optionalAuth) endpoint — anonymous access.
 */
function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    c.set('userId', null);
    c.set('user', null);
    await next();
  });
  app.route('/api/v1/recipes', recipeRouter);
  return app;
}

/**
 * Build a Hono app with a real JWT access token for the /starred endpoint,
 * which is guarded by `authMiddleware`.
 */
function createAuthedTestApp(
  user: { id: string; email: string; username: string; isAdmin: boolean },
) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
  });
  app.route('/api/v1/recipes', recipeRouter);
  return { app, token: signAccessToken(user) };
}

const opts = { sanitizeResources: false, sanitizeOps: false };

describe(
  'listRecipes deprecation flag (D28)',
  opts,
  () => {
    beforeAll(async () => {
      testUserId = await createTestUser();
      const { recipeId, versionId, createdAt } = await createTestRecipe(testUserId);
      testRecipe = { id: recipeId, createdAt };
      testRecipeVersionId = versionId;
      testTasteNoteId = await linkTasteNoteToRecipe(testRecipeVersionId);
    });

    afterEach(async () => {
      await db.delete(recipeTasteNotes).where(
        eq(recipeTasteNotes.recipeVersionId, testRecipeVersionId),
      );
      await db.delete(tasteNotes).where(eq(tasteNotes.id, testTasteNoteId));
    });

    it('sets deprecations.tasteNoteId when only the singular form is used', async () => {
      const result = await service.listRecipes(
        {
          tasteNoteId: TEST_TASTE_NOTE_ID,
          page: 1,
          perPage: 20,
          // deno-lint-ignore no-explicit-any -- test cast
          sortBy: 'createdAt' as any,
          // deno-lint-ignore no-explicit-any -- test cast
          sortOrder: 'desc' as any,
          // deno-lint-ignore no-explicit-any -- test cast
        } as any,
        1,
        20,
        null,
        false,
        'test-request-id',
      );
      expect(result.deprecations?.tasteNoteId).toBe(true);
    });

    it('does not set deprecations when only the plural form is used', async () => {
      const result = await service.listRecipes(
        {
          tasteNoteIds: TEST_TASTE_NOTE_ID,
          page: 1,
          perPage: 20,
          // deno-lint-ignore no-explicit-any -- test cast
          sortBy: 'createdAt' as any,
          // deno-lint-ignore no-explicit-any -- test cast
          sortOrder: 'desc' as any,
          // deno-lint-ignore no-explicit-any -- test cast
        } as any,
        1,
        20,
        null,
        false,
        'test-request-id',
      );
      expect(result.deprecations?.tasteNoteId).toBeFalsy();
    });

    it('does not set deprecations when both forms are provided (plural wins)', async () => {
      const result = await service.listRecipes(
        {
          tasteNoteIds: TEST_TASTE_NOTE_ID,
          tasteNoteId: TEST_TASTE_NOTE_ID_2,
          page: 1,
          perPage: 20,
          // deno-lint-ignore no-explicit-any -- test cast
          sortBy: 'createdAt' as any,
          // deno-lint-ignore no-explicit-any -- test cast
          sortOrder: 'desc' as any,
          // deno-lint-ignore no-explicit-any -- test cast
        } as any,
        1,
        20,
        null,
        false,
        'test-request-id',
      );
      expect(result.deprecations?.tasteNoteId).toBeFalsy();
    });

    it('does not set deprecations when neither form is provided', async () => {
      const result = await service.listRecipes(
        {
          page: 1,
          perPage: 20,
          // deno-lint-ignore no-explicit-any -- test cast
          sortBy: 'createdAt' as any,
          // deno-lint-ignore no-explicit-any -- test cast
          sortOrder: 'desc' as any,
          // deno-lint-ignore no-explicit-any -- test cast
        } as any,
        1,
        20,
        null,
        false,
        'test-request-id',
      );
      expect(result.deprecations?.tasteNoteId).toBeFalsy();
    });
  },
);

describe(
  'listStarredRecipes deprecation flag (D28)',
  opts,
  () => {
    beforeAll(async () => {
      if (!testUserId) {
        testUserId = await createTestUser();
        const { recipeId, versionId, createdAt } = await createTestRecipe(testUserId);
        testRecipe = { id: recipeId, createdAt };
        testRecipeVersionId = versionId;
        testTasteNoteId = await linkTasteNoteToRecipe(testRecipeVersionId);
      }
    });

    it('sets deprecations.tasteNoteId when only the singular form is used', async () => {
      const result = await service.listStarredRecipes(
        {
          tasteNoteId: TEST_TASTE_NOTE_ID,
          page: 1,
          perPage: 20,
          // deno-lint-ignore no-explicit-any -- test cast
          sortBy: 'createdAt' as any,
          // deno-lint-ignore no-explicit-any -- test cast
          sortOrder: 'desc' as any,
          // deno-lint-ignore no-explicit-any -- test cast
        } as any,
        1,
        20,
        testUserId,
        'test-request-id',
      );
      expect(result.deprecations?.tasteNoteId).toBe(true);
    });

    it('does not set deprecations when only the plural form is used', async () => {
      const result = await service.listStarredRecipes(
        {
          tasteNoteIds: TEST_TASTE_NOTE_ID,
          page: 1,
          perPage: 20,
          // deno-lint-ignore no-explicit-any -- test cast
          sortBy: 'createdAt' as any,
          // deno-lint-ignore no-explicit-any -- test cast
          sortOrder: 'desc' as any,
          // deno-lint-ignore no-explicit-any -- test cast
        } as any,
        1,
        20,
        testUserId,
        'test-request-id',
      );
      expect(result.deprecations?.tasteNoteId).toBeFalsy();
    });

    it('does not set deprecations when both forms are provided (plural wins)', async () => {
      const result = await service.listStarredRecipes(
        {
          tasteNoteIds: TEST_TASTE_NOTE_ID,
          tasteNoteId: TEST_TASTE_NOTE_ID_2,
          page: 1,
          perPage: 20,
          // deno-lint-ignore no-explicit-any -- test cast
          sortBy: 'createdAt' as any,
          // deno-lint-ignore no-explicit-any -- test cast
          sortOrder: 'desc' as any,
          // deno-lint-ignore no-explicit-any -- test cast
        } as any,
        1,
        20,
        testUserId,
        'test-request-id',
      );
      expect(result.deprecations?.tasteNoteId).toBeFalsy();
    });

    it('does not set deprecations when neither form is provided', async () => {
      const result = await service.listStarredRecipes(
        {
          page: 1,
          perPage: 20,
          // deno-lint-ignore no-explicit-any -- test cast
          sortBy: 'createdAt' as any,
          // deno-lint-ignore no-explicit-any -- test cast
          sortOrder: 'desc' as any,
          // deno-lint-ignore no-explicit-any -- test cast
        } as any,
        1,
        20,
        testUserId,
        'test-request-id',
      );
      expect(result.deprecations?.tasteNoteId).toBeFalsy();
    });
  },
);

describe(
  'Deprecation response header (D28)',
  opts,
  () => {
    it('sets Deprecation: true on /api/v1/recipes when tasteNoteId is used (offset mode)', async () => {
      const app = createTestApp();
      const res = await app.request(
        `/api/v1/recipes?tasteNoteId=${TEST_TASTE_NOTE_ID}`,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Deprecation')).toBe('true');
    });

    it('does not set Deprecation header when tasteNoteIds is used', async () => {
      const app = createTestApp();
      const res = await app.request(
        `/api/v1/recipes?tasteNoteIds=${TEST_TASTE_NOTE_ID}`,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Deprecation')).toBeNull();
    });

    it('does not set Deprecation header when no taste note filter is used', async () => {
      const app = createTestApp();
      const res = await app.request('/api/v1/recipes');
      expect(res.status).toBe(200);
      expect(res.headers.get('Deprecation')).toBeNull();
    });

    it('does not set Deprecation header on the invalid-cursor error path', async () => {
      const app = createTestApp();
      const res = await app.request(
        `/api/v1/recipes?tasteNoteId=${TEST_TASTE_NOTE_ID}&cursor=invalid&sortBy=createdAt`,
      );
      expect(res.status).toBe(400);
      expect(res.headers.get('Deprecation')).toBeNull();
    });

    it('sets Deprecation: true in cursor mode when tasteNoteId is used (success path)', async () => {
      // Build a valid cursor from the test recipe's createdAt + id.
      // This exercises the cursorPaginated branch (not the paginated branch).
      const cursor = encodeCursor({
        createdAt: testRecipe.createdAt.toISOString(),
        id: testRecipe.id,
      });
      const app = createTestApp();
      const res = await app.request(
        `/api/v1/recipes?tasteNoteId=${TEST_TASTE_NOTE_ID}&cursor=${cursor}&sortBy=createdAt`,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Deprecation')).toBe('true');
    });

    it('sets Deprecation: true on /api/v1/recipes/starred when tasteNoteId is used (with auth)', async () => {
      if (!testUserRecord) {
        const [user] = await db.select().from(users).where(eq(users.id, testUserId)).limit(1);
        testUserRecord = {
          id: user.id,
          email: user.email,
          username: user.username,
          isAdmin: user.isAdmin,
        };
      }
      const { app, token } = createAuthedTestApp(testUserRecord);
      const res = await app.request(
        `/api/v1/recipes/starred?tasteNoteId=${TEST_TASTE_NOTE_ID}`,
        { headers: { Authorization: `Bearer ${await token}` } },
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Deprecation')).toBe('true');
    });

    it('does not set Deprecation header on /api/v1/recipes/starred when tasteNoteIds is used', async () => {
      if (!testUserRecord) {
        const [user] = await db.select().from(users).where(eq(users.id, testUserId)).limit(1);
        testUserRecord = {
          id: user.id,
          email: user.email,
          username: user.username,
          isAdmin: user.isAdmin,
        };
      }
      const { app, token } = createAuthedTestApp(testUserRecord);
      const res = await app.request(
        `/api/v1/recipes/starred?tasteNoteIds=${TEST_TASTE_NOTE_ID}`,
        { headers: { Authorization: `Bearer ${await token}` } },
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Deprecation')).toBeNull();
    });
  },
);
