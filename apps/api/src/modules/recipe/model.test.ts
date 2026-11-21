/**
 * Unit tests for buildRecipeFilters() — the shared filter-building helper.
 *
 * These tests use a minimal mock Drizzle surface (eq, inArray, ilike, or, union)
 * matching the pattern in service.preservation.test.ts, so no real DB is
 * required. The tests verify the shape of the SQL[] returned for each
 * filter branch.
 *
 * NOTE: Because the real helper imports `db` and Drizzle operators from
 * modules that cannot be cleanly stubbed under Vitest, this file holds a
 * faithful inline copy of `buildRecipeFilters` (and the delegated
 * `recipeCoffeeVarietyCondition`) wired against the local mock surface.
 * Mirror any change to the real implementation here.
 *
 * TODO(integration-testing): Evaluate lightweight integration options
 * (in-memory PostgreSQL, testcontainers, or minimal adapter stubs) so the
 * real `buildRecipeFilters` and `recipeCoffeeVarietyCondition` exported
 * from `./model.ts` can be exercised here without a full DB fixture.
 * Tracking this in the repo issue tracker is the recommended follow-up;
 * once a path is chosen, the duplicated inline copy in this file should
 * be removed in favour of importing the real implementations.
 *
 * The final `upsertUserRating — concurrent first rating` and `forkRecipe —
 * version columns` blocks are the exception: they are DB-backed
 * (`brewform_test`) and use the real schema and `db`, imported under
 * `*Table`/`realDb` aliases so they do not clash with the mock surface above.
 * The version-column drift guard is a pure check against the real table.
 */

import '../../test-setup.ts';
import { db as realDb } from '@brewform/db';
import {
  userRecipeRatings as ratingsTable,
  recipes as recipesTable,
  recipeVersions as recipeVersionsTable,
  users as usersTable,
} from '@brewform/db/schema';
import { eq as drizzleEq, getTableColumns } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizeSearchTerm, toContainsPattern } from '../../utils/search.ts';
import * as recipeModel from './model.ts';
import * as recipeService from './service.ts';
import { RecipeWriteFixtures } from './test-helpers.ts';

type MockCondition = {
  type: string;
  column?: string | MockCondition;
  value?: unknown;
  conditions?: MockCondition[];
};

function eq(column: string, value: unknown): MockCondition {
  return { type: 'eq', column, value };
}

function inArray(column: string, subquery: unknown): MockCondition {
  return { type: 'inArray', column, value: subquery };
}

function ilike(column: string, value: unknown): MockCondition {
  return { type: 'ilike', column, value };
}

function or(...conditions: MockCondition[]): MockCondition {
  return { type: 'or', conditions };
}

function gte(column: string | MockCondition, value: unknown): MockCondition {
  return { type: 'gte', column, value };
}

function lte(column: string | MockCondition, value: unknown): MockCondition {
  return { type: 'lte', column, value };
}

function avg(column: string): MockCondition {
  return { type: 'avg', column };
}

function and(...conditions: (MockCondition | undefined)[]): MockCondition | undefined {
  const filtered = conditions.filter((c) => c !== undefined) as MockCondition[];
  if (filtered.length === 0) return undefined;
  if (filtered.length === 1) return filtered[0];
  return { type: 'and', conditions: filtered };
}

function union(...selects: unknown[]): MockCondition {
  return { type: 'union', value: selects };
}

const recipes = {
  id: 'recipes.id',
  currentVersionId: 'recipes.currentVersionId',
  title: 'recipes.title',
  createdAt: 'recipes.createdAt',
  authorId: 'recipes.authorId',
  featured: 'recipes.featured',
};

const recipeVersions = {
  recipeId: 'recipeVersions.recipeId',
  brewMethod: 'recipeVersions.brewMethod',
  drinkType: 'recipeVersions.drinkType',
  productName: 'recipeVersions.productName',
  brewerDetails: 'recipeVersions.brewerDetails',
  coffeeVarietyId: 'recipeVersions.coffeeVarietyId',
  personalNotes: 'recipeVersions.personalNotes',
  id: 'recipeVersions.id',
};

const recipeEquipment = {
  recipeVersionId: 'recipeEquipment.recipeVersionId',
  equipmentId: 'recipeEquipment.equipmentId',
};

const recipeTasteNotes = {
  recipeVersionId: 'recipeTasteNotes.recipeVersionId',
  tasteNoteId: 'recipeTasteNotes.tasteNoteId',
};

const users = {
  id: 'users.id',
  username: 'users.username',
  displayName: 'users.displayName',
};

