/**
 * DB-backed tests for the database-side recipe listing and search query
 * (capability `advanced-search`, wave 6): `buildListPageQuery` / `findListPage`
 * in `model.ts`.
 *
 * They cover the relevance score (title 3, productName 2, personalNotes 1; best
 * single version, never summed), global ordering across pages, the sort key and
 * `recipes.id` tie-breaks, `sortBy=rating` with unrated recipes last, the bounded
 * page size on a 1000-match fixture (two statements captured by a Drizzle
 * logger), literal `%`, `_` and `\` matching, that hidden recipes never match, and
 * the inclusive UTC-day `dateFrom`/`dateTo` filter through `service.listRecipes`.
 *
 * Every listing is scoped to the test's own author (`authorId` filter) so seed
 * data and other tests' rows in `brewform_test` cannot change the results. Rows
 * are deleted in `afterEach` (or `afterAll` for the 1000-recipe fixture).
 */

import '../../test-setup.ts';
import { client, db } from '@brewform/db';
import * as schema from '@brewform/db/schema';
import { recipes, recipeVersions, userRecipeRatings, users } from '@brewform/db/schema';
import { RecipeFilterSchema, RecipeListItemOutputSchema } from '@brewform/shared/schemas';
import { inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as model from './model.ts';
import * as service from './service.ts';

/** A per-run marker so search terms and slugs never collide with stale rows. */
const RUN = crypto.randomUUID().replaceAll('-', '').slice(0, 8);

/** Insert a user and return the row. */
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

/** Options for {@link createRecipe}. */
interface RecipeFixture {
  title: string;
  visibility?: 'public' | 'unlisted' | 'private' | 'draft';
  createdAt?: Date;
  likeCount?: number;
  deletedAt?: Date | null;
  /** Versions, oldest first; each gets the next version number. */
  versions?: Array<{ productName?: string | null; personalNotes?: string | null }>;
}

/** Insert a recipe with its versions (the last one becomes current) and return it. */
async function createRecipe(authorId: string, fixture: RecipeFixture) {
  const id = crypto.randomUUID();
  const [recipe] = await db
    .insert(recipes)
    .values({
      id,
      slug: `search-${RUN}-${id.slice(0, 8)}`,
      title: fixture.title,
      authorId,
      visibility: fixture.visibility ?? 'public',
      likeCount: fixture.likeCount ?? 0,
      deletedAt: fixture.deletedAt ?? null,
      ...(fixture.createdAt ? { createdAt: fixture.createdAt } : {}),
    })
    .returning();
  const versions = fixture.versions ?? [{}];
  const rows = await db
    .insert(recipeVersions)
    .values(
      versions.map((v, index) => ({
        recipeId: id,
        versionNumber: index + 1,
        productName: v.productName ?? null,
        personalNotes: v.personalNotes ?? null,
        brewMethod: 'v60' as const,
        drinkType: 'pour_over' as const,
        preparationNotes: '',
      })),
    )
    .returning({ id: recipeVersions.id });
  await db
    .update(recipes)
    .set({ currentVersionId: rows[rows.length - 1].id })
    .where(inArray(recipes.id, [id]));
  return recipe;
}

/** Delete ratings, versions and recipes for the given recipe ids. */
async function deleteRecipes(ids: string[]) {
  if (ids.length === 0) return;
  await db.delete(userRecipeRatings).where(inArray(userRecipeRatings.recipeId, ids));
  await db.update(recipes).set({ currentVersionId: null }).where(inArray(recipes.id, ids));
  await db.delete(recipeVersions).where(inArray(recipeVersions.recipeId, ids));
  await db.delete(recipes).where(inArray(recipes.id, ids));
}

/** Listing options for {@link listPage}. */
interface ListOptions {
  authorId: string;
  search?: string;
  page?: number;
  perPage?: number;
  sortBy?: string;
  sortOrder?: string;
}

/**
 * Run the real list-page query the way `listRecipes` does (public listing WHERE
 * from `buildListRecipesWhere`), scoped to one author.
 */
function listPage(opts: ListOptions, executor: typeof db = db) {
  const where = model.buildListRecipesWhere(
    { search: opts.search, authorId: opts.authorId },
    false,
  );
  return model.findListPage(
    {
      where,
      page: opts.page ?? 1,
      perPage: opts.perPage ?? 20,
      sortBy: opts.sortBy ?? 'createdAt',
      sortOrder: opts.sortOrder ?? 'desc',
      search: opts.search,
    },
    executor,
  );
}

/** The ids of a page, in order. */
function ids(result: { recipes: Array<{ id: unknown }> }): string[] {
  return result.recipes.map((r) => r.id as string);
}

/** A timestamp `minutes` after a fixed base, so `createdAt` order is explicit. */
function at(minutes: number): Date {
  return new Date(Date.UTC(2026, 0, 1, 0, minutes));
}

describe('Recipe model — database-side ranking and pagination (advanced-search)', () => {
  let author: typeof users.$inferSelect;
  let otherUser: typeof users.$inferSelect;
  let raterA: typeof users.$inferSelect;
  let raterB: typeof users.$inferSelect;
  const createdRecipes: string[] = [];

  /** Create a recipe owned by `author` and track it for cleanup. */
  async function make(fixture: RecipeFixture, authorId = author.id) {
    const recipe = await createRecipe(authorId, fixture);
    createdRecipes.push(recipe.id);
    return recipe;
  }

  beforeAll(async () => {
    author = await createUser('search-author');
    otherUser = await createUser('search-other');
    raterA = await createUser('search-rater-a');
    raterB = await createUser('search-rater-b');
  });

  afterEach(async () => {
    await deleteRecipes(createdRecipes);
    createdRecipes.length = 0;
  });

  afterAll(async () => {
    await deleteRecipes(createdRecipes);
    await db
      .delete(users)
      .where(inArray(users.id, [author.id, otherUser.id, raterA.id, raterB.id]));
  });

  it('(a) ranks an old title-only match first on page 1 ahead of 25 newer productName-only matches', async () => {
    const titleMatch = await make({ title: 'Espresso Classic', createdAt: at(0) });
    for (let i = 1; i <= 25; i++) {
      await make({
        title: `Untitled ${i}`,
        createdAt: at(i),
        versions: [{ productName: `Espresso Blend ${i}` }],
      });
    }

    const page1 = await listPage({ authorId: author.id, search: 'espresso', perPage: 10 });
    const page2 = await listPage({ authorId: author.id, search: 'espresso', perPage: 10, page: 2 });
    const page3 = await listPage({ authorId: author.id, search: 'espresso', perPage: 10, page: 3 });

    expect(page1.total).toBe(26);
    expect(ids(page1)[0]).toBe(titleMatch.id);
    expect(ids(page2)).not.toContain(titleMatch.id);
    expect(ids(page3)).not.toContain(titleMatch.id);
    expect(new Set([...ids(page1), ...ids(page2), ...ids(page3)]).size).toBe(26);
  });

  it('(b) scores the best single version, not the sum across versions', async () => {
    const b = await make({
      title: 'Recipe B',
      createdAt: at(1),
      versions: [{ productName: 'Espresso Blend', personalNotes: 'classic espresso' }],
    });
    // Newer than B, so a summed score (2 + 1 = 3) would tie B and win on createdAt.
    const a = await make({
      title: 'Recipe A',
      createdAt: at(2),
      versions: [
        { productName: 'Kenya Espresso', personalNotes: 'bright' },
        { productName: 'Kenya', personalNotes: 'pull it like espresso' },
      ],
    });

    const result = await listPage({ authorId: author.id, search: 'espresso' });
    expect(ids(result)).toEqual([b.id, a.id]);
  });

  it('(c) orders equal scores by the requested sort key, then by id', async () => {
    const a = await make({ title: 'match A', likeCount: 5, createdAt: at(1) });
    const b = await make({ title: 'match B', likeCount: 9, createdAt: at(2) });
    const c = await make({ title: 'match C', likeCount: 5, createdAt: at(3) });

    const desc = await listPage({
      authorId: author.id,
      search: 'match',
      sortBy: 'likeCount',
      sortOrder: 'desc',
    });
    const tied = [a.id, c.id].sort().reverse();
    expect(ids(desc)).toEqual([b.id, ...tied]);

    const asc = await listPage({
      authorId: author.id,
      search: 'match',
      sortBy: 'likeCount',
      sortOrder: 'asc',
    });
    expect(ids(asc)).toEqual([...[a.id, c.id].sort(), b.id]);
  });

  it('(d) ranks an İstanbul Blend title ahead of productName-only matches for istanbul', async () => {
    const turkish = await make({ title: 'İstanbul Blend', createdAt: at(0) });
    for (let i = 1; i <= 3; i++) {
      await make({
        title: `Plain ${i}`,
        createdAt: at(i),
        versions: [{ productName: `Istanbul Roast ${i}` }],
      });
    }

    const result = await listPage({ authorId: author.id, search: 'istanbul' });
    expect(result.total).toBe(4);
    expect(ids(result)[0]).toBe(turkish.id);
  });

  it('(g) sortBy=rating orders by average rating with unrated recipes last in both directions', async () => {
    const a = await make({ title: 'Rated espresso A', createdAt: at(1) });
    const b = await make({ title: 'Rated espresso B', createdAt: at(2) });
    const c = await make({ title: 'Unrated espresso C', createdAt: at(3) });
    await db.insert(userRecipeRatings).values([
      { userId: raterA.id, recipeId: a.id, rating: 9 },
      { userId: raterB.id, recipeId: a.id, rating: 9 },
      { userId: raterA.id, recipeId: b.id, rating: 6 },
    ]);

    const desc = await listPage({ authorId: author.id, sortBy: 'rating', sortOrder: 'desc' });
    expect(ids(desc)).toEqual([a.id, b.id, c.id]);

    const asc = await listPage({ authorId: author.id, sortBy: 'rating', sortOrder: 'asc' });
    expect(ids(asc)).toEqual([b.id, a.id, c.id]);

    // Rating breaks relevance ties: all three match `espresso` on the title only.
    const searched = await listPage({
      authorId: author.id,
      search: 'espresso',
      sortBy: 'rating',
      sortOrder: 'desc',
    });
    expect(ids(searched)).toEqual([a.id, b.id, c.id]);
  });

  it('(h) pages over tied likeCount values are disjoint and complete', async () => {
    const all: string[] = [];
    for (let i = 0; i < 30; i++) {
      const recipe = await make({ title: `Tied ${i}`, likeCount: 0, createdAt: at(0) });
      all.push(recipe.id);
    }

    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        listPage({
          authorId: author.id,
          sortBy: 'likeCount',
          sortOrder: 'desc',
          perPage: 10,
          page,
        }),
      ),
    );
    const seen = pages.flatMap((p) => ids(p));
    expect(seen).toHaveLength(30);
    expect(new Set(seen).size).toBe(30);
    expect([...seen].sort()).toEqual([...all].sort());
  });

  // Ported from the deleted `rankRecipes` unit tests: weights 3 > 2 > 1, any version scored.
  it('(m) ranks title over productName over personalNotes, scoring non-current versions', async () => {
    const notesOnly = await make({
      title: 'Notes only',
      createdAt: at(4),
      versions: [{ personalNotes: 'Try with V60 dripper' }],
    });
    const olderVersion = await make({
      title: 'Older version',
      createdAt: at(3),
      versions: [{ productName: 'V60 Blend' }, { productName: 'Kenya AA' }],
    });
    const title = await make({ title: 'V60 Recipe', createdAt: at(1) });
    await make({ title: 'No match', createdAt: at(5), versions: [{ productName: 'Chemex' }] });

    const result = await listPage({ authorId: author.id, search: 'v60' });
    expect(ids(result)).toEqual([title.id, olderVersion.id, notesOnly.id]);
    expect(result.total).toBe(3);
  });

  it('(i) list items carry no versions key, with or without search', async () => {
    await make({
      title: 'Espresso With Versions',
      versions: [{ productName: 'Espresso', personalNotes: 'private text' }, { productName: 'X' }],
    });

    for (const search of ['espresso', undefined]) {
      const result = await listPage({ authorId: author.id, search });
      expect(result.recipes.length).toBe(1);
      for (const row of result.recipes) {
        expect(row).not.toHaveProperty('versions');
        expect(row).not.toHaveProperty('score');
        // The JSON payload matches the list-item contract exactly.
        const json = JSON.parse(JSON.stringify(row));
        expect(RecipeListItemOutputSchema.strict().safeParse(json).success).toBe(true);
      }
    }
  });

  it('(k) matches %, _ and \\ literally; a whitespace-only term is no search', async () => {
    const underscore = await make({ title: 'a_c', createdAt: at(1) });
    const abc = await make({ title: 'abc', createdAt: at(2) });
    const percent = await make({ title: '100% Arabica', createdAt: at(3) });
    const thousand = await make({ title: '1000 Arabica', createdAt: at(4) });
    const backslash = await make({
      title: 'Windows beans',
      createdAt: at(5),
      versions: [{ productName: 'C:\\beans' }],
    });

    expect(ids(await listPage({ authorId: author.id, search: 'a_c' }))).toEqual([underscore.id]);
    expect(ids(await listPage({ authorId: author.id, search: '100%' }))).toEqual([percent.id]);
    expect(ids(await listPage({ authorId: author.id, search: '\\' }))).toEqual([backslash.id]);

    const blank = await listPage({ authorId: author.id, search: '   ' });
    const none = await listPage({ authorId: author.id });
    expect(ids(blank)).toEqual(ids(none));
    expect(blank.total).toBe(none.total);
    expect(ids(none)).toEqual(
      expect.arrayContaining([underscore.id, abc.id, percent.id, thousand.id, backslash.id]),
    );
  });

  it('(l) hidden recipes never match, including through older versions', async () => {
    const hidden = `zq7hidden${RUN}`;
    const legacy = `zq7legacy${RUN}`;
    for (const visibility of ['private', 'draft', 'unlisted'] as const) {
      await make({ title: hidden, visibility });
    }
    await make({ title: hidden, visibility: 'public', deletedAt: new Date() });
    await make({
      title: 'Private with history',
      visibility: 'private',
      versions: [{ productName: legacy }, { productName: 'Kenya AA' }],
    });

    for (const viewer of [null, otherUser.id, author.id]) {
      for (const term of [hidden, legacy]) {
        const filters = { search: term, page: 1, perPage: 20 } as Parameters<
          typeof service.listRecipes
        >[0];
        const result = await service.listRecipes(filters, 1, 20, viewer, false);
        expect(result.recipes).toEqual([]);
        expect((result as { total: number }).total).toBe(0);
      }
    }
  });

  it('(l) a search result set is a subset of the same listing without search', async () => {
    await make({ title: 'Espresso Subset', createdAt: at(1) });
    await make({ title: 'Other', createdAt: at(2), versions: [{ personalNotes: 'espresso' }] });
    await make({ title: 'No match', createdAt: at(3) });
    await make({ title: 'Espresso hidden', visibility: 'private', createdAt: at(4) });

    const searched = await listPage({ authorId: author.id, search: 'espresso', perPage: 100 });
    const all = await listPage({ authorId: author.id, perPage: 100 });
    expect(searched.total).toBe(2);
    for (const id of ids(searched)) expect(ids(all)).toContain(id);
  });
});

