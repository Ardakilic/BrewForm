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
import { afterAll, afterEach, beforeAll, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import type { AppEnv } from '../../types/hono.ts';
import { db } from '@brewform/db';
import { recipes, users } from '@brewform/db/schema';
import { eq, inArray } from 'drizzle-orm';
import recipeRouter from './index.ts';
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

function createTestApp(userId: string | null) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    if (userId) {
      c.set('userId', userId);
      c.set('user', { id: userId, isAdmin: false } as any);
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
