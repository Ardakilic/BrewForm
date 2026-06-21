// deno-lint-ignore-file no-explicit-any require-await

/**
 * Integration tests for the cursor-pagination routing in the recipe service.
 *
 * These tests exercise the real `listRecipes()` service function against a
 * PostgreSQL test database. They verify:
 *   - cursor mode vs offset mode routing
 *   - invalid cursor handling
 *   - sort fallback for mutable sort columns
 *   - mutual exclusion logging (cursor takes precedence)
 *   - cursor direction reuse (DESC cursor used with ASC order)
 */

import '../../test-setup.ts';
import { afterAll, beforeAll, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { db } from '@brewform/db';
import { recipes, users } from '@brewform/db/schema';
import { inArray } from 'drizzle-orm';
import * as service from './service.ts';
import { encodeCursor } from '@brewform/shared/utils';

async function createTestUser(prefix: string) {
  const id = crypto.randomUUID();
  const [user] = await db.insert(users).values({
    id,
    email: `${prefix}-${id}@example.com`,
    username: `${prefix}-${id.slice(0, 8)}`,
    passwordHash: 'hash',
  }).returning();
  return user;
}

async function createTestRecipe(
  authorId: string,
  title: string,
  overrides: Partial<typeof recipes.$inferInsert> = {},
) {
  const id = crypto.randomUUID();
  const [recipe] = await db.insert(recipes).values({
    id,
    slug: `slug-${id.slice(0, 8)}`,
    title,
    authorId,
    visibility: 'public',
    createdAt: overrides.createdAt ?? new Date(),
    ...overrides,
  }).returning();
  return recipe;
}

describe({
  name: 'Recipe service — cursor pagination routing',
  sanitizeResources: false,
  sanitizeOps: false,
}, () => {
  let author: typeof users.$inferSelect;
  const recipesToClean: string[] = [];
  const usersToClean: string[] = [];

  beforeAll(async () => {
    author = await createTestUser('cursor-svc');
    usersToClean.push(author.id);
  });

  afterAll(async () => {
    if (recipesToClean.length) {
      await db.delete(recipes).where(inArray(recipes.id, recipesToClean));
    }
    if (usersToClean.length) {
      await db.delete(users).where(inArray(users.id, usersToClean));
    }
  });

  it('returns offset pagination when no cursor is provided', async () => {
    const r = await createTestRecipe(author.id, 'Offset Recipe');
    recipesToClean.push(r.id);

    const result = await service.listRecipes(
      { sortBy: 'createdAt', sortOrder: 'desc' } as any,
      1,
      10,
    );

    expect('total' in result).toBe(true);
    expect(result.recipes.length).toBeGreaterThanOrEqual(1);
  });

  it('returns cursor pagination when a valid cursor is provided with sortBy=createdAt', async () => {
    const r1 = await createTestRecipe(author.id, 'Cursor First', {
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    const r2 = await createTestRecipe(author.id, 'Cursor Second', {
      createdAt: new Date('2026-05-02T00:00:00.000Z'),
    });
    recipesToClean.push(r1.id, r2.id);

    const firstPage = await service.listRecipes(
      { sortBy: 'createdAt', sortOrder: 'desc', perPage: 1 } as any,
      1,
      1,
    );
    expect('total' in firstPage).toBe(true);

    const cursor = encodeCursor({ createdAt: r2.createdAt.toISOString(), id: r2.id });
    const result = await service.listRecipes(
      { sortBy: 'createdAt', sortOrder: 'desc', cursor } as any,
      1,
      10,
    );

    expect('hasMore' in result).toBe(true);
    expect(result.recipes.length).toBe(1);
    expect((result as any).recipes[0].id).toBe(r1.id);
    expect((result as any).hasMore).toBe(false);
  });

  it('falls back to offset pagination when cursor is provided with sortBy=likeCount', async () => {
    const r = await createTestRecipe(author.id, 'LikeCount Fallback');
    recipesToClean.push(r.id);

    const cursor = encodeCursor({ createdAt: r.createdAt.toISOString(), id: r.id });
    const result = await service.listRecipes({ sortBy: 'likeCount', cursor } as any, 1, 10);

    expect('total' in result).toBe(true);
    expect('hasMore' in result).toBe(false);
  });

  it('throws INVALID_CURSOR when cursor cannot be decoded', async () => {
    await expect(
      service.listRecipes({ sortBy: 'createdAt', cursor: '!!!invalid!!!' } as any, 1, 10),
    ).rejects.toThrow('VALIDATION_ERROR: INVALID_CURSOR');
  });

  it('allows a DESC cursor to be reused with ASC sortOrder', async () => {
    const r1 = await createTestRecipe(author.id, 'Reuse A', {
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    const r2 = await createTestRecipe(author.id, 'Reuse B', {
      createdAt: new Date('2026-06-02T00:00:00.000Z'),
    });
    recipesToClean.push(r1.id, r2.id);

    const descCursor = encodeCursor({ createdAt: r1.createdAt.toISOString(), id: r1.id });
    const ascResult = await service.listRecipes(
      { sortBy: 'createdAt', sortOrder: 'asc', cursor: descCursor } as any,
      1,
      10,
    );

    expect('hasMore' in ascResult).toBe(true);
    expect((ascResult as any).recipes.some((recipe: any) => recipe.id === r2.id)).toBe(true);
    expect((ascResult as any).recipes.some((recipe: any) => recipe.id === r1.id)).toBe(false);
  });

  it('includes total when includeTotal=true in cursor mode', async () => {
    const r = await createTestRecipe(author.id, 'Include Total');
    recipesToClean.push(r.id);

    const futureCursor = encodeCursor({
      createdAt: new Date('2099-01-01T00:00:00.000Z').toISOString(),
      id: r.id,
    });
    const result = await service.listRecipes(
      { sortBy: 'createdAt', cursor: futureCursor, includeTotal: true } as any,
      1,
      10,
    );
    const cursorResult = result as { hasMore: boolean; total?: number; recipes: unknown[] };

    expect('hasMore' in result).toBe(true);
    expect(typeof cursorResult.total).toBe('number');
  });
});