describe('Recipe model — bounded 1000-match search (advanced-search)', () => {
  let bulkAuthor: typeof users.$inferSelect;
  const bulkIds: string[] = [];

  beforeAll(async () => {
    bulkAuthor = await createUser('search-bulk');
    const recipeRows = Array.from({ length: 1000 }, (_, i) => {
      const id = crypto.randomUUID();
      bulkIds.push(id);
      return {
        id,
        slug: `bulk-${RUN}-${id.slice(0, 13)}`,
        title: i % 2 === 0 ? `Espresso bulk ${i}` : `Bulk ${i}`,
        authorId: bulkAuthor.id,
        visibility: 'public' as const,
        createdAt: at(i),
      };
    });
    await db.insert(recipes).values(recipeRows);
    const versionRows = recipeRows.flatMap((r, i) => [
      {
        recipeId: r.id,
        versionNumber: 1,
        productName: `Kenya ${i}`,
        personalNotes: i % 3 === 0 ? 'espresso notes' : null,
        brewMethod: 'v60' as const,
        drinkType: 'pour_over' as const,
        preparationNotes: '',
      },
      {
        recipeId: r.id,
        versionNumber: 2,
        productName: i % 2 === 1 ? 'Espresso Blend' : 'Brazil',
        personalNotes: null,
        brewMethod: 'v60' as const,
        drinkType: 'pour_over' as const,
        preparationNotes: '',
      },
    ]);
    await db.insert(recipeVersions).values(versionRows);
  }, 60_000);

  afterAll(async () => {
    await deleteRecipes(bulkIds);
    await db.delete(users).where(inArray(users.id, [bulkAuthor.id]));
  }, 60_000);

  it('(e, j) page 3 issues exactly two statements and returns 10 rows of 1000 without version text', async () => {
    const queries: Array<{ query: string; params: unknown[] }> = [];
    const loggedDb = drizzle(client, {
      schema,
      logger: { logQuery: (query, params) => queries.push({ query, params }) },
    });

    const result = await listPage(
      { authorId: bulkAuthor.id, search: 'espresso', page: 3, perPage: 10 },
      loggedDb,
    );

    expect(queries).toHaveLength(2);
    expect(result.recipes).toHaveLength(10);
    expect(result.total).toBe(1000);
    for (const row of result.recipes) {
      expect(row).not.toHaveProperty('versions');
      expect(row).not.toHaveProperty('productName');
      expect(row).not.toHaveProperty('personalNotes');
    }
  });

  it('(f) page 101 is empty with total 1000', async () => {
    const result = await listPage({
      authorId: bulkAuthor.id,
      search: 'espresso',
      page: 101,
      perPage: 10,
    });
    expect(result.recipes).toEqual([]);
    expect(result.total).toBe(1000);
  });
});

