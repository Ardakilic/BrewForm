// deno-lint-ignore-file no-explicit-any require-await

/**
 * Route-level integration tests for cursor pagination on GET /api/v1/recipes.
 *
 * These tests mount the real recipe router on a stub Hono app that sets
 * context variables (requestId, userId, user) and exercise the full HTTP
 * stack including Zod validation, service dispatch, and envelope response
 * shaping against a PostgreSQL test database.
 */

import '../../test-setup.ts';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { AppEnv } from '../../types/hono.ts';
import { db } from '@brewform/db';
import {
  equipment,
  recipes,
  recipeVersions,
  tasteNotes,
  userBadges,
  users,
} from '@brewform/db/schema';
import { eq, inArray } from 'drizzle-orm';
import recipeRouter, { deps } from './index.ts';
import { encodeCursor } from '@brewform/shared/utils';

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

async function createRecipe(authorId: string, title: string, createdAt: Date) {
  const id = crypto.randomUUID();
  const [recipe] = await db.insert(recipes).values({
    id,
    slug: `slug-${id.slice(0, 8)}`,
    title,
    authorId,
    visibility: 'public',
    createdAt,
  }).returning();
  return recipe;
}

/**
 * Deletes a test user together with any badges awarded to them.
 *
 * Creating a recipe through the HTTP route triggers fire-and-forget badge
 * evaluation (see recipe `service.ts`), so a `user_badge` row can be inserted
 * asynchronously after the response returns — sometimes after a naive teardown
 * has already cleared the user's badges, which then blocks the user delete on
 * the `user_badge` foreign key. This drains that race by re-clearing badges and
 * retrying the user delete until no late async insert remains.
 *
 * @param userId The id of the user to remove.
 */
async function deleteUserWithBadges(userId: string): Promise<void> {
  for (let attempt = 0;; attempt++) {
    await db.delete(userBadges).where(eq(userBadges.userId, userId));
    try {
      await db.delete(users).where(eq(users.id, userId));
      return;
    } catch (err) {
      if (attempt >= 9) throw err;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
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
      } as any);
    }
    await next();
  });
  app.route('/api/v1/recipes', recipeRouter);
  return app;
}

describe(
  { name: 'Recipe routes — cursor pagination', sanitizeResources: false, sanitizeOps: false },
  () => {
    let author: typeof users.$inferSelect;
    const createdRecipes: string[] = [];

    beforeAll(async () => {
      author = await createUser('cursor-route');
    });

    afterEach(async () => {
      if (createdRecipes.length) {
        await db.delete(recipes).where(inArray(recipes.id, createdRecipes));
        createdRecipes.length = 0;
      }
    });

    afterAll(async () => {
      if (createdRecipes.length) {
        await db.delete(recipes).where(inArray(recipes.id, createdRecipes));
      }
      await db.delete(users).where(eq(users.id, author.id));
    });

    it('returns a cursor-envelope response when a valid cursor is provided', async () => {
      const r1 = await createRecipe(author.id, 'Older', new Date('2026-07-01T00:00:00.000Z'));
      const r2 = await createRecipe(author.id, 'Newer', new Date('2026-07-02T00:00:00.000Z'));
      createdRecipes.push(r1.id, r2.id);

      const app = createTestApp(author.id);
      const cursor = encodeCursor({ createdAt: r2.createdAt.toISOString(), id: r2.id });
      const res = await app.request(`/api/v1/recipes?cursor=${cursor}&perPage=10`);
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.meta).toBeDefined();
      expect(body.meta.cursor).toBeDefined();
      expect(body.meta.pagination).toBeUndefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.some((r: any) => r.id === r1.id)).toBe(true);
    });

    it('returns 400 INVALID_CURSOR when the cursor is malformed base64', async () => {
      const app = createTestApp(author.id);
      const res = await app.request('/api/v1/recipes?cursor=!!!invalid!!!');
      const body = await res.json() as any;

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('INVALID_CURSOR');
    });

    it('uses cursor pagination when both cursor and page are provided (cursor wins)', async () => {
      const r1 = await createRecipe(
        author.id,
        'MutExcl Older',
        new Date('2026-08-01T00:00:00.000Z'),
      );
      const r2 = await createRecipe(
        author.id,
        'MutExcl Newer',
        new Date('2026-08-02T00:00:00.000Z'),
      );
      createdRecipes.push(r1.id, r2.id);

      const app = createTestApp(author.id);
      const cursor = encodeCursor({ createdAt: r2.createdAt.toISOString(), id: r2.id });
      const res = await app.request(`/api/v1/recipes?cursor=${cursor}&page=5&perPage=10`);
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.meta.cursor).toBeDefined();
      expect(body.meta.pagination).toBeUndefined();
    });

    it('returns empty data with hasMore=false and nextCursor=null when cursor yields no results', async () => {
      const r = await createRecipe(author.id, 'Boundary', new Date('2026-09-01T00:00:00.000Z'));
      createdRecipes.push(r.id);

      const app = createTestApp(author.id);
      const pastCursor = encodeCursor({
        createdAt: new Date('2000-01-01T00:00:00.000Z').toISOString(),
        id: r.id,
      });
      const res = await app.request(`/api/v1/recipes?cursor=${pastCursor}`);
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.meta.cursor).toBeDefined();
      expect(body.meta.cursor.hasMore).toBe(false);
      expect(body.meta.cursor.nextCursor).toBeNull();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    it('returns offset pagination (meta.pagination) when no cursor is provided', async () => {
      const r = await createRecipe(author.id, 'Offset Mode', new Date('2026-10-01T00:00:00.000Z'));
      createdRecipes.push(r.id);

      const app = createTestApp(author.id);
      const res = await app.request('/api/v1/recipes?page=1&perPage=10');
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.meta).toBeDefined();
      expect(body.meta.pagination).toBeDefined();
      expect(body.meta.cursor).toBeUndefined();
    });
  },
);

