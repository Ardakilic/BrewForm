/**
 * Route-level integration tests for cursor pagination on GET /api/v1/recipes.
 *
 * These tests mount the real recipe router on a stub Hono app that sets
 * context variables (requestId, userId, user) and exercise the full HTTP
 * stack including Zod validation, service dispatch, and envelope response
 * shaping against a PostgreSQL test database.
 */

import '../../test-setup.ts';
import { db } from '@brewform/db';
import {
  collectionItems,
  collections,
  equipment,
  recipes,
  recipeTasteNotes,
  recipeVersions,
  tasteNotes,
  userBadges,
  userRecipeFavourites,
  userRecipeLikes,
  userRecipeRatings,
  users,
} from '@brewform/db/schema';
import { encodeCursor } from '@brewform/shared/utils';
import { eq, inArray } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { errorHandler } from '../../middleware/errorHandler.ts';
import type { AppEnv } from '../../types/hono.ts';
import { signAccessToken } from '../auth/jwt.ts';
import coffeeVarietyRouter from '../coffee-variety/index.ts';
import recipeRouter, { deps } from './index.ts';
import * as service from './service.ts';
import { RecipeWriteFixtures, recipeInput } from './test-helpers.ts';

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

async function createRecipe(authorId: string, title: string, createdAt: Date) {
  const id = crypto.randomUUID();
  const [recipe] = await db
    .insert(recipes)
    .values({
      id,
      slug: `slug-${id.slice(0, 8)}`,
      title,
      authorId,
      visibility: 'public',
      createdAt,
    })
    .returning();
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
  for (let attempt = 0; ; attempt++) {
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

const stubAuth: typeof deps.authMiddleware = async (_c: Context, next: Next) => {
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
        // biome-ignore lint/suspicious/noExplicitAny: test mock request body
      } as any);
    }
    await next();
  });
  app.route('/api/v1/recipes', recipeRouter);
  app.onError(errorHandler);
  return app;
}

describe('Recipe routes — cursor pagination', () => {
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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.meta).toBeDefined();
    expect(body.meta.cursor).toBeDefined();
    expect(body.meta.pagination).toBeUndefined();
    expect(Array.isArray(body.data)).toBe(true);
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    expect(body.data.some((r: any) => r.id === r1.id)).toBe(true);
  });

  it('returns 400 INVALID_CURSOR when the cursor is malformed base64', async () => {
    const app = createTestApp(author.id);
    const res = await app.request('/api/v1/recipes?cursor=!!!invalid!!!');
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('INVALID_CURSOR');
  });

  it('uses cursor pagination when both cursor and page are provided (cursor wins)', async () => {
    const r1 = await createRecipe(author.id, 'MutExcl Older', new Date('2026-08-01T00:00:00.000Z'));
    const r2 = await createRecipe(author.id, 'MutExcl Newer', new Date('2026-08-02T00:00:00.000Z'));
    createdRecipes.push(r1.id, r2.id);

    const app = createTestApp(author.id);
    const cursor = encodeCursor({ createdAt: r2.createdAt.toISOString(), id: r2.id });
    const res = await app.request(`/api/v1/recipes?cursor=${cursor}&page=5&perPage=10`);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.meta).toBeDefined();
    expect(body.meta.pagination).toBeDefined();
    expect(body.meta.cursor).toBeUndefined();
  });
});