describe('date range filter (advanced-search)', () => {
  let author: typeof users.$inferSelect;
  const createdRecipes: string[] = [];
  /** Recipe ids keyed by their creation instant. */
  const byInstant = new Map<string, string>();
  const INSTANTS = [
    '2026-11-20T23:59:59.999Z',
    '2026-11-21T00:00:00.000Z',
    '2026-11-21T12:00:00.000Z',
    '2026-11-21T23:59:59.999Z',
    '2026-11-22T00:00:00.000Z',
  ];

  /** List the author's public recipes through the real service with the parsed filters. */
  async function list(query: Record<string, string>) {
    const filters = RecipeFilterSchema.parse({ authorId: author.id, ...query });
    const result = await service.listRecipes(filters, 1, 20);
    return new Set(result.recipes.map((r) => r.id as string));
  }

  /** The recipe ids created at the given instants. */
  function idsAt(...instants: string[]) {
    return new Set(instants.map((instant) => byInstant.get(instant)));
  }

  beforeAll(async () => {
    author = await createUser('search-dates');
    for (const instant of INSTANTS) {
      const recipe = await createRecipe(author.id, {
        title: `Dated ${instant}`,
        createdAt: new Date(instant),
      });
      createdRecipes.push(recipe.id);
      byInstant.set(instant, recipe.id);
    }
  });

  afterAll(async () => {
    await deleteRecipes(createdRecipes);
    await db.delete(users).where(inArray(users.id, [author.id]));
  });

  it('dateFrom and dateTo on the same day return every recipe of that UTC day', async () => {
    expect(await list({ dateFrom: '2026-11-21', dateTo: '2026-11-21' })).toEqual(
      idsAt(INSTANTS[1], INSTANTS[2], INSTANTS[3]),
    );
  });

  it('dateTo alone includes the whole chosen day', async () => {
    expect(await list({ dateTo: '2026-11-21' })).toEqual(
      idsAt(INSTANTS[0], INSTANTS[1], INSTANTS[2], INSTANTS[3]),
    );
  });

  it('dateFrom alone starts at midnight UTC of the chosen day', async () => {
    expect(await list({ dateFrom: '2026-11-21' })).toEqual(
      idsAt(INSTANTS[1], INSTANTS[2], INSTANTS[3], INSTANTS[4]),
    );
  });
});

