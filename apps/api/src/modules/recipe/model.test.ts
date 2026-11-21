/**
 * DB-backed tests (`brewform_test`) of the recipe model, run against the real schema and `db`:
 *
 * - `upsertUserRating` — concurrent first ratings keep one row (error-handling);
 * - `decrementComments` — lowers the stored count by a bound amount (E1);
 * - deleted recipe authors (E11) — reads keep the recipe with `author: null` and the `author`
 *   filter stops matching the account;
 * - the version-column drift guard (a pure check against the real `recipe_version` table);
 * - `forkRecipe` — every version-level value is copied.
 *
 * The shared filter helper `buildRecipeFilters` is exercised through the real
 * `buildListRecipesWhere` → `findMany` path in `model.cursor.test.ts` ("Recipe model — list
 * filters (DB)"), search and the date range in `model.search.test.ts`; no copy of production
 * code lives here (model-test-coverage, "Test files exercise the production module they name").
 */

import '../../test-setup.ts';
import { db } from '@brewform/db';
import { recipes, recipeVersions, userRecipeRatings, users } from '@brewform/db/schema';
import { and, eq, getTableColumns } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NoteFixtures } from '../recipe-note/test-helpers.ts';
import * as recipeModel from './model.ts';
import * as recipeService from './service.ts';
import { RecipeWriteFixtures } from './test-helpers.ts';

/**
 * upsertUserRating — two concurrent first ratings by the same user must both
 * succeed and leave exactly one `user_recipe_rating` row (spec: error-handling,
 * "Concurrent first rating does not 500"). With select-then-insert both calls
 * see no row and the loser's insert hits the unique constraint.
 */
describe('upsertUserRating — concurrent first rating', () => {
  let userId: string;
  let recipeId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    recipeId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `rate-race-${userId}@example.com`,
      username: `rate-race-${userId.slice(0, 8)}`,
      passwordHash: 'hash',
    });
    await db.insert(recipes).values({
      id: recipeId,
      slug: `rate-race-${recipeId}`,
      title: 'Rate race',
      authorId: userId,
      visibility: 'public',
    });
  });

  afterEach(async () => {
    await db.delete(userRecipeRatings).where(eq(userRecipeRatings.recipeId, recipeId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should resolve both calls and keep one row holding one of the values', async () => {
    const results = await Promise.all([
      recipeService.upsertUserRating(userId, recipeId, 3),
      recipeService.upsertUserRating(userId, recipeId, 4),
    ]);
    expect(results.map((r) => r.rating).sort()).toEqual([3, 4]);

    const rows = await db
      .select({ rating: userRecipeRatings.rating, userId: userRecipeRatings.userId })
      .from(userRecipeRatings)
      .where(eq(userRecipeRatings.recipeId, recipeId));
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(userId);
    expect([3, 4]).toContain(rows[0].rating);
  });

  it('should update the existing row on a later rating', async () => {
    await recipeService.upsertUserRating(userId, recipeId, 2);
    await recipeService.upsertUserRating(userId, recipeId, 9);
    const rows = await db
      .select({ rating: userRecipeRatings.rating })
      .from(userRecipeRatings)
      .where(eq(userRecipeRatings.recipeId, recipeId));
    expect(rows).toEqual([{ rating: 9 }]);
  });
});

/** E1: `decrementComments(id, by)` lowers the stored count by the number of comments removed. */
describe('decrementComments — by a bound amount', () => {
  let userId: string;
  let recipeId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    recipeId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `decrement-${userId}@example.com`,
      username: `decrement-${userId.slice(0, 8)}`,
      passwordHash: 'hash',
    });
    await db.insert(recipes).values({
      id: recipeId,
      slug: `decrement-${recipeId}`,
      title: 'Decrement comments',
      authorId: userId,
      visibility: 'public',
      commentCount: 5,
    });
  });

  afterEach(async () => {
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('lowers commentCount by 3 with by = 3, then by 1 with the default', async () => {
    const afterThree = await recipeModel.decrementComments(recipeId, 3);
    expect(afterThree!.commentCount).toBe(2);
    const afterOne = await recipeModel.decrementComments(recipeId);
    expect(afterOne!.commentCount).toBe(1);
    const [row] = await db
      .select({ commentCount: recipes.commentCount })
      .from(recipes)
      .where(eq(recipes.id, recipeId));
    expect(row.commentCount).toBe(1);
  });
});

/**
 * E11 (account-deletion, "A deleted account has no public identity"): a recipe whose author
 * soft-deleted the account stays readable and listed, with `author: null`, and the `author`
 * filter no longer matches that account.
 */