describe('Recipe routes — F11 advanced search params', () => {
  let author: typeof users.$inferSelect;
  const createdRecipes: string[] = [];

  beforeAll(async () => {
    author = await createUser('f11-search');
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

  it('accepts author param', async () => {
    const app = createTestApp(author.id);
    const res = await app.request('/api/v1/recipes?author=alice');
    expect(res.status).toBe(200);
  });

  it('accepts dateFrom param', async () => {
    const app = createTestApp(author.id);
    const res = await app.request('/api/v1/recipes?dateFrom=2025-01-01');
    expect(res.status).toBe(200);
  });

  it('accepts dateTo param', async () => {
    const app = createTestApp(author.id);
    const res = await app.request('/api/v1/recipes?dateTo=2025-12-01');
    expect(res.status).toBe(200);
  });

  it('accepts minRating param', async () => {
    const app = createTestApp(author.id);
    const res = await app.request('/api/v1/recipes?minRating=7');
    expect(res.status).toBe(200);
  });

  it('accepts maxRating param', async () => {
    const app = createTestApp(author.id);
    const res = await app.request('/api/v1/recipes?maxRating=9');
    expect(res.status).toBe(200);
  });

  it('rejects minRating=0 as 400', async () => {
    const app = createTestApp(author.id);
    const res = await app.request('/api/v1/recipes?minRating=0');
    expect(res.status).toBe(400);
  });

  it('rejects maxRating=11 as 400', async () => {
    const app = createTestApp(author.id);
    const res = await app.request('/api/v1/recipes?maxRating=11');
    expect(res.status).toBe(400);
  });

  it('silently drops grinder (removed field) as 200', async () => {
    const app = createTestApp(author.id);
    const res = await app.request('/api/v1/recipes?grinder=Niche');
    expect(res.status).toBe(200);
  });

  it('search + cursor falls back to offset pagination', async () => {
    const r = await createRecipe(author.id, 'Espresso Test', new Date('2026-11-01T00:00:00.000Z'));
    createdRecipes.push(r.id);

    const app = createTestApp(author.id);
    const cursor = encodeCursor({ createdAt: r.createdAt.toISOString(), id: r.id });
    const res = await app.request(`/api/v1/recipes?search=espresso&cursor=${cursor}`);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.meta.pagination).toBeDefined();
    expect(body.meta.cursor).toBeUndefined();
  });
});

describe('POST /api/v1/recipes — create', () => {
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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

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
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 400 VALIDATION_ERROR when the title is empty after sanitization', async () => {
    const app = createTestApp(user.id);
    const res = await app.request('/api/v1/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '<b></b>',
        visibility: 'draft',
        brewMethod: 'v60',
        drinkType: 'pour_over',
        preparationNotes: 'Bloom 45s, then pour in stages',
      }),
    });
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual([{ field: 'title', message: 'Title cannot be empty' }]);
  });

  it('returns 400 VALIDATION_ERROR for duplicate tasteNoteIds and writes no recipe row', async () => {
    const app = createTestApp(user.id);
    const title = `Dup Taste ${crypto.randomUUID().slice(0, 8)}`;
    const res = await app.request('/api/v1/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        brewMethod: 'v60',
        drinkType: 'pour_over',
        preparationNotes: 'Bloom 45s',
        tasteNoteIds: [tasteNoteId, tasteNoteId],
      }),
    });
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toContainEqual({
      field: 'tasteNoteIds',
      message: 'Duplicate ids are not allowed',
    });
    const rows = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.title, title));
    expect(rows).toHaveLength(0);
  });

  it('returns 201 twice with different slugs for the same payload', async () => {
    const app = createTestApp(user.id);
    const marker = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
    const payload = JSON.stringify({
      title: `Same Payload ${marker}`,
      visibility: 'draft',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      preparationNotes: 'Bloom 45s, then pour in stages',
    });
    const post = () =>
      app.request('/api/v1/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

    const first = await post();
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const firstBody = (await first.json()) as any;
    expect(first.status).toBe(201);
    createdRecipeIds.push(firstBody.data.id);

    const second = await post();
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const secondBody = (await second.json()) as any;
    expect(second.status).toBe(201);
    createdRecipeIds.push(secondBody.data.id);

    expect(firstBody.data.slug).toBe(`same-payload-${marker}`);
    expect(secondBody.data.slug).not.toBe(firstBody.data.slug);
    expect(secondBody.data.slug).toMatch(
      new RegExp(`^same-payload-${marker}-[23456789bcdfghjkmnpqrstvwxz]{6}$`),
    );
  });
});

const stubOptionalAuth: typeof deps.optionalAuthMiddleware = async (_c: Context, next: Next) => {
  await next();
};
const originalOptionalAuthMiddleware = deps.optionalAuthMiddleware;

