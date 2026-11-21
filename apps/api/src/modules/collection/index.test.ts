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
import { db } from '@brewform/db';
import { collectionItems, collections, recipes, users } from '@brewform/db/schema';
import { eq, inArray } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../types/hono.ts';
import { type CacheProvider, InMemoryCacheProvider } from '../../utils/cache/index.ts';
import { cacheProvider, setCacheProvider } from '../../utils/cache/singleton.ts';
import recipeRouter, { deps as recipeDeps } from '../recipe/index.ts';
import collectionRouter, { deps, userCollections } from './index.ts';
import { logger } from './service.ts';

const stubAuth: typeof deps.authMiddleware = async (_c: Context, next: Next) => {
  await next();
};
// optionalAuthMiddleware returns void, so it needs its own stub shape.
const stubOptionalAuth = async (_c: Context, next: Next) => {
  await next();
};
const originalAuthMiddleware = deps.authMiddleware;
const originalOptionalAuthMiddleware = deps.optionalAuthMiddleware;

function createTestApp(userId: string | null) {
  deps.authMiddleware = stubAuth;
  deps.optionalAuthMiddleware = stubOptionalAuth;
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    if (userId) {
      c.set('userId', userId);
      c.set('user', {
        id: userId,
        isAdmin: false,
        emailVerifiedAt: new Date(),
        // biome-ignore lint/suspicious/noExplicitAny: test mock request body
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
  const [user] = await db
    .insert(users)
    .values({
      id,
      email: `${prefix}-${id}@example.com`,
      username: `${prefix}-${id.slice(0, 8)}`,
      passwordHash: 'hash',
    })
    .returning();
  return user;
}

async function createRecipe(
  authorId: string,
  visibility: 'private' | 'public' | 'draft' | 'unlisted' = 'public',
) {
  const id = crypto.randomUUID();
  const [recipe] = await db
    .insert(recipes)
    .values({
      id,
      slug: `slug-${id.slice(0, 8)}`,
      title: `Recipe ${id.slice(0, 4)}`,
      authorId,
      visibility,
      createdAt: new Date(),
    })
    .returning();
  return recipe;
}

async function createCollectionRow(
  userId: string,
  name: string,
  visibility: 'private' | 'public' | 'draft' | 'unlisted' = 'private',
) {
  const id = crypto.randomUUID();
  const [col] = await db
    .insert(collections)
    .values({
      id,
      userId,
      name,
      visibility,
    })
    .returning();
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
  const userCollIds = await db
    .select({ id: collections.id })
    .from(collections)
    .where(inArray(collections.userId, userIds));
  if (userCollIds.length) {
    await db.delete(collectionItems).where(
      inArray(
        collectionItems.collectionId,
        userCollIds.map((r) => r.id),
      ),
    );
    await db.delete(collections).where(
      inArray(
        collections.id,
        userCollIds.map((r) => r.id),
      ),
    );
  }
  await db.delete(recipes).where(inArray(recipes.authorId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
}

describe('GET /api/v1/collections — list my collections', () => {
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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(2);
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const byName = new Map<string, any>(body.data.map((c: any) => [c.name, c]));
    expect(byName.get('List A').containsRecipe).toBe(true);
    expect(byName.get('List B').containsRecipe).toBe(false);
  });
});

describe('GET /api/v1/collections/:id — visibility', () => {
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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 403 for private collection by unauthenticated user', async () => {
    const app = createTestApp(null);
    const res = await app.request(`/api/v1/collections/${privateCol.id}`);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 200 for public collection by anyone', async () => {
    const app = createTestApp(userB.id);
    const res = await app.request(`/api/v1/collections/${publicCol.id}`);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/v1/collections — create', () => {
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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

describe('PATCH /api/v1/collections/:id — update', () => {
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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('DELETE /api/v1/collections/:id — delete', () => {
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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.message).toBeDefined();
  });

  it('returns 403 for non-owner', async () => {
    const app = createTestApp(userA.id);
    const res = await app.request(`/api/v1/collections/${colOther.id}`, { method: 'DELETE' });
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 for non-existent collection', async () => {
    const app = createTestApp(userA.id);
    const res = await app.request(`/api/v1/collections/${crypto.randomUUID()}`, {
      method: 'DELETE',
    });
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/v1/collections/:id/recipes — add recipe', () => {
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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

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
});

describe('DELETE /api/v1/collections/:id/recipes/:recipeId — remove recipe', () => {
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
    const res = await app.request(`/api/v1/collections/${col.id}/recipes/${r1.id}`, {
      method: 'DELETE',
    });
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.message).toBeDefined();
  });

  it('returns 403 for non-owner', async () => {
    // re-add the item so the delete has something to remove
    await db
      .insert(collectionItems)
      .values({
        collectionId: col.id,
        recipeId: r1.id,
        sortOrder: 0,
      })
      .onConflictDoNothing();
    const app = createTestApp(userB.id);
    const res = await app.request(`/api/v1/collections/${col.id}/recipes/${r1.id}`, {
      method: 'DELETE',
    });
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 for non-existent collection', async () => {
    const app = createTestApp(userA.id);
    const res = await app.request(`/api/v1/collections/${crypto.randomUUID()}/recipes/${r1.id}`, {
      method: 'DELETE',
    });
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /api/v1/collections/:id/reorder — reorder', () => {
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
    const i1 = await db
      .insert(collectionItems)
      .values({
        collectionId: col.id,
        recipeId: r1.id,
        sortOrder: 0,
      })
      .returning();
    const i2 = await db
      .insert(collectionItems)
      .values({
        collectionId: col.id,
        recipeId: r2.id,
        sortOrder: 1,
      })
      .returning();
    const i3 = await db
      .insert(collectionItems)
      .values({
        collectionId: col.id,
        recipeId: r3.id,
        sortOrder: 2,
      })
      .returning();
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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

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
      // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
      const body = (await res.json()) as any;

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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/v1/collections/public — browse all public collections', () => {
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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.pagination).toBeDefined();
    // The DB may contain seed public collections; verify our test ones are present
    // biome-ignore lint/suspicious/noExplicitAny: test mock
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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    for (const c of body.data) {
      expect(c.visibility).not.toBe('private');
      expect(c.visibility).not.toBe('draft');
    }
  });

  it('is reachable by authenticated users too', async () => {
    const app = createTestApp(userA.id);
    const res = await app.request('/api/v1/collections/public?page=1&perPage=10');
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Same as unauthenticated: our test public collections should be present
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const names = body.data.map((c: any) => c.name);
    expect(names).toContain('A Pub');
    expect(names).toContain('B Pub');
  });
});

describe('GET /api/v1/collections/:id — cache behaviour', () => {
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
    const debugSpy = vi.spyOn(logger, 'debug');
    try {
      const res2 = await app.request(`/api/v1/collections/${col.id}`);
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      // meta.requestId legitimately differs per request; the payload must be identical.
      expect(body2.data).toEqual(body1.data);
      const hit = debugSpy.mock.calls.find(
        (args: unknown[]) => args[1] === 'getCollection cache hit',
      );
      expect(hit).toBeDefined();
    } finally {
      debugSpy.mockRestore();
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
});

describe('GET /api/v1/collections/:id — hidden items never reach the JSON body', () => {
  let owner: typeof users.$inferSelect;
  let author: typeof users.$inferSelect;
  let originalCache: CacheProvider;
  const colIds: string[] = [];

  beforeEach(async () => {
    originalCache = cacheProvider;
    setCacheProvider(new InMemoryCacheProvider());
    owner = await createUser('route-hidden-owner');
    author = await createUser('route-hidden-author');
  });

  afterEach(async () => {
    setCacheProvider(originalCache);
    deps.authMiddleware = originalAuthMiddleware;
    deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
    await cleanupCollections(colIds);
    colIds.length = 0;
    await cleanupUsers([owner.id, author.id]);
  });

  it("omits the title and slug of a private recipe and of another author's unlisted recipe for an anonymous caller", async () => {
    const col = await createCollectionRow(owner.id, 'Leak check', 'public');
    colIds.push(col.id);
    const visible = await createRecipe(author.id, 'public');
    const madePrivate = await createRecipe(author.id, 'public');
    const madeUnlisted = await createRecipe(author.id, 'public');
    const privateTitle = `Hidden private ${crypto.randomUUID()}`;
    const unlistedTitle = `Hidden unlisted ${crypto.randomUUID()}`;
    await db
      .update(recipes)
      .set({ title: privateTitle, visibility: 'private' })
      .where(eq(recipes.id, madePrivate.id));
    await db
      .update(recipes)
      .set({ title: unlistedTitle, visibility: 'unlisted' })
      .where(eq(recipes.id, madeUnlisted.id));
    await db.insert(collectionItems).values([
      { collectionId: col.id, recipeId: visible.id, sortOrder: 0 },
      { collectionId: col.id, recipeId: madePrivate.id, sortOrder: 1 },
      { collectionId: col.id, recipeId: madeUnlisted.id, sortOrder: 2 },
    ]);

    const res = await createTestApp(null).request(`/api/v1/collections/${col.id}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain(visible.slug);
    expect(text).not.toContain(privateTitle);
    expect(text).not.toContain(madePrivate.slug);
    expect(text).not.toContain(unlistedTitle);
    expect(text).not.toContain(madeUnlisted.slug);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = JSON.parse(text) as any;
    expect(body.data.recipeCount).toBe(1);
    expect(body.data.items).toHaveLength(1);
  });
});

describe('unlisted collections — listing rule regression locks', () => {
  let ownerA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;
  let unlistedK: typeof collections.$inferSelect;
  let publicP: typeof collections.$inferSelect;
  let publicRecipe: typeof recipes.$inferSelect;
  let ownUnlistedRecipe: typeof recipes.$inferSelect;
  let originalCache: CacheProvider;
  const originalRecipeAuth = recipeDeps.authMiddleware;
  const originalRecipeOptionalAuth = recipeDeps.optionalAuthMiddleware;

  /**
   * Test app with the collection router, the user-scoped collections router and
   * the recipe router (for `GET /api/v1/recipes/:slugOrId/collections`), all
   * with stubbed auth so the caller is whatever `userId` the stub sets.
   */
  function createFullTestApp(userId: string | null) {
    const app = createTestApp(userId);
    recipeDeps.authMiddleware = stubAuth;
    recipeDeps.optionalAuthMiddleware = stubOptionalAuth;
    app.route('/api/v1/users', userCollections);
    app.route('/api/v1/recipes', recipeRouter);
    return app;
  }

  /** GET a JSON route as `userId` and return status + parsed body. */
  async function getJson(userId: string | null, path: string) {
    const res = await createFullTestApp(userId).request(path);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    return { status: res.status, body: (await res.json()) as any };
  }

  /** Ids of a list response's `data` rows. */
  // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
  const ids = (body: any): string[] => body.data.map((c: { id: string }) => c.id);

  beforeEach(async () => {
    originalCache = cacheProvider;
    setCacheProvider(new InMemoryCacheProvider());
    ownerA = await createUser('route-unlisted-a');
    userB = await createUser('route-unlisted-b');
    unlistedK = await createCollectionRow(ownerA.id, 'Unlisted K', 'unlisted');
    publicP = await createCollectionRow(ownerA.id, 'Public P', 'public');
    publicRecipe = await createRecipe(ownerA.id, 'public');
    ownUnlistedRecipe = await createRecipe(ownerA.id, 'unlisted');
    await db.insert(collectionItems).values([
      { collectionId: unlistedK.id, recipeId: publicRecipe.id, sortOrder: 0 },
      { collectionId: unlistedK.id, recipeId: ownUnlistedRecipe.id, sortOrder: 1 },
      { collectionId: publicP.id, recipeId: publicRecipe.id, sortOrder: 0 },
    ]);
  });

  afterEach(async () => {
    setCacheProvider(originalCache);
    deps.authMiddleware = originalAuthMiddleware;
    deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
    recipeDeps.authMiddleware = originalRecipeAuth;
    recipeDeps.optionalAuthMiddleware = originalRecipeOptionalAuth;
    await cleanupUsers([ownerA.id, userB.id]);
  });

  it('keeps an unlisted collection out of GET /api/v1/collections/public', async () => {
    const { status, body } = await getJson(null, '/api/v1/collections/public?perPage=100');
    expect(status).toBe(200);
    expect(ids(body)).toContain(publicP.id);
    expect(ids(body)).not.toContain(unlistedK.id);
  });

  it('lists an unlisted collection on GET /api/v1/users/:userId/collections only for its owner', async () => {
    const path = `/api/v1/users/${ownerA.id}/collections`;
    for (const viewer of [null, userB.id]) {
      const { status, body } = await getJson(viewer, path);
      expect(status).toBe(200);
      expect(ids(body)).toContain(publicP.id);
      expect(ids(body)).not.toContain(unlistedK.id);
    }
    const asOwner = await getJson(ownerA.id, path);
    expect(asOwner.status).toBe(200);
    expect(ids(asOwner.body)).toContain(unlistedK.id);
  });

  it('keeps an unlisted collection out of GET /api/v1/recipes/:slug/collections for a non-owner', async () => {
    const { status, body } = await getJson(
      userB.id,
      `/api/v1/recipes/${publicRecipe.slug}/collections`,
    );
    expect(status).toBe(200);
    expect(ids(body)).toContain(publicP.id);
    expect(ids(body)).not.toContain(unlistedK.id);
  });

  it('opens an unlisted collection by direct link for an anonymous caller with only its public items', async () => {
    const { status, body } = await getJson(null, `/api/v1/collections/${unlistedK.id}`);
    expect(status).toBe(200);
    expect(body.data.items.map((i: { recipeId: string }) => i.recipeId)).toEqual([publicRecipe.id]);
    expect(body.data.recipeCount).toBe(1);
  });

  it("rejects adding another author's unlisted recipe with 403", async () => {
    const ownCol = await createCollectionRow(userB.id, 'B col', 'public');
    const res = await createFullTestApp(userB.id).request(
      `/api/v1/collections/${ownCol.id}/recipes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: ownUnlistedRecipe.id }),
      },
    );
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;
    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });
});