const userRecipeRatings = {
  recipeId: 'userRecipeRatings.recipeId',
  rating: 'userRecipeRatings.rating',
};

// The db mock needs an `any` type because the real Drizzle db has a deeply
// chained query builder (select → from → where/groupBy/having) whose exact
// return types are not exported. The mock returns plain objects that satisfy
// the shape buildRecipeFilters builds, so any is the pragmatic choice here.
// biome-ignore lint/suspicious/noExplicitAny: test mock parameter
const db: any = {
  select: (projection: unknown) => ({
    from: (table: unknown) => ({
      where: (cond: unknown) => ({ projection, table, where: cond }),
      groupBy: (..._cols: unknown[]) => ({
        having: (cond: unknown) => ({ projection, table, having: cond }),
      }),
    }),
  }),
};

interface RecipeFilterCriteria {
  brewMethod?: string;
  drinkType?: string;
  search?: string;
  equipmentId?: string;
  tasteNoteIds?: string;
  tasteNoteId?: string;
  mainBrewer?: string;
  coffeeVarietyId?: string;
  author?: string;
  minRating?: number;
  maxRating?: number;
}

function recipeCoffeeVarietyCondition(coffeeVarietyId: string): MockCondition {
  return inArray(
    recipes.id,
    db
      .select({ id: recipeVersions.recipeId })
      .from(recipeVersions)
      .where(eq(recipeVersions.coffeeVarietyId, coffeeVarietyId)),
  );
}

function buildRecipeFilters(filters: RecipeFilterCriteria): MockCondition[] {
  const conditions: MockCondition[] = [];

  if (filters.brewMethod) {
    conditions.push(
      inArray(
        recipes.id,
        db
          .select({ id: recipeVersions.recipeId })
          .from(recipeVersions)
          .where(eq(recipeVersions.brewMethod, filters.brewMethod)),
      ),
    );
  }

  if (filters.drinkType) {
    conditions.push(
      inArray(
        recipes.id,
        db
          .select({ id: recipeVersions.recipeId })
          .from(recipeVersions)
          .where(eq(recipeVersions.drinkType, filters.drinkType)),
      ),
    );
  }

  // Wave 6: search is ONE condition on recipes.id — the union of recipe ids whose title
  // matches and recipe ids with any version whose productName or personalNotes matches
  // (F11 added personalNotes, weight 1). Each branch can bitmap-scan its own trigram index,
  // and the union de-duplicates recipes that match through several versions.
  const searchTerm = normalizeSearchTerm(filters.search);
  if (searchTerm) {
    const pattern = toContainsPattern(searchTerm);
    const titleIds = db
      .select({ id: recipes.id })
      .from(recipes)
      .where(ilike(recipes.title, pattern));
    const versionRecipeIds = db
      .select({ id: recipeVersions.recipeId })
      .from(recipeVersions)
      .where(
        or(
          ilike(recipeVersions.productName, pattern),
          ilike(recipeVersions.personalNotes, pattern),
        ),
      );
    const searchCondition = inArray(recipes.id, union(titleIds, versionRecipeIds));
    if (searchCondition) conditions.push(searchCondition);
  }

  // Literal (escaped) substring match on any version's brewer details.
  const mainBrewerTerm = normalizeSearchTerm(filters.mainBrewer);
  if (mainBrewerTerm) {
    conditions.push(
      inArray(
        recipes.id,
        db
          .select({ id: recipeVersions.recipeId })
          .from(recipeVersions)
          .where(ilike(recipeVersions.brewerDetails, toContainsPattern(mainBrewerTerm))),
      ),
    );
  }

  // F11: author username/displayName substring filter (literal, escaped pattern)
  const authorTerm = normalizeSearchTerm(filters.author);
  if (authorTerm) {
    const pattern = toContainsPattern(authorTerm);
    conditions.push(
      inArray(
        recipes.authorId,
        db
          .select({ id: users.id })
          .from(users)
          .where(or(ilike(users.username, pattern), ilike(users.displayName, pattern))),
      ),
    );
  }

  // F11: rating range filter via avg(userRecipeRatings.rating) subquery
  if (filters.minRating || filters.maxRating) {
    const minCondition = filters.minRating
      ? gte(avg(userRecipeRatings.rating), filters.minRating)
      : undefined;
    const maxCondition = filters.maxRating
      ? lte(avg(userRecipeRatings.rating), filters.maxRating)
      : undefined;
    const havingClause = and(minCondition, maxCondition);
    if (havingClause) {
      conditions.push(
        inArray(
          recipes.id,
          db
            .select({ recipeId: userRecipeRatings.recipeId })
            .from(userRecipeRatings)
            .groupBy(userRecipeRatings.recipeId)
            .having(havingClause),
        ),
      );
    }
  }

  if (filters.coffeeVarietyId) {
    conditions.push(recipeCoffeeVarietyCondition(filters.coffeeVarietyId));
  }

  if (filters.equipmentId) {
    conditions.push(
      inArray(
        recipes.currentVersionId,
        db
          .select({ id: recipeEquipment.recipeVersionId })
          .from(recipeEquipment)
          .where(eq(recipeEquipment.equipmentId, filters.equipmentId)),
      ),
    );
  }

  if (filters.tasteNoteIds) {
    const ids = filters.tasteNoteIds.split(',').map((id) => id.trim());
    for (const noteId of ids) {
      conditions.push(
        inArray(
          recipes.currentVersionId,
          db
            .select({ id: recipeTasteNotes.recipeVersionId })
            .from(recipeTasteNotes)
            .where(eq(recipeTasteNotes.tasteNoteId, noteId)),
        ),
      );
    }
  } else if (filters.tasteNoteId) {
    conditions.push(
      inArray(
        recipes.currentVersionId,
        db
          .select({ id: recipeTasteNotes.recipeVersionId })
          .from(recipeTasteNotes)
          .where(eq(recipeTasteNotes.tasteNoteId, filters.tasteNoteId)),
      ),
    );
  }

  return conditions;
}

