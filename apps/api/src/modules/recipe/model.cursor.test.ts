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
import {
  recipes,
  recipeTasteNotes,
  recipeVersions,
  tasteNotes,
  userFollows,
  userRecipeFavourites,
  users,
} from '@brewform/db/schema';
import { eq, inArray } from 'drizzle-orm';
import * as model from './model.ts';
import { decodeCursor, encodeCursor } from '@brewform/shared/utils';

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
    // deno-lint-ignore no-explicit-any -- test assertion cast
    expect((result as any).hasMore).toBe(false);
    // deno-lint-ignore no-explicit-any -- test assertion cast
    expect((result as any).nextCursor).toBeNull();
  });

  it('returns empty result when following no one', async () => {
    const result = await model.getFeed([], 1, 10);

    expect('total' in result).toBe(true);
    expect(result.recipes.length).toBe(0);
    expect(result.total).toBe(0);
  });
});

describe(
  { name: 'Recipe model — findCursor edge cases', sanitizeResources: false, sanitizeOps: false },
  () => {
    let author: typeof users.$inferSelect;
    const createdRecipes: string[] = [];
    const createdUsers: string[] = [];

    beforeAll(async () => {
      author = await createUser('cursor-edge');
      createdUsers.push(author.id);
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

    it('queries with an undefined base where clause', async () => {
      const r1 = await createRecipe(author.id, 'NoWhere A', new Date('2026-11-01T00:00:00.000Z'));
      const r2 = await createRecipe(author.id, 'NoWhere B', new Date('2026-11-02T00:00:00.000Z'));
      createdRecipes.push(r1.id, r2.id);

      const result = await model.findCursor(
        undefined,
        { createdAt: r2.createdAt.toISOString(), id: r2.id },
        100,
        'desc',
      );

      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
      expect(result.recipes.some((r) => r.id === r1.id)).toBe(true);
      expect(result.recipes.some((r) => r.id === r2.id)).toBe(false);
    });

    it('populates total from an undefined where clause when includeTotal is true', async () => {
      const r = await createRecipe(
        author.id,
        'NoWhere Total',
        new Date('2026-11-03T00:00:00.000Z'),
      );
      createdRecipes.push(r.id);

      const result = await model.findCursor(
        undefined,
        { createdAt: new Date('2099-01-01T00:00:00.000Z').toISOString(), id: r.id },
        10,
        'desc',
        true,
      );

      expect(typeof result.total).toBe('number');
      expect(result.total!).toBeGreaterThanOrEqual(1);
    });

    it('reports total and an encoded nextCursor when includeTotal is true with more rows', async () => {
      const r1 = await createRecipe(author.id, 'Total A', new Date('2026-12-01T00:00:00.000Z'));
      const r2 = await createRecipe(author.id, 'Total B', new Date('2026-12-02T00:00:00.000Z'));
      const r3 = await createRecipe(author.id, 'Total C', new Date('2026-12-03T00:00:00.000Z'));
      createdRecipes.push(r1.id, r2.id, r3.id);

      const result = await model.findCursor(
        eq(recipes.authorId, author.id),
        { createdAt: r3.createdAt.toISOString(), id: r3.id },
        1,
        'desc',
        true,
      );

      expect(result.recipes.length).toBe(1);
      expect(result.recipes[0].id).toBe(r2.id);
      expect(result.hasMore).toBe(true);
      expect(typeof result.nextCursor).toBe('string');
      expect(result.total).toBe(3);

      const decoded = decodeCursor(result.nextCursor!);
      expect(decoded.id).toBe(r2.id);
    });

    it('encodes an ASC nextCursor when more rows exist', async () => {
      const r1 = await createRecipe(author.id, 'AscMore A', new Date('2027-01-01T00:00:00.000Z'));
      const r2 = await createRecipe(author.id, 'AscMore B', new Date('2027-01-02T00:00:00.000Z'));
      const r3 = await createRecipe(author.id, 'AscMore C', new Date('2027-01-03T00:00:00.000Z'));
      createdRecipes.push(r1.id, r2.id, r3.id);

      const result = await model.findCursor(
        eq(recipes.authorId, author.id),
        { createdAt: r1.createdAt.toISOString(), id: r1.id },
        1,
        'asc',
      );

      expect(result.recipes.length).toBe(1);
      expect(result.recipes[0].id).toBe(r2.id);
      expect(result.hasMore).toBe(true);
      const decoded = decodeCursor(result.nextCursor!);
      expect(decoded.id).toBe(r2.id);
    });
  },
);

describe(
  { name: 'Recipe model — list filters (DB)', sanitizeResources: false, sanitizeOps: false },
  () => {
    let author: typeof users.$inferSelect;
    let other: typeof users.$inferSelect;
    const createdRecipes: string[] = [];
    const createdVersions: string[] = [];
    const createdTasteNoteCatalog: string[] = [];
    const createdUsers: string[] = [];

    /** Insert a recipe + its first version, linking `currentVersionId`. */
    async function createRecipeWithVersion(
      authorId: string,
      title: string,
      opts: {
        visibility?: 'public' | 'draft' | 'private' | 'unlisted';
        brewMethod?: string;
        drinkType?: string;
        productName?: string;
        createdAt?: Date;
      } = {},
    ) {
      const recipeId = crypto.randomUUID();
      const [recipe] = await db.insert(recipes).values({
        id: recipeId,
        slug: `slug-${recipeId.slice(0, 8)}`,
        title,
        authorId,
        visibility: opts.visibility ?? 'public',
        createdAt: opts.createdAt ?? new Date(),
      }).returning();
      createdRecipes.push(recipe.id);

      const [version] = await db.insert(recipeVersions).values({
        recipeId: recipe.id,
        versionNumber: 1,
        brewMethod: (opts.brewMethod ?? 'v60') as typeof recipeVersions.$inferInsert.brewMethod,
        drinkType: (opts.drinkType ?? 'pour_over') as typeof recipeVersions.$inferInsert.drinkType,
        productName: opts.productName,
        preparationNotes: 'test preparation',
      }).returning();
      createdVersions.push(version.id);

      await db.update(recipes).set({ currentVersionId: version.id }).where(
        eq(recipes.id, recipe.id),
      );
      return { recipe, version };
    }

    async function createTasteNote() {
      const id = crypto.randomUUID();
      await db.insert(tasteNotes).values({ id, name: `Note-${id.slice(0, 8)}` });
      createdTasteNoteCatalog.push(id);
      return id;
    }

    beforeAll(async () => {
      author = await createUser('filter-author');
      other = await createUser('filter-other');
      createdUsers.push(author.id, other.id);
    });

    afterEach(async () => {
      if (createdRecipes.length) {
        await db.delete(userRecipeFavourites).where(
          inArray(userRecipeFavourites.recipeId, createdRecipes),
        );
        await db.delete(recipeTasteNotes).where(
          inArray(recipeTasteNotes.recipeVersionId, createdVersions),
        );
        await db.delete(recipeVersions).where(inArray(recipeVersions.recipeId, createdRecipes));
        await db.delete(recipes).where(inArray(recipes.id, createdRecipes));
        createdRecipes.length = 0;
        createdVersions.length = 0;
      }
      if (createdTasteNoteCatalog.length) {
        await db.delete(tasteNotes).where(inArray(tasteNotes.id, createdTasteNoteCatalog));
        createdTasteNoteCatalog.length = 0;
      }
    });

    afterAll(async () => {
      if (createdRecipes.length) {
        await db.delete(recipeVersions).where(inArray(recipeVersions.recipeId, createdRecipes));
        await db.delete(recipes).where(inArray(recipes.id, createdRecipes));
      }
      if (createdTasteNoteCatalog.length) {
        await db.delete(tasteNotes).where(inArray(tasteNotes.id, createdTasteNoteCatalog));
      }
      if (createdUsers.length) {
        await db.delete(users).where(inArray(users.id, createdUsers));
      }
    });

    it('restricts non-admins to public recipes', async () => {
      const pub = await createRecipeWithVersion(author.id, 'Public One');
      await createRecipeWithVersion(author.id, 'Draft One', { visibility: 'draft' });

      const where = model.buildListRecipesWhere({}, false);
      const result = await model.findMany(where, 1, 100);
      const ids = result.recipes.map((r) => r.id);
      expect(ids).toContain(pub.recipe.id);
      expect(result.recipes.every((r) => r.visibility === 'public')).toBe(true);
    });

    it('lets admins filter by a specific visibility', async () => {
      await createRecipeWithVersion(author.id, 'Public Two');
      const draft = await createRecipeWithVersion(author.id, 'Draft Two', { visibility: 'draft' });

      const where = model.buildListRecipesWhere({ visibility: 'draft' }, true);
      const result = await model.findMany(where, 1, 100);
      const ids = result.recipes.map((r) => r.id);
      expect(ids).toContain(draft.recipe.id);
      expect(result.recipes.every((r) => r.visibility === 'draft')).toBe(true);
    });

    it('scopes results to a given authorId', async () => {
      const mine = await createRecipeWithVersion(author.id, 'Author Scope Mine');
      await createRecipeWithVersion(other.id, 'Author Scope Other');

      const where = model.buildListRecipesWhere({ authorId: author.id }, false);
      const result = await model.findMany(where, 1, 100);
      const ids = result.recipes.map((r) => r.id);
      expect(ids).toContain(mine.recipe.id);
      expect(result.recipes.every((r) => r.authorId === author.id)).toBe(true);
    });

    it('filters by brewMethod via the version subquery', async () => {
      const v60 = await createRecipeWithVersion(author.id, 'Brew V60', { brewMethod: 'v60' });
      await createRecipeWithVersion(author.id, 'Brew Espresso', { brewMethod: 'espresso_machine' });

      const where = model.buildListRecipesWhere(
        { authorId: author.id, brewMethod: 'v60' as never },
        false,
      );
      const result = await model.findMany(where, 1, 100);
      const ids = result.recipes.map((r) => r.id);
      expect(ids).toContain(v60.recipe.id);
      expect(ids.length).toBe(1);
    });

    it('filters by drinkType via the version subquery', async () => {
      const espresso = await createRecipeWithVersion(author.id, 'Drink Espresso', {
        drinkType: 'espresso',
      });
      await createRecipeWithVersion(author.id, 'Drink PourOver', { drinkType: 'pour_over' });

      const where = model.buildListRecipesWhere(
        { authorId: author.id, drinkType: 'espresso' as never },
        false,
      );
      const result = await model.findMany(where, 1, 100);
      const ids = result.recipes.map((r) => r.id);
      expect(ids).toContain(espresso.recipe.id);
      expect(ids.length).toBe(1);
    });

    it('filters by search term against the title', async () => {
      const match = await createRecipeWithVersion(author.id, 'Zesty Citrus Bloom');
      await createRecipeWithVersion(author.id, 'Plain Brew');

      // F11: scope by authorId to isolate from seeded data (search now also matches personalNotes)
      const where = model.buildListRecipesWhere({ search: 'Citrus', authorId: author.id }, false);
      const result = await model.findMany(where, 1, 100);
      const ids = result.recipes.map((r) => r.id);
      expect(ids).toContain(match.recipe.id);
      expect(ids.length).toBe(1);
    });

    it('ignores a search term that sanitizes to empty', async () => {
      const r = await createRecipeWithVersion(author.id, 'Search Empty Sanitize');

      const where = model.buildListRecipesWhere({ search: '%_%' }, false);
      const result = await model.findMany(where, 1, 100);
      const ids = result.recipes.map((r) => r.id);
      expect(ids).toContain(r.recipe.id);
    });

    it('filters by tasteNoteIds against the current version', async () => {
      const noteId = await createTasteNote();
      const withNote = await createRecipeWithVersion(author.id, 'Tasty Recipe');
      await db.insert(recipeTasteNotes).values({
        recipeVersionId: withNote.version.id,
        tasteNoteId: noteId,
        intensity: 2,
      });
      await createRecipeWithVersion(author.id, 'Bland Recipe');

      const where = model.buildListRecipesWhere({ tasteNoteIds: noteId }, false);
      const result = await model.findMany(where, 1, 100);
      const ids = result.recipes.map((r) => r.id);
      expect(ids).toContain(withNote.recipe.id);
      expect(ids.length).toBe(1);
    });
  },
);

describe(
  { name: 'Recipe model — findStarred (DB)', sanitizeResources: false, sanitizeOps: false },
  () => {
    let author: typeof users.$inferSelect;
    let viewer: typeof users.$inferSelect;
    const createdRecipes: string[] = [];
    const createdVersions: string[] = [];
    const createdUsers: string[] = [];

    async function createPublicRecipeWithVersion(
      authorId: string,
      title: string,
      brewMethod: string,
    ) {
      const recipeId = crypto.randomUUID();
      const [recipe] = await db.insert(recipes).values({
        id: recipeId,
        slug: `slug-${recipeId.slice(0, 8)}`,
        title,
        authorId,
        visibility: 'public',
      }).returning();
      createdRecipes.push(recipe.id);
      const [version] = await db.insert(recipeVersions).values({
        recipeId: recipe.id,
        versionNumber: 1,
        brewMethod: brewMethod as typeof recipeVersions.$inferInsert.brewMethod,
        drinkType: 'pour_over',
        preparationNotes: 'test preparation',
      }).returning();
      createdVersions.push(version.id);
      await db.update(recipes).set({ currentVersionId: version.id }).where(
        eq(recipes.id, recipe.id),
      );
      return recipe;
    }

    beforeAll(async () => {
      author = await createUser('starred-author');
      viewer = await createUser('starred-viewer');
      createdUsers.push(author.id, viewer.id);
    });

    afterEach(async () => {
      if (createdRecipes.length) {
        await db.delete(userRecipeFavourites).where(
          inArray(userRecipeFavourites.recipeId, createdRecipes),
        );
        await db.delete(recipeVersions).where(inArray(recipeVersions.recipeId, createdRecipes));
        await db.delete(recipes).where(inArray(recipes.id, createdRecipes));
        createdRecipes.length = 0;
        createdVersions.length = 0;
      }
    });

    afterAll(async () => {
      if (createdRecipes.length) {
        await db.delete(recipeVersions).where(inArray(recipeVersions.recipeId, createdRecipes));
        await db.delete(recipes).where(inArray(recipes.id, createdRecipes));
      }
      if (createdUsers.length) {
        await db.delete(users).where(inArray(users.id, createdUsers));
      }
    });

    it('returns only the recipes the user has favourited', async () => {
      const starred = await createPublicRecipeWithVersion(author.id, 'Starred Brew', 'v60');
      await createPublicRecipeWithVersion(author.id, 'Not Starred Brew', 'v60');
      await db.insert(userRecipeFavourites).values({ userId: viewer.id, recipeId: starred.id });

      const result = await model.findStarred(viewer.id, {}, 1, 100);
      const ids = result.recipes.map((r) => r.id);
      expect(ids).toEqual([starred.id]);
      expect(result.total).toBe(1);
    });

    it('applies filter branches on top of the favourites scope', async () => {
      const starred = await createPublicRecipeWithVersion(author.id, 'Starred V60', 'v60');
      await db.insert(userRecipeFavourites).values({ userId: viewer.id, recipeId: starred.id });

      const matching = await model.findStarred(viewer.id, { brewMethod: 'v60' as never }, 1, 100);
      expect(matching.recipes.map((r) => r.id)).toEqual([starred.id]);

      const none = await model.findStarred(
        viewer.id,
        { brewMethod: 'espresso_machine' as never },
        1,
        100,
      );
      expect(none.recipes.length).toBe(0);
      expect(none.total).toBe(0);
    });

    it('honours sortBy=likeCount and sortOrder=asc options', async () => {
      const starred = await createPublicRecipeWithVersion(author.id, 'Starred Sorted', 'v60');
      await db.insert(userRecipeFavourites).values({ userId: viewer.id, recipeId: starred.id });

      const result = await model.findStarred(
        viewer.id,
        { sortBy: 'likeCount', sortOrder: 'asc' },
        1,
        100,
      );
      expect(result.recipes.map((r) => r.id)).toEqual([starred.id]);
    });
  },
);
