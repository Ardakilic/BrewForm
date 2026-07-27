/**
 * Route-level integration tests for the collection module.
 *
 * Mounts the real collection router on a stub Hono app that sets the
 * context variables (requestId, userId, user) and stubs the auth
 * middleware via the `deps` proxy, then exercises the full HTTP stack
 * (Zod validation, service dispatch, envelope response shaping) against
 * a PostgreSQL test database.
 */

import '../../test-setup.ts';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { AppEnv } from '../../types/hono.ts';
import { db } from '@brewform/db';
import { collectionItems, collections, recipes, users } from '@brewform/db/schema';
import { eq, inArray } from 'drizzle-orm';
import collectionRouter, { deps } from './index.ts';
import { logger } from './service.ts';
import { spy } from 'jsr:@std/testing/mock';
import { cacheProvider, setCacheProvider } from '../../utils/cache/singleton.ts';
import { type CacheProvider, InMemoryCacheProvider } from '../../utils/cache/index.ts';

const stubAuth = async (_c: Context, next: Next) => {
  await next();
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
  app.route('/api/v1/collections', collectionRouter);
  return app;
}

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

async function createRecipe(authorId: string, visibility = 'public') {
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

async function createCollectionRow(
  userId: string,
  name: string,
  visibility: 'private' | 'public' | 'draft' | 'unlisted' = 'private',
) {
  const id = crypto.randomUUID();
  const [col] = await db.insert(collections).values({
    id,
    userId,
    name,
    visibility,
  }).returning();
  return col;
}

async function cleanupCollections(collectionIds: string[]) {
  if (collectionIds.length === 0) return;
  await db.delete(collectionItems).where(inArray(collectionItems.collectionId, collectionIds));
  await db.delete(collections).where(inArray(collections.id, collectionIds));
}

async function cleanupRecipes(recipeIds: string[]) {
  if (recipeIds.length === 0) return;
  await db.delete(collectionItems).where(inArray(collectionItems.recipeId, recipeIds));
  await db.delete(recipes).where(inArray(recipes.id, recipeIds));
}

async function cleanupUsers(userIds: string[]) {
  if (userIds.length === 0) return;
  const userCollIds = await db.select({ id: collections.id }).from(collections).where(
    inArray(collections.userId, userIds),
  );
  if (userCollIds.length) {
    await db.delete(collectionItems).where(
      inArray(collectionItems.collectionId, userCollIds.map((r) => r.id)),
    );
    await db.delete(collections).where(inArray(collections.id, userCollIds.map((r) => r.id)));
  }
  await db.delete(recipes).where(inArray(recipes.authorId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
}

describe(
  {
    name: 'GET /api/v1/collections — list my collections',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let user: typeof users.$inferSelect;
    let listA: typeof collections.$inferSelect;
    const colIds: string[] = [];
    const recipeIds: string[] = [];

    beforeAll(async () => {
      user = await createUser('route-list');
      listA = await createCollectionRow(user.id, 'List A', 'private');
      const c2 = await createCollectionRow(user.id, 'List B', 'public');
      colIds.push(listA.id, c2.id);
    });

    afterAll(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
      await cleanupCollections(colIds);
      await cleanupRecipes(recipeIds);
      await cleanupUsers([user.id]);
    });

    it('returns paginated own collections with success envelope', async () => {
      const app = createTestApp(user.id);
      const res = await app.request('/api/v1/collections?page=1&perPage=10');
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(2);
      expect(body.meta.pagination).toBeDefined();
      expect(body.meta.pagination.total).toBe(2);
      for (const c of body.data) {
        expect(c.userId).toBe(user.id);
        expect(typeof c.recipeCount).toBe('number');
      }
    });

    it('respects the visibility query filter', async () => {
      const app = createTestApp(user.id);
      const res = await app.request('/api/v1/collections?visibility=public');
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.length).toBe(1);
      expect(body.data[0].visibility).toBe('public');
    });

    it('wires the recipeId query param through to containsRecipe flags', async () => {
      const recipe = await createRecipe(user.id);
      recipeIds.push(recipe.id);
      // Only 'List A' contains the recipe
      await db.insert(collectionItems).values({
        collectionId: listA.id,
        recipeId: recipe.id,
        sortOrder: 0,
      });

      const app = createTestApp(user.id);
      const res = await app.request(`/api/v1/collections?recipeId=${recipe.id}`);
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.length).toBe(2);
      // deno-lint-ignore no-explicit-any -- test mock
      const byName = new Map(body.data.map((c: any) => [c.name, c]));
      expect(byName.get('List A').containsRecipe).toBe(true);
      expect(byName.get('List B').containsRecipe).toBe(false);
    });
  },
);