/** A mock `db.select().from().where()` subquery as built by the mirror above. */
type MockSelect = { projection: unknown; table: unknown; where: MockCondition };

/**
 * The two branches of a search condition `inArray(recipes.id, union(titleIds,
 * versionRecipeIds))`.
 */
function searchBranches(condition: MockCondition): [MockSelect, MockSelect] {
  const unionNode = condition.value as MockCondition;
  expect(unionNode.type).toBe('union');
  return unionNode.value as [MockSelect, MockSelect];
}

/** Every `ilike` pattern in a search condition: title, productName, personalNotes. */
function searchPatterns(condition: MockCondition): unknown[] {
  const [titleIds, versionRecipeIds] = searchBranches(condition);
  const versionConditions = versionRecipeIds.where.conditions ?? [];
  return [titleIds.where.value, ...versionConditions.map((c) => c.value)];
}

describe('buildRecipeFilters', () => {
  it('returns an empty array when no filters are set', () => {
    const result = buildRecipeFilters({});
    expect(result).toEqual([]);
  });

  it('generates a brewMethod condition', () => {
    const result = buildRecipeFilters({ brewMethod: 'v60' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('inArray');
    expect(result[0].column).toBe(recipes.id);
    const sub = result[0].value as { where: MockCondition };
    expect(sub.where).toEqual(eq(recipeVersions.brewMethod, 'v60'));
  });

  it('generates a drinkType condition', () => {
    const result = buildRecipeFilters({ drinkType: 'espresso' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('inArray');
    expect(result[0].column).toBe(recipes.id);
    const sub = result[0].value as { where: MockCondition };
    expect(sub.where).toEqual(eq(recipeVersions.drinkType, 'espresso'));
  });

  it('generates one escaped union search condition', () => {
    const result = buildRecipeFilters({ search: 'fr%uit_y' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('inArray');
    expect(result[0].column).toBe(recipes.id);
    const [titleIds] = searchBranches(result[0]);
    expect(titleIds.where).toEqual(ilike(recipes.title, '%fr\\%uit\\_y%'));
  });

  it('skips search when the trimmed input is empty', () => {
    expect(buildRecipeFilters({ search: '   ' })).toEqual([]);
    expect(buildRecipeFilters({ search: '' })).toEqual([]);
  });

  it('treats metacharacter-only search as a literal search', () => {
    const result = buildRecipeFilters({ search: '%_%' });
    expect(result).toHaveLength(1);
    expect(searchPatterns(result[0])).toEqual(['%\\%\\_\\%%', '%\\%\\_\\%%', '%\\%\\_\\%%']);
  });

  it('generates an escaped mainBrewer condition', () => {
    const result = buildRecipeFilters({ mainBrewer: ' Hario% ' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('inArray');
    expect(result[0].column).toBe(recipes.id);
    const sub = result[0].value as { where: MockCondition };
    expect(sub.where).toEqual(ilike(recipeVersions.brewerDetails, '%Hario\\%%'));
  });

  it('skips mainBrewer when the trimmed input is empty', () => {
    expect(buildRecipeFilters({ mainBrewer: '  ' })).toEqual([]);
    expect(buildRecipeFilters({ mainBrewer: '' })).toEqual([]);
  });

  it('generates an equipmentId condition', () => {
    const result = buildRecipeFilters({ equipmentId: 'equip-uuid' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('inArray');
    expect(result[0].column).toBe(recipes.currentVersionId);
    const sub = result[0].value as { where: MockCondition };
    expect(sub.where).toEqual(eq(recipeEquipment.equipmentId, 'equip-uuid'));
  });

  it('delegates coffeeVarietyId to recipeCoffeeVarietyCondition', () => {
    const result = buildRecipeFilters({ coffeeVarietyId: 'variety-uuid' });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(recipeCoffeeVarietyCondition('variety-uuid'));
  });

  it('generates one condition per id for tasteNoteIds (multi)', () => {
    const result = buildRecipeFilters({ tasteNoteIds: 'a, b ,c' });
    expect(result).toHaveLength(3);
    const ids = result.map((cond) => {
      const sub = cond.value as { where: MockCondition };
      return sub.where.value;
    });
    expect(ids).toEqual(['a', 'b', 'c']);
    for (const cond of result) {
      expect(cond.type).toBe('inArray');
      expect(cond.column).toBe(recipes.currentVersionId);
    }
  });

  it('generates a single tasteNoteId condition (deprecated, singular)', () => {
    const result = buildRecipeFilters({ tasteNoteId: 'note-uuid' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('inArray');
    expect(result[0].column).toBe(recipes.currentVersionId);
    const sub = result[0].value as { where: MockCondition };
    expect(sub.where).toEqual(eq(recipeTasteNotes.tasteNoteId, 'note-uuid'));
  });

  it('prefers tasteNoteIds over tasteNoteId when both are set', () => {
    const result = buildRecipeFilters({ tasteNoteIds: 'a,b', tasteNoteId: 'c' });
    expect(result).toHaveLength(2);
    const ids = result.map((cond) => {
      const sub = cond.value as { where: MockCondition };
      return sub.where.value;
    });
    expect(ids).toEqual(['a', 'b']);
    expect(ids).not.toContain('c');
  });

  // --- F11: author filter ---
  it('buildRecipeFilters: author generates users subquery condition', () => {
    const conditions = buildRecipeFilters({ author: 'alice' });
    expect(conditions).toHaveLength(1);
    expect(conditions[0].type).toBe('inArray');
    expect(conditions[0].column).toBe(recipes.authorId);
  });

  it('buildRecipeFilters: empty author generates no condition', () => {
    const conditions = buildRecipeFilters({ author: '' });
    expect(conditions).toHaveLength(0);
  });

  it('buildRecipeFilters: author wildcards match literally', () => {
    const conditions = buildRecipeFilters({ author: '%alice%' });
    expect(conditions).toHaveLength(1);
    const sub = conditions[0].value as { where: MockCondition };
    const orCond = sub.where;
    expect(orCond.type).toBe('or');
    const orConds = orCond.conditions!;
    expect(orConds[0]).toEqual(ilike(users.username, '%\\%alice\\%%'));
    expect(orConds[1]).toEqual(ilike(users.displayName, '%\\%alice\\%%'));
  });

  // --- F11: rating range filter ---
  it('buildRecipeFilters: minRating generates having-gte subquery', () => {
    const conditions = buildRecipeFilters({ minRating: 7 });
    expect(conditions).toHaveLength(1);
    expect(conditions[0].type).toBe('inArray');
    expect(conditions[0].column).toBe(recipes.id);
  });

  it('buildRecipeFilters: maxRating generates having-lte subquery', () => {
    const conditions = buildRecipeFilters({ maxRating: 9 });
    expect(conditions).toHaveLength(1);
    expect(conditions[0].type).toBe('inArray');
    expect(conditions[0].column).toBe(recipes.id);
  });

  it('buildRecipeFilters: both minRating and maxRating generate one subquery with two having conditions', () => {
    const conditions = buildRecipeFilters({ minRating: 5, maxRating: 9 });
    expect(conditions).toHaveLength(1); // single inArray with both having clauses
    const sub = conditions[0].value as { having: MockCondition };
    expect(sub.having.type).toBe('and');
    expect(sub.having.conditions).toHaveLength(2);
  });

  // --- recipe-filter "Shared recipe filter-building helper" (wave 6) ---
  it('buildRecipeFilters: search is one union condition that includes personalNotes', () => {
    const conditions = buildRecipeFilters({ search: 'V60' });
    expect(conditions).toHaveLength(1);
    expect(conditions[0].type).toBe('inArray');
    expect(conditions[0].column).toBe(recipes.id);
    const [titleIds, versionRecipeIds] = searchBranches(conditions[0]);
    expect(titleIds.projection).toEqual({ id: recipes.id });
    expect(titleIds.table).toBe(recipes);
    expect(titleIds.where).toEqual(ilike(recipes.title, '%V60%'));
    expect(versionRecipeIds.projection).toEqual({ id: recipeVersions.recipeId });
    expect(versionRecipeIds.table).toBe(recipeVersions);
    expect(versionRecipeIds.where).toEqual(
      or(ilike(recipeVersions.productName, '%V60%'), ilike(recipeVersions.personalNotes, '%V60%')),
    );
  });

  it('buildRecipeFilters: wildcard characters in search match literally', () => {
    const [condition] = buildRecipeFilters({ search: ' 50%_\\ ' });
    expect(searchPatterns(condition)).toEqual([
      '%50\\%\\_\\\\%',
      '%50\\%\\_\\\\%',
      '%50\\%\\_\\\\%',
    ]);
    const [backslash] = buildRecipeFilters({ search: '\\' });
    expect(searchPatterns(backslash)).toEqual(['%\\\\%', '%\\\\%', '%\\\\%']);
    expect(buildRecipeFilters({ search: '   ' })).toEqual([]);
  });
});

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
    await realDb.insert(usersTable).values({
      id: userId,
      email: `rate-race-${userId}@example.com`,
      username: `rate-race-${userId.slice(0, 8)}`,
      passwordHash: 'hash',
    });
    await realDb.insert(recipesTable).values({
      id: recipeId,
      slug: `rate-race-${recipeId}`,
      title: 'Rate race',
      authorId: userId,
      visibility: 'public',
    });
  });

  afterEach(async () => {
    await realDb.delete(ratingsTable).where(drizzleEq(ratingsTable.recipeId, recipeId));
    await realDb.delete(recipesTable).where(drizzleEq(recipesTable.id, recipeId));
    await realDb.delete(usersTable).where(drizzleEq(usersTable.id, userId));
  });

  it('should resolve both calls and keep one row holding one of the values', async () => {
    const results = await Promise.all([
      recipeService.upsertUserRating(userId, recipeId, 3),
      recipeService.upsertUserRating(userId, recipeId, 4),
    ]);
    expect(results.map((r) => r.rating).sort()).toEqual([3, 4]);

    const rows = await realDb
      .select({ rating: ratingsTable.rating, userId: ratingsTable.userId })
      .from(ratingsTable)
      .where(drizzleEq(ratingsTable.recipeId, recipeId));
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(userId);
    expect([3, 4]).toContain(rows[0].rating);
  });

  it('should update the existing row on a later rating', async () => {
    await recipeService.upsertUserRating(userId, recipeId, 2);
    await recipeService.upsertUserRating(userId, recipeId, 9);
    const rows = await realDb
      .select({ rating: ratingsTable.rating })
      .from(ratingsTable)
      .where(drizzleEq(ratingsTable.recipeId, recipeId));
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
    await realDb.insert(usersTable).values({
      id: userId,
      email: `decrement-${userId}@example.com`,
      username: `decrement-${userId.slice(0, 8)}`,
      passwordHash: 'hash',
    });
    await realDb.insert(recipesTable).values({
      id: recipeId,
      slug: `decrement-${recipeId}`,
      title: 'Decrement comments',
      authorId: userId,
      visibility: 'public',
      commentCount: 5,
    });
  });

  afterEach(async () => {
    await realDb.delete(recipesTable).where(drizzleEq(recipesTable.id, recipeId));
    await realDb.delete(usersTable).where(drizzleEq(usersTable.id, userId));
  });

  it('lowers commentCount by 3 with by = 3, then by 1 with the default', async () => {
    const afterThree = await recipeModel.decrementComments(recipeId, 3);
    expect(afterThree!.commentCount).toBe(2);
    const afterOne = await recipeModel.decrementComments(recipeId);
    expect(afterOne!.commentCount).toBe(1);
    const [row] = await realDb
      .select({ commentCount: recipesTable.commentCount })
      .from(recipesTable)
      .where(drizzleEq(recipesTable.id, recipeId));
    expect(row.commentCount).toBe(1);
  });
});

/** `recipe_version` columns every write path leaves to the database or sets itself. */
const VERSION_KEY_COLUMNS = ['id', 'recipeId', 'versionNumber', 'createdAt'];

/**
 * Drift guard (recipe-write, "Version-write paths share one column mapping"): a column added to
 * `recipeVersions` without updating `versionColumnsFrom` fails here and is named in the diff.
 */
describe('version-column mapping drift guard', () => {
  const tableKeys = Object.keys(getTableColumns(recipeVersionsTable));
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
