// deno-lint-ignore-file no-explicit-any require-await

/**
 * Route-level integration tests for cursor pagination on GET /api/v1/follow/feed.
 *
 * These tests mount the real follow router on a stub Hono app that sets
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
import { recipes, userFollows, users } from '@brewform/db/schema';
import { inArray } from 'drizzle-orm';
import followRouter from './index.ts';
import { encodeCursor } from '@brewform/shared/utils';
import { signAccessToken } from '../auth/jwt.ts';

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

function createTestApp(_userId: string) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
  });
  app.route('/api/v1/follow', followRouter);
  return app;
}

async function authedRequest(
  app: ReturnType<typeof createTestApp>,
  path: string,
  userId: string,
  init?: RequestInit,
) {
  const token = await signAccessToken({
    id: userId,
    email: `feed-route-${userId}@example.com`,
    username: `feed-route-${userId.slice(0, 8)}`,
    isAdmin: false,
  });
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return app.request(path, { ...init, headers });
}

describe(
  { name: 'Follow routes — feed cursor pagination', sanitizeResources: false, sanitizeOps: false },
  () => {
    let follower: typeof users.$inferSelect;
    let author: typeof users.$inferSelect;
    const createdRecipes: string[] = [];
    const createdUsers: string[] = [];
    const createdFollows: string[] = [];

    beforeAll(async () => {
      follower = await createUser('feed-route-follower');
      author = await createUser('feed-route-author');
      createdUsers.push(follower.id, author.id);

      const [follow] = await db.insert(userFollows).values({
        followerId: follower.id,
        followingId: author.id,
      }).returning();
      createdFollows.push(follow.id);
    });

    afterEach(async () => {
      if (createdRecipes.length) {
        await db.delete(recipes).where(inArray(recipes.id, createdRecipes));
        createdRecipes.length = 0;
      }
    });

    afterAll(async () => {
      if (createdFollows.length) {
        await db.delete(userFollows).where(inArray(userFollows.id, createdFollows));
      }
      if (createdRecipes.length) {
        await db.delete(recipes).where(inArray(recipes.id, createdRecipes));
      }
      if (createdUsers.length) {
        await db.delete(users).where(inArray(users.id, createdUsers));
      }
    });

    it('returns a cursor-envelope response when a valid cursor is provided', async () => {
      const r1 = await createRecipe(author.id, 'Feed Older', new Date('2026-10-01T00:00:00.000Z'));
      const r2 = await createRecipe(author.id, 'Feed Newer', new Date('2026-10-02T00:00:00.000Z'));
      createdRecipes.push(r1.id, r2.id);

      const app = createTestApp(follower.id);
      const cursor = encodeCursor({ createdAt: r2.createdAt.toISOString(), id: r2.id });
      const res = await authedRequest(
        app,
        `/api/v1/follow/feed?cursor=${cursor}&perPage=10`,
        follower.id,
      );
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
      const app = createTestApp(follower.id);
      const res = await authedRequest(app, '/api/v1/follow/feed?cursor=!!!invalid!!!', follower.id);
      const body = await res.json() as any;

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('INVALID_CURSOR');
    });

    it('returns offset pagination (meta.pagination) when no cursor is provided', async () => {
      const r = await createRecipe(author.id, 'Feed Offset', new Date('2026-11-01T00:00:00.000Z'));
      createdRecipes.push(r.id);

      const app = createTestApp(follower.id);
      const res = await authedRequest(app, '/api/v1/follow/feed?page=1&perPage=10', follower.id);
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.meta).toBeDefined();
      expect(body.meta.pagination).toBeDefined();
      expect(body.meta.pagination.page).toBe(1);
      expect(body.meta.pagination.perPage).toBe(10);
      expect(typeof body.meta.pagination.total).toBe('number');
      expect(typeof body.meta.pagination.totalPages).toBe('number');
      expect(body.meta.cursor).toBeUndefined();
    });

    it('returns empty data with total: 0 when the user follows no one', async () => {
      const loner = await createUser('feed-route-loner');
      createdUsers.push(loner.id);

      const app = createTestApp(loner.id);
      const res = await authedRequest(app, '/api/v1/follow/feed?page=1&perPage=10', loner.id);
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.meta).toBeDefined();
      expect(body.meta.pagination).toBeDefined();
      expect(body.meta.pagination.total).toBe(0);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toEqual([]);
    });
  },
);