describe(
  {
    name: 'GET /api/v1/collections/:id — visibility',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let userA: typeof users.$inferSelect;
    let userB: typeof users.$inferSelect;
    let publicCol: typeof collections.$inferSelect;
    let privateCol: typeof collections.$inferSelect;
    const colIds: string[] = [];

    beforeAll(async () => {
      userA = await createUser('route-get-a');
      userB = await createUser('route-get-b');
      publicCol = await createCollectionRow(userA.id, 'Public', 'public');
      privateCol = await createCollectionRow(userA.id, 'Private', 'private');
      colIds.push(publicCol.id, privateCol.id);
    });

    afterAll(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
      await cleanupCollections(colIds);
      await cleanupUsers([userA.id, userB.id]);
    });

    it('returns 403 for private collection by non-owner', async () => {
      const app = createTestApp(userB.id);
      const res = await app.request(`/api/v1/collections/${privateCol.id}`);
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 for private collection by unauthenticated user', async () => {
      const app = createTestApp(null);
      const res = await app.request(`/api/v1/collections/${privateCol.id}`);
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('returns 200 for public collection by anyone', async () => {
      const app = createTestApp(userB.id);
      const res = await app.request(`/api/v1/collections/${publicCol.id}`);
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(publicCol.id);
      expect(body.data.visibility).toBe('public');
      expect(body.data.author).toBeDefined();
      expect(Array.isArray(body.data.items)).toBe(true);
    });

    it('returns 200 for public collection by unauthenticated user', async () => {
      const app = createTestApp(null);
      const res = await app.request(`/api/v1/collections/${publicCol.id}`);
      expect(res.status).toBe(200);
    });

    it('returns 200 for private collection by owner', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(`/api/v1/collections/${privateCol.id}`);
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent collection', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(`/api/v1/collections/${crypto.randomUUID()}`);
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  },
);

describe(
  { name: 'POST /api/v1/collections — create', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    const colIds: string[] = [];

    beforeAll(async () => {
      user = await createUser('route-create');
    });

    afterEach(async () => {
      await cleanupCollections(colIds);
      colIds.length = 0;
    });

    afterAll(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
      await cleanupUsers([user.id]);
    });

    it('returns 201 with the created collection', async () => {
      const app = createTestApp(user.id);
      const res = await app.request('/api/v1/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My V60s', visibility: 'public' }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('My V60s');
      expect(body.data.visibility).toBe('public');
      expect(body.data.userId).toBe(user.id);
      expect(body.data.author).toBeDefined();
      expect(body.data.author.username).toBe(user.username);
      colIds.push(body.data.id);
    });

    it('defaults visibility to private when omitted', async () => {
      const app = createTestApp(user.id);
      const res = await app.request('/api/v1/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Default Private' }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(201);
      expect(body.data.visibility).toBe('private');
      colIds.push(body.data.id);
    });

    it('returns 400 on invalid body (missing name)', async () => {
      const app = createTestApp(user.id);
      const res = await app.request('/api/v1/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'public' }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
    });
  },
);

describe(
  { name: 'PATCH /api/v1/collections/:id — update', sanitizeResources: false, sanitizeOps: false },
  () => {
    let userA: typeof users.$inferSelect;
    let userB: typeof users.$inferSelect;
    let colA: typeof collections.$inferSelect;
    const colIds: string[] = [];

    beforeAll(async () => {
      userA = await createUser('route-update-a');
      userB = await createUser('route-update-b');
      colA = await createCollectionRow(userA.id, 'Original', 'private');
      colIds.push(colA.id);
    });

    afterAll(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
      await cleanupCollections(colIds);
      await cleanupUsers([userA.id, userB.id]);
    });

    it('returns 200 for owner with updated shape', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(`/api/v1/collections/${colA.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Renamed', visibility: 'public' }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Renamed');
      expect(body.data.visibility).toBe('public');
    });

    it('returns 403 for non-owner', async () => {
      const app = createTestApp(userB.id);
      const res = await app.request(`/api/v1/collections/${colA.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'hacked' }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('returns 404 for non-existent collection', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(`/api/v1/collections/${crypto.randomUUID()}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x' }),
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
  { name: 'DELETE /api/v1/collections/:id — delete', sanitizeResources: false, sanitizeOps: false },
  () => {
    let userA: typeof users.$inferSelect;
    let userB: typeof users.$inferSelect;
    let colOwned: typeof collections.$inferSelect;
    let colOther: typeof collections.$inferSelect;
    const colIds: string[] = [];

    beforeAll(async () => {
      userA = await createUser('route-del-a');
      userB = await createUser('route-del-b');
      colOwned = await createCollectionRow(userA.id, 'Owned', 'private');
      colOther = await createCollectionRow(userB.id, 'Other', 'private');
      colIds.push(colOwned.id, colOther.id);
    });

    afterAll(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
      await cleanupCollections(colIds);
      await cleanupUsers([userA.id, userB.id]);
    });

    it('returns 200 for owner', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(`/api/v1/collections/${colOwned.id}`, { method: 'DELETE' });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.message).toBeDefined();
    });

    it('returns 403 for non-owner', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(`/api/v1/collections/${colOther.id}`, { method: 'DELETE' });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('returns 404 for non-existent collection', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(`/api/v1/collections/${crypto.randomUUID()}`, {
        method: 'DELETE',
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
    name: 'POST /api/v1/collections/:id/recipes — add recipe',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let userA: typeof users.$inferSelect;
    let userB: typeof users.$inferSelect;
    let col: typeof collections.$inferSelect;
    let publicRecipe: typeof recipes.$inferSelect;
    let privateRecipe: typeof recipes.$inferSelect;
    const colIds: string[] = [];
    const recipeIds: string[] = [];

    beforeAll(async () => {
      userA = await createUser('route-add-a');
      userB = await createUser('route-add-b');
      col = await createCollectionRow(userA.id, 'AddCol', 'public');
      colIds.push(col.id);
      publicRecipe = await createRecipe(userB.id, 'public');
      privateRecipe = await createRecipe(userB.id, 'private');
      recipeIds.push(publicRecipe.id, privateRecipe.id);
    });

    afterAll(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
      await cleanupCollections(colIds);
      await cleanupRecipes(recipeIds);
      await cleanupUsers([userA.id, userB.id]);
    });

    it('returns 201 when adding a public recipe', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(`/api/v1/collections/${col.id}/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: publicRecipe.id }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.message).toBeDefined();
    });

    it('returns 409 for duplicate add', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(`/api/v1/collections/${col.id}/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: publicRecipe.id }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(409);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('CONFLICT');
    });

    it('returns 403 for private recipe by non-owner', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(`/api/v1/collections/${col.id}/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: privateRecipe.id }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('returns 404 for non-existent recipe', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(`/api/v1/collections/${col.id}/recipes`, {
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

    it('returns 400 for invalid body (missing recipeId)', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(`/api/v1/collections/${col.id}/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  },
);

describe(
  {
    name: 'DELETE /api/v1/collections/:id/recipes/:recipeId — remove recipe',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let userA: typeof users.$inferSelect;
    let userB: typeof users.$inferSelect;
    let col: typeof collections.$inferSelect;
    let r1: typeof recipes.$inferSelect;
    const colIds: string[] = [];
    const recipeIds: string[] = [];

    beforeAll(async () => {
      userA = await createUser('route-rem-a');
      userB = await createUser('route-rem-b');
      col = await createCollectionRow(userA.id, 'RemCol', 'public');
      colIds.push(col.id);
      r1 = await createRecipe(userB.id, 'public');
      recipeIds.push(r1.id);
      await db.insert(collectionItems).values({
        collectionId: col.id,
        recipeId: r1.id,
        sortOrder: 0,
      });
    });

    afterAll(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
      await cleanupCollections(colIds);
      await cleanupRecipes(recipeIds);
      await cleanupUsers([userA.id, userB.id]);
    });

    it('returns 200 for owner', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(
        `/api/v1/collections/${col.id}/recipes/${r1.id}`,
        { method: 'DELETE' },
      );
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.message).toBeDefined();
    });

    it('returns 403 for non-owner', async () => {
      // re-add the item so the delete has something to remove
      await db.insert(collectionItems).values({
        collectionId: col.id,
        recipeId: r1.id,
        sortOrder: 0,
      }).onConflictDoNothing();
      const app = createTestApp(userB.id);
      const res = await app.request(
        `/api/v1/collections/${col.id}/recipes/${r1.id}`,
        { method: 'DELETE' },
      );
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('returns 404 for non-existent collection', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request(
        `/api/v1/collections/${crypto.randomUUID()}/recipes/${r1.id}`,
        { method: 'DELETE' },
      );
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
    name: 'PATCH /api/v1/collections/:id/reorder — reorder',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let user: typeof users.$inferSelect;
    let col: typeof collections.$inferSelect;
    let r1: typeof recipes.$inferSelect;
    let r2: typeof recipes.$inferSelect;
    let r3: typeof recipes.$inferSelect;
    let itemIds: string[];
    const colIds: string[] = [];
    const recipeIds: string[] = [];

    beforeAll(async () => {
      user = await createUser('route-reorder');
      col = await createCollectionRow(user.id, 'Reorder', 'public');
      colIds.push(col.id);
      r1 = await createRecipe(user.id, 'public');
      r2 = await createRecipe(user.id, 'public');
      r3 = await createRecipe(user.id, 'public');
      recipeIds.push(r1.id, r2.id, r3.id);
      const i1 = await db.insert(collectionItems).values({
        collectionId: col.id,
        recipeId: r1.id,
        sortOrder: 0,
      }).returning();
      const i2 = await db.insert(collectionItems).values({
        collectionId: col.id,
        recipeId: r2.id,
        sortOrder: 1,
      }).returning();
      const i3 = await db.insert(collectionItems).values({
        collectionId: col.id,
        recipeId: r3.id,
        sortOrder: 2,
      }).returning();
      itemIds = [i1[0].id, i2[0].id, i3[0].id];
    });

    afterAll(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
      await cleanupCollections(colIds);
      await cleanupRecipes(recipeIds);
      await cleanupUsers([user.id]);
    });

    it('returns 200 with correct full order', async () => {
      const reordered = [itemIds[2], itemIds[1], itemIds[0]];
      const app = createTestApp(user.id);
      const res = await app.request(`/api/v1/collections/${col.id}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: reordered }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.message).toBeDefined();
    });

    it('returns 400 for mismatched count', async () => {
      const app = createTestApp(user.id);
      const res = await app.request(`/api/v1/collections/${col.id}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: [itemIds[0], itemIds[1]] }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('BAD_REQUEST');
    });

    it('returns 400 for foreign item ID', async () => {
      const app = createTestApp(user.id);
      const res = await app.request(`/api/v1/collections/${col.id}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: [itemIds[0], itemIds[1], crypto.randomUUID()] }),
      });
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('BAD_REQUEST');
    });

    it('returns 403 for non-owner', async () => {
      const other = await createUser('route-reorder-other');
      try {
        const app = createTestApp(other.id);
        const res = await app.request(`/api/v1/collections/${col.id}/reorder`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemIds: [itemIds[0], itemIds[1], itemIds[2]] }),
        });
        // deno-lint-ignore no-explicit-any -- test assertion cast
        const body = await res.json() as any;

        expect(res.status).toBe(403);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('FORBIDDEN');
      } finally {
        await db.delete(users).where(eq(users.id, other.id));
      }
    });

    it('returns 404 for non-existent collection', async () => {
      const app = createTestApp(user.id);
      const res = await app.request(`/api/v1/collections/${crypto.randomUUID()}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: [itemIds[0], itemIds[1], itemIds[2]] }),
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
    name: 'GET /api/v1/collections/public — browse all public collections',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let userA: typeof users.$inferSelect;
    let userB: typeof users.$inferSelect;
    const colIds: string[] = [];

    beforeAll(async () => {
      userA = await createUser('route-public-a');
      userB = await createUser('route-public-b');
      const aPub = await createCollectionRow(userA.id, 'A Pub', 'public');
      const aPriv = await createCollectionRow(userA.id, 'A Priv', 'private');
      const bPub = await createCollectionRow(userB.id, 'B Pub', 'public');
      const bDraft = await createCollectionRow(userB.id, 'B Draft', 'draft');
      colIds.push(aPub.id, aPriv.id, bPub.id, bDraft.id);
    });

    afterAll(async () => {
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
      await cleanupCollections(colIds);
      await cleanupUsers([userA.id, userB.id]);
    });

    it('returns 200 with paginated public collections (no auth required)', async () => {
      const app = createTestApp(null);
      const res = await app.request('/api/v1/collections/public?page=1&perPage=10');
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta.pagination).toBeDefined();
      // The DB may contain seed public collections; verify our test ones are present
      // deno-lint-ignore no-explicit-any -- test mock
      const names = body.data.map((c: any) => c.name);
      expect(names).toContain('A Pub');
      expect(names).toContain('B Pub');
      expect(names).not.toContain('A Priv');
      expect(names).not.toContain('B Draft');
      for (const c of body.data) {
        expect(c.visibility).toBe('public');
        expect(c.author).toBeDefined();
        expect(typeof c.author.username).toBe('string');
        expect(c.author).toHaveProperty('displayName');
        expect(c.author).toHaveProperty('avatarUrl');
        expect(typeof c.recipeCount).toBe('number');
      }
    });

    it('excludes private and draft collections', async () => {
      const app = createTestApp(null);
      const res = await app.request('/api/v1/collections/public');
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      for (const c of body.data) {
        expect(c.visibility).not.toBe('private');
        expect(c.visibility).not.toBe('draft');
      }
    });

    it('is reachable by authenticated users too', async () => {
      const app = createTestApp(userA.id);
      const res = await app.request('/api/v1/collections/public?page=1&perPage=10');
      // deno-lint-ignore no-explicit-any -- test assertion cast
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      // Same as unauthenticated: our test public collections should be present
      // deno-lint-ignore no-explicit-any -- test mock
      const names = body.data.map((c: any) => c.name);
      expect(names).toContain('A Pub');
      expect(names).toContain('B Pub');
    });
  },
);

describe(
  {
    name: 'GET /api/v1/collections/:id — cache behaviour',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let user: typeof users.$inferSelect;
    let originalCache: CacheProvider;
    const colIds: string[] = [];

    beforeEach(async () => {
      originalCache = cacheProvider;
      setCacheProvider(new InMemoryCacheProvider());
      user = await createUser('route-cache');
    });

    afterEach(async () => {
      setCacheProvider(originalCache);
      deps.authMiddleware = originalAuthMiddleware;
      deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
      await cleanupCollections(colIds);
      colIds.length = 0;
      await cleanupUsers([user.id]);
    });

    it('serves a repeated GET from the cache with an identical payload', async () => {
      const col = await createCollectionRow(user.id, 'Cached', 'public');
      colIds.push(col.id);
      const app = createTestApp(user.id);
      const res1 = await app.request(`/api/v1/collections/${col.id}`);
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      const debugSpy = spy(logger, 'debug');
      try {
        const res2 = await app.request(`/api/v1/collections/${col.id}`);
        expect(res2.status).toBe(200);
        const body2 = await res2.json();
        // meta.requestId legitimately differs per request; the payload must be identical.
        expect(body2.data).toEqual(body1.data);
        const hit = debugSpy.calls.find((call) => call.args[1] === 'getCollection cache hit');
        expect(hit).toBeDefined();
      } finally {
        debugSpy.restore();
      }
    });

    it('returns 403 for anonymous on a private collection before AND after the owner warms the cache', async () => {
      const col = await createCollectionRow(user.id, 'Private', 'private');
      colIds.push(col.id);
      const anonApp = createTestApp(null);
      const before = await anonApp.request(`/api/v1/collections/${col.id}`);
      expect(before.status).toBe(403);
      const ownerApp = createTestApp(user.id);
      const warm = await ownerApp.request(`/api/v1/collections/${col.id}`);
      expect(warm.status).toBe(200);
      const after = await anonApp.request(`/api/v1/collections/${col.id}`);
      expect(after.status).toBe(403);
    });
  },
);