describe('GET /api/v1/recipes/:slugOrId/collections — US-9 read path (D99.5)', () => {
  let author: typeof users.$inferSelect;
  let viewer: typeof users.$inferSelect;
  let stranger: typeof users.$inferSelect;
  let recipe: typeof recipes.$inferSelect;
  let publicCol: typeof collections.$inferSelect;
  let privateCol: typeof collections.$inferSelect;

  function createCollectionsApp(userId: string | null) {
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
    app.route('/api/v1/recipes', recipeRouter);
    return app;
  }

  beforeAll(async () => {
    author = await createUser('us9-author');
    viewer = await createUser('us9-viewer');
    stranger = await createUser('us9-stranger');
    recipe = await createRecipe(author.id, 'US9 Recipe', new Date());
    publicCol = await db
      .insert(collections)
      .values({
        id: crypto.randomUUID(),
        userId: viewer.id,
        name: 'US9 Public',
        visibility: 'public',
      })
      .returning()
      .then((r) => r[0]);
    privateCol = await db
      .insert(collections)
      .values({
        id: crypto.randomUUID(),
        userId: viewer.id,
        name: 'US9 Private',
        visibility: 'private',
      })
      .returning()
      .then((r) => r[0]);
    for (const col of [publicCol, privateCol]) {
      await db.insert(collectionItems).values({
        collectionId: col.id,
        recipeId: recipe.id,
        sortOrder: 0,
      });
    }
  });

  afterAll(async () => {
    deps.authMiddleware = originalAuthMiddleware;
    deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
    await db
      .delete(collectionItems)
      .where(inArray(collectionItems.collectionId, [publicCol.id, privateCol.id]));
    await db.delete(collections).where(inArray(collections.id, [publicCol.id, privateCol.id]));
    await db.delete(recipes).where(eq(recipes.id, recipe.id));
    await db.delete(users).where(inArray(users.id, [author.id, viewer.id, stranger.id]));
  });

  it('returns 200 with only public collections for an anonymous viewer', async () => {
    const app = createCollectionsApp(null);
    const res = await app.request(`/api/v1/recipes/${recipe.slug}/collections`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe(publicCol.id);
    expect(body.data[0].visibility).toBe('public');
  });

  it('includes the viewer’s own private collection when authenticated as the owner', async () => {
    const app = createCollectionsApp(viewer.id);
    const res = await app.request(`/api/v1/recipes/${recipe.slug}/collections`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.map((c: { id: string }) => c.id).sort();
    expect(ids).toEqual([publicCol.id, privateCol.id].sort());
  });

  it('excludes others’ private collections for a stranger', async () => {
    const app = createCollectionsApp(stranger.id);
    const res = await app.request(`/api/v1/recipes/${recipe.slug}/collections`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe(publicCol.id);
  });

  it('returns a clean 404 for a nonexistent recipe', async () => {
    const app = createCollectionsApp(null);
    const res = await app.request('/api/v1/recipes/no-such-recipe-slug/collections');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Recipe not found');
  });
});

describe('Recipe routes — detail, mutations and toggles', () => {
  let author: typeof users.$inferSelect;
  let other: typeof users.$inferSelect;
  const createdRecipeIds: string[] = [];
  const createdVersionIds: string[] = [];

  /** Build an app that injects `userId` for the (stubbed) authGuard routes. */
  function createApp(userId: string | null) {
    deps.authMiddleware = stubAuth;
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
      }
      await next();
    });
    app.route('/api/v1/recipes', recipeRouter);
    return app;
  }

  async function makeRecipe(
    authorId: string,
    title: string,
    visibility: 'public' | 'draft' | 'private' | 'unlisted' = 'public',
  ) {
    const id = crypto.randomUUID();
    const [recipe] = await db
      .insert(recipes)
      .values({
        id,
        slug: `slug-${id.slice(0, 8)}`,
        title,
        authorId,
        visibility,
      })
      .returning();
    createdRecipeIds.push(recipe.id);
    const [version] = await db
      .insert(recipeVersions)
      .values({
        recipeId: recipe.id,
        versionNumber: 1,
        brewMethod: 'v60',
        drinkType: 'pour_over',
        preparationNotes: 'test preparation',
      })
      .returning();
    createdVersionIds.push(version.id);
    await db.update(recipes).set({ currentVersionId: version.id }).where(eq(recipes.id, recipe.id));
    return recipe;
  }

  function bearer(user: typeof users.$inferSelect) {
    return signAccessToken({
      id: user.id,
      email: user.email,
      username: user.username,
      isAdmin: false,
    });
  }

  beforeAll(async () => {
    author = await createUser('detail-author');
    other = await createUser('detail-other');
  });

  afterEach(async () => {
    deps.authMiddleware = originalAuthMiddleware;
    if (createdRecipeIds.length) {
      await db.delete(userRecipeLikes).where(inArray(userRecipeLikes.recipeId, createdRecipeIds));
      await db
        .delete(userRecipeFavourites)
        .where(inArray(userRecipeFavourites.recipeId, createdRecipeIds));
      await db
        .delete(userRecipeRatings)
        .where(inArray(userRecipeRatings.recipeId, createdRecipeIds));
      await db
        .delete(recipeTasteNotes)
        .where(inArray(recipeTasteNotes.recipeVersionId, createdVersionIds));
      await db.delete(recipeVersions).where(inArray(recipeVersions.recipeId, createdRecipeIds));
      await db.delete(recipes).where(inArray(recipes.id, createdRecipeIds));
      createdRecipeIds.length = 0;
      createdVersionIds.length = 0;
    }
  });

  afterAll(async () => {
    deps.authMiddleware = originalAuthMiddleware;
    if (createdRecipeIds.length) {
      await db.delete(recipeVersions).where(inArray(recipeVersions.recipeId, createdRecipeIds));
      await db.delete(recipes).where(inArray(recipes.id, createdRecipeIds));
    }
    await deleteUserWithBadges(author.id);
    await deleteUserWithBadges(other.id);
  });

  describe('GET /:slugOrId', () => {
    it('returns 200 with the rich payload for a public recipe (anonymous)', async () => {
      const recipe = await makeRecipe(author.id, 'Detail Public');
      const app = createApp(null);
      const res = await app.request(`/api/v1/recipes/${recipe.slug}`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(recipe.id);
      expect(body.data.userLiked).toBe(false);
      expect(body.data.favouriteCount).toBe(0);
    });

    it('returns 404 for a nonexistent recipe', async () => {
      const app = createApp(null);
      const res = await app.request('/api/v1/recipes/no-such-slug');
      expect(res.status).toBe(404);
    });

    it('returns 404 for a draft recipe viewed anonymously', async () => {
      const recipe = await makeRecipe(author.id, 'Detail Draft', 'draft');
      const app = createApp(null);
      const res = await app.request(`/api/v1/recipes/${recipe.slug}`);
      expect(res.status).toBe(404);
    });

    it('returns 200 for a draft recipe viewed by its author', async () => {
      const recipe = await makeRecipe(author.id, 'Detail Draft Owner', 'draft');
      const app = createApp(null);
      const token = await bearer(author);
      const res = await app.request(`/api/v1/recipes/${recipe.slug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /meta/:slug', () => {
    it('returns 200 for a public recipe', async () => {
      const recipe = await makeRecipe(author.id, 'Meta Public');
      const app = createApp(null);
      const res = await app.request(`/api/v1/recipes/meta/${recipe.slug}`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.id).toBe(recipe.id);
    });

    it('returns 404 for a non-public recipe', async () => {
      const recipe = await makeRecipe(author.id, 'Meta Draft', 'draft');
      const app = createApp(null);
      const res = await app.request(`/api/v1/recipes/meta/${recipe.slug}`);
      expect(res.status).toBe(404);
    });

    it('returns 404 for a nonexistent slug', async () => {
      const app = createApp(null);
      const res = await app.request('/api/v1/recipes/meta/no-such-slug');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /:slug/versions', () => {
    it('returns 200 with the version list for a public recipe', async () => {
      const recipe = await makeRecipe(author.id, 'Versions Public');
      const app = createApp(null);
      const res = await app.request(`/api/v1/recipes/${recipe.slug}/versions`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.id).toBe(recipe.id);
      expect(Array.isArray(body.data.versions)).toBe(true);
      expect(body.data.versions.length).toBe(1);
    });

    it('returns 404 for a nonexistent recipe', async () => {
      const app = createApp(null);
      const res = await app.request('/api/v1/recipes/no-such-slug/versions');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /:id', () => {
    it('returns 200 when the author updates their recipe', async () => {
      const recipe = await makeRecipe(author.id, 'Patch Mine');
      const app = createApp(author.id);
      const res = await app.request(`/api/v1/recipes/${recipe.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bumpVersion: false, title: 'Patched Title' }),
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.title).toBe('Patched Title');
    });

    it('returns 403 for a non-author', async () => {
      const recipe = await makeRecipe(author.id, 'Patch Forbidden');
      const app = createApp(other.id);
      const res = await app.request(`/api/v1/recipes/${recipe.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bumpVersion: false, title: 'X' }),
      });
      expect(res.status).toBe(403);
    });

    it('returns 404 for a nonexistent recipe', async () => {
      const app = createApp(author.id);
      const res = await app.request(`/api/v1/recipes/${crypto.randomUUID()}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bumpVersion: false, title: 'X' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    it('returns 200 when the author deletes their recipe', async () => {
      const recipe = await makeRecipe(author.id, 'Delete Mine');
      const app = createApp(author.id);
      const res = await app.request(`/api/v1/recipes/${recipe.id}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
    });

    it('returns 403 for a non-author', async () => {
      const recipe = await makeRecipe(author.id, 'Delete Forbidden');
      const app = createApp(other.id);
      const res = await app.request(`/api/v1/recipes/${recipe.id}`, { method: 'DELETE' });
      expect(res.status).toBe(403);
    });

    it('returns 404 for a nonexistent recipe', async () => {
      const app = createApp(author.id);
      const res = await app.request(`/api/v1/recipes/${crypto.randomUUID()}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /:id/fork', () => {
    it('returns 201 when forking a public recipe', async () => {
      const recipe = await makeRecipe(author.id, 'Fork Public');
      const app = createApp(other.id);
      const res = await app.request(`/api/v1/recipes/${recipe.id}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      expect(res.status).toBe(201);
      createdRecipeIds.push(body.data.id);
    });

    it('returns 403 when a non-author forks a draft', async () => {
      const recipe = await makeRecipe(author.id, 'Fork Draft', 'draft');
      const app = createApp(other.id);
      const res = await app.request(`/api/v1/recipes/${recipe.id}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(403);
    });

    it('returns 404 for a nonexistent source', async () => {
      const app = createApp(author.id);
      const res = await app.request(`/api/v1/recipes/${crypto.randomUUID()}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /:id/like', () => {
    it('returns 200 and toggles the like state', async () => {
      const recipe = await makeRecipe(author.id, 'Like Route');
      const app = createApp(other.id);
      const res = await app.request(`/api/v1/recipes/${recipe.id}/like`, { method: 'POST' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.liked).toBe(true);
    });

    it('returns 404 for a nonexistent recipe', async () => {
      const app = createApp(author.id);
      const res = await app.request(`/api/v1/recipes/${crypto.randomUUID()}/like`, {
        method: 'POST',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('join rows are re-creatable (like / favourite)', () => {
    it('like, unlike, like leaves exactly one user_recipe_like row', async () => {
      const recipe = await makeRecipe(author.id, 'Relike Route');
      const app = createApp(other.id);
      const toggles = [];
      for (let i = 0; i < 3; i++) {
        const res = await app.request(`/api/v1/recipes/${recipe.id}/like`, { method: 'POST' });
        expect(res.status).toBe(200);
        toggles.push((await res.json()).data.liked);
      }
      expect(toggles).toEqual([true, false, true]);
      const rows = await db
        .select({ id: userRecipeLikes.id })
        .from(userRecipeLikes)
        .where(eq(userRecipeLikes.recipeId, recipe.id));
      expect(rows).toHaveLength(1);
    });

    it('favourite, unfavourite, favourite leaves exactly one user_recipe_favourite row', async () => {
      const recipe = await makeRecipe(author.id, 'Refav Route');
      const app = createApp(other.id);
      const toggles = [];
      for (let i = 0; i < 3; i++) {
        const res = await app.request(`/api/v1/recipes/${recipe.id}/favourite`, {
          method: 'POST',
        });
        expect(res.status).toBe(200);
        toggles.push((await res.json()).data.favourited);
      }
      expect(toggles).toEqual([true, false, true]);
      const rows = await db
        .select({ id: userRecipeFavourites.id })
        .from(userRecipeFavourites)
        .where(eq(userRecipeFavourites.recipeId, recipe.id));
      expect(rows).toHaveLength(1);
    });
  });

  describe('POST /:id/favourite', () => {
    it('returns 200 and toggles the favourite state', async () => {
      const recipe = await makeRecipe(author.id, 'Fav Route');
      const app = createApp(other.id);
      const res = await app.request(`/api/v1/recipes/${recipe.id}/favourite`, { method: 'POST' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.favourited).toBe(true);
    });

    it('returns 404 for a nonexistent recipe', async () => {
      const app = createApp(author.id);
      const res = await app.request(`/api/v1/recipes/${crypto.randomUUID()}/favourite`, {
        method: 'POST',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /:id/feature', () => {
    it('returns 200 when the author toggles featured', async () => {
      const recipe = await makeRecipe(author.id, 'Feature Route');
      const app = createApp(author.id);
      const res = await app.request(`/api/v1/recipes/${recipe.id}/feature`, { method: 'POST' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(typeof body.data.featured).toBe('boolean');
    });

    it('returns 403 for a non-author', async () => {
      const recipe = await makeRecipe(author.id, 'Feature Forbidden');
      const app = createApp(other.id);
      const res = await app.request(`/api/v1/recipes/${recipe.id}/feature`, { method: 'POST' });
      expect(res.status).toBe(403);
    });

    it('returns 404 for a nonexistent recipe', async () => {
      const app = createApp(author.id);
      const res = await app.request(`/api/v1/recipes/${crypto.randomUUID()}/feature`, {
        method: 'POST',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /:id/rate', () => {
    it('returns 200 and saves the rating', async () => {
      const recipe = await makeRecipe(author.id, 'Rate Route');
      const app = createApp(other.id);
      const res = await app.request(`/api/v1/recipes/${recipe.id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 8 }),
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.rating).toBe(8);
    });

    it('returns 400 for an out-of-range rating', async () => {
      const recipe = await makeRecipe(author.id, 'Rate Invalid');
      const app = createApp(other.id);
      const res = await app.request(`/api/v1/recipes/${recipe.id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 99 }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /starred', () => {
    it('returns 200 with a paginated envelope for an authenticated user', async () => {
      const recipe = await makeRecipe(author.id, 'Starred Route');
      await db.insert(userRecipeFavourites).values({ userId: other.id, recipeId: recipe.id });
      const app = createApp(other.id);
      const res = await app.request('/api/v1/recipes/starred?page=1&perPage=10');
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.meta.pagination).toBeDefined();
      expect(body.data.map((r: { id: string }) => r.id)).toContain(recipe.id);
    });

    it('sets the Deprecation header when tasteNoteId is used', async () => {
      const app = createApp(other.id);
      const res = await app.request(
        `/api/v1/recipes/starred?page=1&perPage=10&tasteNoteId=${crypto.randomUUID()}`,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Deprecation')).toBe('true');
    });
  });
});

/**
 * recipe-write: the PATCH route is gated, mapped and documented, and create/update persist
 * every field (tds, coffee variety, relations). Recipes are created through the service and
 * cleaned up by {@link RecipeWriteFixtures}.
 */
describe('Recipe write integrity — POST / and PATCH /:id', () => {
  const fixtures = new RecipeWriteFixtures();
  let author: typeof users.$inferSelect;

  beforeEach(async () => {
    author = await fixtures.user('write-route');
  });

  afterEach(async () => {
    deps.authMiddleware = originalAuthMiddleware;
    deps.optionalAuthMiddleware = originalOptionalAuthMiddleware;
    await fixtures.cleanup();
  });

  /** App with the recipe and coffee-variety routers, the global error handler and a stub user. */
  function writeApp(userId: string | null, emailVerified = true) {
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
          emailVerifiedAt: emailVerified ? new Date() : null,
          // biome-ignore lint/suspicious/noExplicitAny: test mock user
        } as any);
      }
      await next();
    });
    app.route('/api/v1/recipes', recipeRouter);
    app.route('/api/v1/coffee-varieties', coffeeVarietyRouter);
    app.onError(errorHandler);
    return app;
  }

  /** Send a JSON request and return the status and parsed body. */
  async function send(
    app: Hono<AppEnv>,
    method: 'POST' | 'PATCH',
    path: string,
    payload: Record<string, unknown>,
  ) {
    const res = await app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    return { status: res.status, body: (await res.json()) as any };
  }

  /** GET a recipe detail anonymously. */
  async function getDetail(slug: string) {
    const res = await writeApp(null).request(`/api/v1/recipes/${slug}`);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    return { status: res.status, body: (await res.json()) as any };
  }

  /**
   * Create a public recipe with taste note T (intensity 2), equipment E, tds 1.35 and variety V.
   * (A value with a trailing zero would read back as e.g. '1.4': the relational query returns
   * nested numerics through JSON.)
   */
  async function createLinked() {
    const tasteNoteId = await fixtures.tasteNote();
    const equipmentId = await fixtures.equipmentItem();
    const variety = await fixtures.variety('Pink Bourbon');
    const recipe = await service.createRecipe(author.id, {
      title: `Linked ${crypto.randomUUID().slice(0, 8)}`,
      visibility: 'public',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      preparationNotes: 'Bloom',
      isFavourite: true,
      grindSize: 'fine',
      tds: 1.35,
      coffeeVarietyId: variety.id,
      tasteNoteIds: [tasteNoteId],
      tasteNoteIntensities: { [tasteNoteId]: 2 },
      equipmentIds: [equipmentId],
    });
    return { recipe: recipe!, tasteNoteId, equipmentId, variety };
  }

  it('returns 403 EMAIL_NOT_VERIFIED for an unverified author and writes nothing', async () => {
    const { recipe } = await createLinked();
    const before = await fixtures.snapshot(recipe.currentVersionId!);
    const { status, body } = await send(
      writeApp(author.id, false),
      'PATCH',
      `/api/v1/recipes/${recipe.id}`,
      { grindSize: 'coarse', visibility: 'private' },
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(await fixtures.snapshot(recipe.currentVersionId!)).toEqual(before);
    expect((await fixtures.rawRecipe(recipe.id)).visibility).toBe('public');
  });

  it('returns 400 VALIDATION_ERROR (not 500) for a title that is empty after sanitization', async () => {
    const { recipe } = await createLinked();
    const { status, body } = await send(
      writeApp(author.id),
      'PATCH',
      `/api/v1/recipes/${recipe.id}`,
      {
        title: '<i></i>',
      },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual([{ field: 'title', message: 'Title cannot be empty' }]);
  });

  it('returns 400 VALIDATION_ERROR for null on a required field', async () => {
    const { recipe } = await createLinked();
    for (const payload of [{ title: null }, { brewMethod: null }]) {
      const { status, body } = await send(
        writeApp(author.id),
        'PATCH',
        `/api/v1/recipes/${recipe.id}`,
        payload,
      );
      expect(status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('returns 400 for duplicate equipmentIds and leaves the current version unchanged', async () => {
    const { recipe, equipmentId } = await createLinked();
    const before = await fixtures.snapshot(recipe.currentVersionId!);
    const { status, body } = await send(
      writeApp(author.id),
      'PATCH',
      `/api/v1/recipes/${recipe.id}`,
      {
        equipmentIds: [equipmentId, equipmentId],
      },
    );
    expect(status).toBe(400);
    expect(body.error.details).toContainEqual({
      field: 'equipmentIds',
      message: 'Duplicate ids are not allowed',
    });
    expect(await fixtures.snapshot(recipe.currentVersionId!)).toEqual(before);
  });

  it('returns 400 with a grindDate detail for a merged cross-field violation', async () => {
    const recipe = await service.createRecipe(author.id, {
      ...recipeInput(`Merged ${crypto.randomUUID().slice(0, 8)}`),
      roastDate: '2026-11-10',
    });
    const { status, body } = await send(
      writeApp(author.id),
      'PATCH',
      `/api/v1/recipes/${recipe!.id}`,
      {
        grindDate: '2026-11-01',
      },
    );
    expect(status).toBe(400);
    expect(body.error.details.map((d: { field: string }) => d.field)).toContain('grindDate');
  });

  it('keeps visibility on a title-only PATCH (detail and list)', async () => {
    const { recipe } = await createLinked();
    const { status } = await send(writeApp(author.id), 'PATCH', `/api/v1/recipes/${recipe.id}`, {
      title: 'Renamed only',
    });
    expect(status).toBe(200);

    const detail = await getDetail(recipe.slug);
    expect(detail.body.data.title).toBe('Renamed only');
    expect(detail.body.data.visibility).toBe('public');
    const list = await writeApp(null).request(`/api/v1/recipes?authorId=${author.id}`);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const listBody = (await list.json()) as any;
    expect(listBody.data.map((r: { id: string }) => r.id)).toContain(recipe.id);
  });

  it('keeps taste notes, equipment, tds and variety through a bump (GET /:slug round-trip)', async () => {
    const { recipe, tasteNoteId, equipmentId, variety } = await createLinked();
    const { status, body } = await send(
      writeApp(author.id),
      'PATCH',
      `/api/v1/recipes/${recipe.id}`,
      {
        grindSize: 'medium',
        bumpVersion: true,
      },
    );
    expect(status).toBe(200);
    expect(body.data.versions).toHaveLength(2);

    const detail = await getDetail(recipe.slug);
    const current = detail.body.data.versions.find(
      (v: { id: string }) => v.id === detail.body.data.currentVersionId,
    );
    expect(current.versionNumber).toBe(2);
    expect(current.grindSize).toBe('medium');
    expect(current.tds).toBe('1.35');
    expect(current.coffeeVarietyId).toBe(variety.id);
    expect(current.coffeeVarietyName).toBe(variety.name);
    expect(current.isFavourite).toBe(true);
    expect(
      current.tasteNotes.map((tn: { tasteNoteId: string; intensity: number }) => [
        tn.tasteNoteId,
        tn.intensity,
      ]),
    ).toEqual([[tasteNoteId, 2]]);
    expect(current.equipment.map((e: { equipmentId: string }) => e.equipmentId)).toEqual([
      equipmentId,
    ]);
  });

  it('keeps the recipe listed under ?coffeeVarietyId= and /coffee-varieties/:id/recipes after a bump', async () => {
    const { recipe, variety } = await createLinked();
    await send(writeApp(author.id), 'PATCH', `/api/v1/recipes/${recipe.id}`, {
      grindSize: 'medium',
      bumpVersion: true,
    });

    const app = writeApp(null);
    const byFilter = await app.request(`/api/v1/recipes?coffeeVarietyId=${variety.id}`);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const filterBody = (await byFilter.json()) as any;
    expect(byFilter.status).toBe(200);
    expect(filterBody.data.map((r: { id: string }) => r.id)).toContain(recipe.id);

    const byVariety = await app.request(`/api/v1/coffee-varieties/${variety.id}/recipes`);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion cast
    const varietyBody = (await byVariety.json()) as any;
    expect(byVariety.status).toBe(200);
    expect(varietyBody.data.map((r: { id: string }) => r.id)).toContain(recipe.id);
  });

  it('POST / returns 400 for an unknown tasteNoteId and writes no recipe row', async () => {
    const title = `Unknown Taste ${crypto.randomUUID().slice(0, 8)}`;
    const { status, body } = await send(writeApp(author.id), 'POST', '/api/v1/recipes', {
      title,
      brewMethod: 'v60',
      drinkType: 'pour_over',
      preparationNotes: 'Bloom',
      tasteNoteIds: [crypto.randomUUID()],
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.map((d: { field: string }) => d.field)).toEqual(['tasteNoteIds']);
    const rows = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.title, title));
    expect(rows).toHaveLength(0);
  });

  it('POST / persists tds and coffeeVarietyId and returns them', async () => {
    const variety = await fixtures.variety('Gesha');
    const { status, body } = await send(writeApp(author.id), 'POST', '/api/v1/recipes', {
      title: `With TDS ${crypto.randomUUID().slice(0, 8)}`,
      visibility: 'public',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      preparationNotes: 'Bloom',
      tds: 1.35,
      coffeeVarietyId: variety.id,
      coffeeVarietyName: 'ignored client value',
    });
    expect(status).toBe(201);
    expect(body.data.versions[0].tds).toBe('1.35');
    expect(body.data.versions[0].coffeeVarietyId).toBe(variety.id);
    expect(body.data.versions[0].coffeeVarietyName).toBe(variety.name);
    expect(body.data.currentVersionId).toBe(body.data.versions[0].id);
  });
});