/**
 * Non-public collection responses are never indexed (capability `recipe-visibility`, task
 * 11.8): `GET /api/v1/collections/:id` carries `X-Robots-Tag: noindex, nofollow` unless the
 * collection is public, including for its owner.
 */
describe('GET /api/v1/collections/:id — X-Robots-Tag (recipe-visibility)', () => {
  let ownerA: typeof users.$inferSelect;
  let unlistedK: typeof collections.$inferSelect;
  let publicCol: typeof collections.$inferSelect;
  let privateCol: typeof collections.$inferSelect;
  let originalCache: CacheProvider;

  beforeEach(async () => {
    originalCache = cacheProvider;
    setCacheProvider(new InMemoryCacheProvider());
    ownerA = await createUser('route-robots-a');
    unlistedK = await createCollectionRow(ownerA.id, 'Unlisted K', 'unlisted');
    publicCol = await createCollectionRow(ownerA.id, 'Public', 'public');
    privateCol = await createCollectionRow(ownerA.id, 'Private', 'private');
  });

  afterEach(async () => {
    setCacheProvider(originalCache);
    deps.authMiddleware = originalAuthMiddleware;
    deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
    await cleanupUsers([ownerA.id]);
  });

  it("marks the unlisted collection's detail for an anonymous viewer", async () => {
    const res = await createTestApp(null).request(`/api/v1/collections/${unlistedK.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it("leaves the public collection's detail unmarked", async () => {
    const res = await createTestApp(null).request(`/api/v1/collections/${publicCol.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBeNull();
  });

  it("marks the owner's own private collection detail", async () => {
    const res = await createTestApp(ownerA.id).request(`/api/v1/collections/${privateCol.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('marks a cached unlisted detail too', async () => {
    await createTestApp(null).request(`/api/v1/collections/${unlistedK.id}`);
    const res = await createTestApp(null).request(`/api/v1/collections/${unlistedK.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
});