describe('deleted recipe authors (E11)', () => {
  const fixtures = new NoteFixtures();

  afterEach(async () => {
    await fixtures.cleanup();
  });

  /** Soft-delete a user the way account deletion does (only the user row). */
  async function softDeleteUser(id: string): Promise<void> {
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));
  }

  it('findById, findBySlug and findListPage keep the recipe with author: null', async () => {
    const author = await fixtures.user('e11-recipe');
    const { recipe } = await fixtures.recipe(author.id);
    const scope = { where: eq(recipes.authorId, author.id), page: 1, perPage: 10 };
    const before = await recipeModel.findListPage(scope);
    expect(before.recipes[0].author).not.toBeNull();

    await softDeleteUser(author.id);

    const byId = await recipeModel.findById(recipe.id);
    expect(byId!.id).toBe(recipe.id);
    expect(byId!.author).toBeNull();
    const bySlug = await recipeModel.findBySlug(recipe.slug);
    expect(bySlug!.id).toBe(recipe.id);
    expect(bySlug!.author).toBeNull();
    const after = await recipeModel.findListPage(scope);
    expect(after.total).toBe(before.total);
    expect(after.recipes.map((r) => r.id)).toEqual([recipe.id]);
    expect(after.recipes[0].author).toBeNull();
  });

  it('a live author is still returned by findById', async () => {
    const author = await fixtures.user('e11-live');
    const { recipe } = await fixtures.recipe(author.id);
    const byId = await recipeModel.findById(recipe.id);
    expect(byId!.author).toEqual({
      id: author.id,
      username: author.username,
      displayName: null,
      avatarUrl: null,
    });
  });

  it('the author filter with the deleted username no longer finds the recipe', async () => {
    const author = await fixtures.user('e11-filter');
    const { recipe } = await fixtures.recipe(author.id);
    const where = () =>
      and(
        eq(recipes.authorId, author.id),
        ...recipeModel.buildRecipeFilters({ author: author.username }),
      );
    const live = await recipeModel.findListPage({ where: where(), page: 1, perPage: 10 });
    expect(live.recipes.map((r) => r.id)).toEqual([recipe.id]);

    await softDeleteUser(author.id);

    const gone = await recipeModel.findListPage({ where: where(), page: 1, perPage: 10 });
    expect(gone.recipes).toEqual([]);
    expect(gone.total).toBe(0);
  });
});

/** `recipe_version` columns every write path leaves to the database or sets itself. */
const VERSION_KEY_COLUMNS = ['id', 'recipeId', 'versionNumber', 'createdAt'];

/**
 * Drift guard (recipe-write, "Version-write paths share one column mapping"): a column added to
 * `recipeVersions` without updating `versionColumnsFrom` fails here and is named in the diff.
 */
describe('version-column mapping drift guard', () => {
  const tableKeys = Object.keys(getTableColumns(recipeVersions));
  const expected = tableKeys.filter((key) => !VERSION_KEY_COLUMNS.includes(key)).sort();
  /** One distinct marker value per table column (plus a relation key that must be dropped). */
  const sample = {
    ...Object.fromEntries(tableKeys.map((key) => [key, `value:${key}`])),
    tasteNotes: ['dropped'],
  } as unknown as recipeModel.RecipeVersionColumns;

  it('versionColumnsFrom maps every recipe_version column except id, recipeId, versionNumber, createdAt', () => {
    const mapped = recipeModel.versionColumnsFrom(sample) as Record<string, unknown>;
    const missing = expected.filter((key) => !(key in mapped));
    expect(missing).toEqual([]);
    expect(Object.keys(mapped).sort()).toEqual(expected);
    for (const key of expected) expect(mapped[key]).toBe(`value:${key}`);
  });

  it('copyVersionColumns uses the same keys and drops identity and relation keys', () => {
    const copied = recipeModel.copyVersionColumns(sample) as Record<string, unknown>;
    expect(Object.keys(copied).sort()).toEqual(expected);
    expect('id' in copied).toBe(false);
    expect('tasteNotes' in copied).toBe(false);
  });
});

/** recipe-write, "Fork copies every version-level value": tds and the coffee variety survive. */
describe('forkRecipe — version columns', () => {
  const fixtures = new RecipeWriteFixtures();

  afterEach(async () => {
    await fixtures.cleanup();
  });

  it('copies tds and the coffee variety and resets rating and isFavourite', async () => {
    const author = await fixtures.user('fork-cols-a');
    const forker = await fixtures.user('fork-cols-b');
    const variety = await fixtures.variety('Pink Bourbon');
    const source = await recipeModel.createRecipeWithRelations({
      authorId: author.id,
      slugCandidates: [`fork-cols-${crypto.randomUUID().slice(0, 8)}`],
      title: 'Fork columns',
      visibility: 'public',
      productName: 'Finca',
      coffeeBrand: null,
      coffeeProcessing: null,
      vendorId: null,
      roastDate: null,
      packageOpenDate: null,
      grindDate: null,
      brewDate: new Date(),
      brewMethod: 'v60',
      drinkType: 'pour_over',
      brewerDetails: null,
      grinder: null,
      grindSize: null,
      groundWeightGrams: null,
      extractionTimeSeconds: null,
      extractionVolumeMl: null,
      temperatureCelsius: null,
      tds: '1.30',
      brewRatio: null,
      flowRate: null,
      preInfusionTimeSeconds: null,
      beanId: null,
      coffeeVarietyId: variety.id,
      coffeeVarietyName: variety.name,
      personalNotes: 'Bright',
      preparationNotes: 'Bloom',
      isFavourite: true,
      rating: 8,
      emojiTag: 'fire',
    });

    const fork = await recipeModel.forkRecipe(source!.id, forker.id, 'Fork of columns', [
      `fork-cols-fork-${crypto.randomUUID().slice(0, 8)}`,
    ]);
    const forkVersion = fork!.versions[0];
    expect(forkVersion.tds).toBe('1.30');
    expect(forkVersion.coffeeVarietyId).toBe(variety.id);
    expect(forkVersion.coffeeVarietyName).toBe(variety.name);
    expect(forkVersion.productName).toBe('Finca');
    expect(forkVersion.emojiTag).toBe('fire');
    expect(forkVersion.rating).toBeNull();
    expect(forkVersion.isFavourite).toBe(false);
  });
});
