// deno-lint-ignore-file no-explicit-any require-await

/**
 * Integration tests for the cursor-based recipe model queries.
 *
 * These tests exercise the real `findCursor()` and `getFeed()` functions
 * against a PostgreSQL test database. They verify DESC/ASC ordering, the
 * `perPage + 1` hasMore detection, empty results, includeTotal, and feed
 * cursor dispatch.
 */

import '../../test-setup.ts';
import { afterAll, afterEach, beforeAll, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { db } from '@brewform/db';
import { recipes, userFollows, users } from '@brewform/db/schema';
import { eq, inArray } from 'drizzle-orm';
import * as model from './model.ts';
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

describe(
  { name: 'Recipe model — findCursor', sanitizeResources: false, sanitizeOps: false },
  () => {
    let author: typeof users.$inferSelect;
    const createdRecipes: string[] = [];
    let createdUsers: string[] = [];

    beforeAll(async () => {
      author = await createUser('cursor-model');
      createdUsers = [author.id];
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
      if (createdUsers.length) {
        await db.delete(users).where(inArray(users.id, createdUsers));
      }
    });

    it('returns the next DESC page using a cursor', async () => {
      const r1 = await createRecipe(author.id, 'Oldest', new Date('2026-07-01T00:00:00.000Z'));
      const r2 = await createRecipe(author.id, 'Middle', new Date('2026-07-02T00:00:00.000Z'));
      const r3 = await createRecipe(author.id, 'Newest', new Date('2026-07-03T00:00:00.000Z'));
      createdRecipes.push(r1.id, r2.id, r3.id);

      const _cursor = encodeCursor({ createdAt: r3.createdAt.toISOString(), id: r3.id });
      const result = await model.findCursor(
        eq(recipes.authorId, author.id),
        { createdAt: r3.createdAt.toISOString(), id: r3.id },
        10,
        'desc',
      );

      expect(result.recipes.length).toBe(2);
      expect(result.recipes[0].id).toBe(r2.id);
      expect(result.recipes[1].id).toBe(r1.id);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('returns the next ASC page using a cursor', async () => {
      const r1 = await createRecipe(author.id, 'ASC Oldest', new Date('2026-07-04T00:00:00.000Z'));
      const r2 = await createRecipe(author.id, 'ASC Middle', new Date('2026-07-05T00:00:00.000Z'));
      const r3 = await createRecipe(author.id, 'ASC Newest', new Date('2026-07-06T00:00:00.000Z'));
      createdRecipes.push(r1.id, r2.id, r3.id);

      const result = await model.findCursor(
        eq(recipes.authorId, author.id),
        { createdAt: r1.createdAt.toISOString(), id: r1.id },
        10,
        'asc',
      );

      expect(result.recipes.length).toBe(2);
      expect(result.recipes[0].id).toBe(r2.id);
      expect(result.recipes[1].id).toBe(r3.id);
      expect(result.hasMore).toBe(false);
    });

    it('detects hasMore when more rows exist and encodes the next cursor', async () => {
      const r1 = await createRecipe(author.id, 'HM1', new Date('2026-08-01T00:00:00.000Z'));
      const r2 = await createRecipe(author.id, 'HM2', new Date('2026-08-02T00:00:00.000Z'));
      const r3 = await createRecipe(author.id, 'HM3', new Date('2026-08-03T00:00:00.000Z'));
      createdRecipes.push(r1.id, r2.id, r3.id);

      const result = await model.findCursor(
        eq(recipes.authorId, author.id),
        { createdAt: r3.createdAt.toISOString(), id: r3.id },
        1,
        'desc',
      );

      expect(result.recipes.length).toBe(1);
      expect(result.recipes[0].id).toBe(r2.id);
      expect(result.hasMore).toBe(true);
      expect(typeof result.nextCursor).toBe('string');
    });

    it('returns empty result and null cursor when cursor points past the end', async () => {
      const r = await createRecipe(author.id, 'Last', new Date('2026-08-10T00:00:00.000Z'));
      createdRecipes.push(r.id);

      const _cursor = encodeCursor({
        createdAt: new Date('2000-01-01T00:00:00.000Z').toISOString(),
        id: r.id,
      });
      const result = await model.findCursor(
        eq(recipes.authorId, author.id),
        { createdAt: new Date('2000-01-01T00:00:00.000Z').toISOString(), id: r.id },
        10,
        'desc',
      );

      expect(result.recipes.length).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('returns total when includeTotal is true and zero results', async () => {
      const r = await createRecipe(author.id, 'Total Empty', new Date('2026-08-11T00:00:00.000Z'));
      createdRecipes.push(r.id);

      const result = await model.findCursor(
        eq(recipes.authorId, author.id),
        { createdAt: new Date('2000-01-01T00:00:00.000Z').toISOString(), id: r.id },
        10,
        'desc',
        true,
      );

      expect(result.recipes.length).toBe(0);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('excludes soft-deleted recipes from cursor pages', async () => {
      const r1 = await createRecipe(author.id, 'Visible', new Date('2026-09-01T00:00:00.000Z'));
      const r2 = await createRecipe(author.id, 'Deleted', new Date('2026-09-02T00:00:00.000Z'));
      createdRecipes.push(r1.id, r2.id);
      await db.update(recipes).set({ deletedAt: new Date() }).where(eq(recipes.id, r2.id));

      const _cursor = encodeCursor({
        createdAt: new Date('2099-01-01T00:00:00.000Z').toISOString(),
        id: r1.id,
      });
      const result = await model.findCursor(
        eq(recipes.authorId, author.id),
        { createdAt: new Date('2099-01-01T00:00:00.000Z').toISOString(), id: r1.id },
        10,
        'desc',
      );

      expect(result.recipes.length).toBe(1);
      expect(result.recipes[0].id).toBe(r1.id);
    });

    it('rejects cursor with date-only createdAt (not full ISO 8601)', async () => {
      await expect(
        model.findCursor(
          eq(recipes.authorId, author.id),
          { createdAt: '2026-01-15', id: '00000000-0000-0000-0000-000000000000' },
          10,
          'desc',
        ),
      ).rejects.toThrow('VALIDATION_ERROR: INVALID_CURSOR');
    });

    it('rejects cursor with non-ISO-8601 date string that JS Date would parse', async () => {
      await expect(
        model.findCursor(
          eq(recipes.authorId, author.id),
          { createdAt: 'January 1, 2025', id: '00000000-0000-0000-0000-000000000000' },
          10,
          'desc',
        ),
      ).rejects.toThrow('VALIDATION_ERROR: INVALID_CURSOR');
    });
  },
);

describe({
  name: 'Recipe model — getFeed with cursor',
  sanitizeResources: false,
  sanitizeOps: false,
}, () => {
  let follower: typeof users.$inferSelect;
  let author: typeof users.$inferSelect;
  const createdRecipes: string[] = [];
  const createdUsers: string[] = [];
  const createdFollows: string[] = [];

  beforeAll(async () => {
    follower = await createUser('feed-follower');
    author = await createUser('feed-author');
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

  it('dispatches to cursor pagination when a cursor is provided', async () => {
    const r1 = await createRecipe(author.id, 'Feed A', new Date('2026-10-01T00:00:00.000Z'));
    const r2 = await createRecipe(author.id, 'Feed B', new Date('2026-10-02T00:00:00.000Z'));
    createdRecipes.push(r1.id, r2.id);

    const result = await model.getFeed(
      [author.id],
      1,
      1,
      { createdAt: r2.createdAt.toISOString(), id: r2.id },
    );

    expect('hasMore' in result).toBe(true);
    expect(result.recipes.length).toBe(1);
    expect(result.recipes[0].id).toBe(r1.id);
    expect((result as any).hasMore).toBe(false);
    expect((result as any).nextCursor).toBeNull();
  });

  it('returns empty result when following no one', async () => {
    const result = await model.getFeed([], 1, 10);

    expect('total' in result).toBe(true);
    expect(result.recipes.length).toBe(0);
    expect(result.total).toBe(0);
  });
});