describe(
  { name: 'POST /api/v1/recipes — create', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    let tasteNoteId: string;
    let equipmentId: string;
    const createdRecipeIds: string[] = [];

    beforeEach(async () => {
      user = await createUser('create-route');
      tasteNoteId = crypto.randomUUID();
      await db.insert(tasteNotes).values({ id: tasteNoteId, name: 'Chocolate' });
      equipmentId = crypto.randomUUID();
      await db.insert(equipment).values({ id: equipmentId, name: 'V60 Grinder', type: 'grinder' });
    });

    afterEach(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      if (createdRecipeIds.length) {
        await db.delete(recipeVersions).where(inArray(recipeVersions.recipeId, createdRecipeIds));
        await db.delete(recipes).where(inArray(recipes.id, createdRecipeIds));
        createdRecipeIds.length = 0;
      }
      await db.delete(tasteNotes).where(eq(tasteNotes.id, tasteNoteId));
      await db.delete(equipment).where(eq(equipment.id, equipmentId));
      await deleteUserWithBadges(user.id);
    });

    it('creates a recipe and returns 201 with the rich shape', async () => {
      const app = createTestApp(user.id);
      const res = await app.request('/api/v1/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'HTTP Integration Test Recipe',
          visibility: 'draft',
          brewMethod: 'v60',
          drinkType: 'pour_over',
          preparationNotes: 'Bloom 45s, then pour in stages',
          personalNotes: 'Tasted great',
          tasteNoteIds: [tasteNoteId],
          equipmentIds: [equipmentId],
        }),
      });
      const body = await res.json() as any;

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.author.id).toBe(user.id);
      expect(Array.isArray(body.data.versions[0].tasteNotes)).toBe(true);
      expect(body.data.versions[0].tasteNotes.length).toBeGreaterThan(0);
      expect(body.data.versions[0].tasteNotes[0].tasteNote).toBeDefined();
      expect(Array.isArray(body.data.versions[0].equipment)).toBe(true);
      expect(body.data.versions[0].equipment.length).toBeGreaterThan(0);
      expect(body.data.versions[0].equipment[0].equipment).toBeDefined();
      expect(body.data.currentVersionId).toBe(body.data.versions[0].id);

      createdRecipeIds.push(body.data.id);
    });

    it('returns 403 when email is not verified', async () => {
      const app = createTestApp(user.id, false);
      const res = await app.request('/api/v1/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'HTTP Integration Test Recipe',
          visibility: 'draft',
          brewMethod: 'v60',
          drinkType: 'pour_over',
          preparationNotes: 'Bloom 45s, then pour in stages',
          personalNotes: 'Tasted great',
          tasteNoteIds: [tasteNoteId],
          equipmentIds: [equipmentId],
        }),
      });
      const body = await res.json() as any;

      expect(res.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('returns 400 when the body fails validation', async () => {
      const app = createTestApp(user.id);
      const res = await app.request('/api/v1/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'HTTP Integration Test Recipe',
          visibility: 'draft',
          drinkType: 'pour_over',
          preparationNotes: 'Bloom 45s, then pour in stages',
        }),
      });
      const body = await res.json() as any;

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
    });
  },
);