describe('Recipe model — list-page query shape (advanced-search)', () => {
  it('compiles a limited page query with limit 10 and offset 20', () => {
    const where = model.buildListRecipesWhere({ search: 'espresso' }, false);
    const query = model
      .buildListPageQuery({
        where,
        search: 'espresso',
        page: 3,
        perPage: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      })
      .toSQL();
    expect(query.sql).toMatch(/ limit \$\d+ offset \$\d+$/);
    expect(query.params.slice(-2)).toEqual([10, 20]);
  });

  it('adds no score expression without a search', () => {
    const query = model
      .buildListPageQuery({
        where: undefined,
        page: 1,
        perPage: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      })
      .toSQL();
    expect(query.sql).not.toMatch(/case when/i);
    expect(query.sql).toMatch(/order by "recipe"\."created_at" desc, "recipe"\."id" desc/);
  });

  it('no longer exports the unbounded ranking fetch', () => {
    expect('findAllForRanking' in model).toBe(false);
  });
});

describe('Database statement timeout (advanced-search)', () => {
  it('the shared pool runs with a 10s statement_timeout by default', async () => {
    const rows = await db.execute<{ statement_timeout: string }>(sql`show statement_timeout`);
    expect(rows[0].statement_timeout).toBe('10s');
  });
});
