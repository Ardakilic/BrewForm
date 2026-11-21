/**
 * DB-backed plan tests for the recipe search (capability `advanced-search`, "Trigram
 * indexes accelerate substring search").
 *
 * They compile the real search page query (`buildListPageQuery`) and count query
 * (`buildListCountQuery`), explain them inside a transaction with
 * `SET LOCAL enable_seqscan = off`, and assert a Bitmap Index Scan on each of the three
 * `gin_trgm_ops` indexes. They also run the same searches with sequential scans on and
 * off and assert identical ids in identical order (the trigram index is lossy and
 * rechecked, so it must never change results), including non-ASCII case folding
 * (`istanbul` against `İstanbul Blend`) and the escaped patterns `a_c`, `100%` and `\`.
 *
 * Test-only raw SQL: `SET LOCAL`, `EXPLAIN` and running the compiled statement text need
 * the postgres-js client directly (Drizzle has no builder for planner settings or
 * EXPLAIN). The statements are Drizzle's own compiled SQL with its bound parameters.
 */

import '../../test-setup.ts';
import { client, db } from '@brewform/db';
import { recipes, recipeVersions, users } from '@brewform/db/schema';
import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as model from './model.ts';

/** The three trigram indexes the search predicate must use. */
const TRIGRAM_INDEXES = [
  'recipe_title_trgm_idx',
  'recipe_version_product_name_trgm_idx',
  'recipe_version_personal_notes_trgm_idx',
];

/** Filler recipes (one version each) that give the planner production-like table sizes. */
const FILLER_COUNT = 4000;

/** A compiled Drizzle statement. */
interface CompiledQuery {
  sql: string;
  params: unknown[];
}

/** One node of a PostgreSQL `EXPLAIN (FORMAT JSON)` plan. */
interface PlanNode {
  'Node Type': string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

/** Compile the search page and count queries exactly as `findListPage` issues them. */
function compiledSearch(search: string): { page: CompiledQuery; count: CompiledQuery } {
  const where = model.buildListRecipesWhere({ search }, false);
  const page = model
    .buildListPageQuery({ where, search, page: 1, perPage: 100, sortBy: 'createdAt' })
    .toSQL();
  const count = model.buildListCountQuery(where).toSQL();
  return { page, count };
}

/** Names of every index used by a Bitmap Index Scan anywhere in the plan. */
function bitmapIndexes(node: PlanNode, found = new Set<string>()): Set<string> {
  if (node['Node Type'] === 'Bitmap Index Scan' && node['Index Name']) {
    found.add(node['Index Name']);
  }
  for (const child of node.Plans ?? []) bitmapIndexes(child, found);
  return found;
}

/** A one-line-per-node outline of a plan, used as the assertion message on failure. */
function planOutline(node: PlanNode, depth = 0): string {
  const self = `${'  '.repeat(depth)}${node['Node Type']}${node['Index Name'] ? ` on ${node['Index Name']}` : ''}`;
  return [self, ...(node.Plans ?? []).map((child) => planOutline(child, depth + 1))].join('\n');
}

/**
 * The postgres-js transaction client passed to `client.begin` callbacks (taken from the
 * `begin(options, callback)` overload, the last one, so `Parameters` resolves to it).
 */
type TransactionClient = Parameters<Parameters<typeof client.begin>[1]>[0];

/**
 * Run `fn` in a transaction with `enable_seqscan` set for that transaction only.
 *
 * @param seqscan - Whether sequential scans are allowed.
 * @param fn - Receives the transaction's tagged-template client.
 */
function withSeqscan<T>(seqscan: boolean, fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return client.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL enable_seqscan = ${seqscan ? 'on' : 'off'}`);
    return fn(tx);
  }) as Promise<T>;
}

/** Explain a compiled statement with sequential scans disabled. */
async function explainWithoutSeqscan(query: CompiledQuery): Promise<PlanNode> {
  return withSeqscan(false, async (tx) => {
    const rows = await tx.unsafe(`EXPLAIN (FORMAT JSON) ${query.sql}`, query.params as never[]);
    return (rows[0]['QUERY PLAN'] as Array<{ Plan: PlanNode }>)[0].Plan;
  });
}

/**
 * The recipe ids a search page returns, in order (the first selected column is
 * `recipe.id`; rows are read as arrays because the author projection repeats `id`).
 */
async function searchIds(search: string, seqscan: boolean): Promise<string[]> {
  const { page } = compiledSearch(search);
  const rows = await withSeqscan(seqscan, (tx) =>
    tx.unsafe(page.sql, page.params as never[]).values(),
  );
  return (rows as unknown[][]).map((row) => row[0] as string);
}

describe('Recipe search plan — trigram indexes (advanced-search)', () => {
  let author: typeof users.$inferSelect;
  const createdRecipes: string[] = [];
  const titles: Record<string, string> = {};

  beforeAll(async () => {
    const userId = crypto.randomUUID();
    [author] = await db
      .insert(users)
      .values({
        id: userId,
        email: `search-explain-${userId}@example.com`,
        username: `search-explain-${userId.slice(0, 8)}`,
        passwordHash: 'hash',
      })
      .returning();

    const fixtures: Array<{ title: string; productName?: string; personalNotes?: string }> = [
      { title: 'Espresso Explain Title' },
      { title: 'Explain productName', productName: 'Espresso Explain Blend' },
      { title: 'Explain notes', personalNotes: 'pulled like an espresso' },
      { title: 'İstanbul Blend' },
      { title: 'Explain roast', productName: 'Istanbul Roast' },
      { title: 'a_c' },
      { title: 'abc' },
      { title: '100% Arabica' },
      { title: '1000 Arabica' },
      { title: 'Explain backslash', productName: 'C:\\beans' },
    ];
    for (const fixture of fixtures) {
      const id = crypto.randomUUID();
      await db.insert(recipes).values({
        id,
        slug: `explain-${id.slice(0, 13)}`,
        title: fixture.title,
        authorId: author.id,
        visibility: 'public',
      });
      await db.insert(recipeVersions).values({
        recipeId: id,
        versionNumber: 1,
        productName: fixture.productName ?? null,
        personalNotes: fixture.personalNotes ?? null,
        brewMethod: 'v60',
        drinkType: 'pour_over',
        preparationNotes: '',
      });
      createdRecipes.push(id);
      titles[fixture.title] = id;
    }
    // Realistic table sizes: on a near-empty table a full B-tree index scan with a filter is
    // cheaper than any bitmap scan, so the planner would never pick the trigram indexes.
    const fillerIds = Array.from({ length: FILLER_COUNT }, () => crypto.randomUUID());
    await db.insert(recipes).values(
      fillerIds.map((id, i) => ({
        id,
        slug: `explain-filler-${id.slice(0, 13)}`,
        title: `Filler recipe ${i}`,
        authorId: author.id,
        visibility: 'public' as const,
      })),
    );
    await db.insert(recipeVersions).values(
      fillerIds.map((id, i) => ({
        recipeId: id,
        versionNumber: 1,
        productName: `Filler bean ${i % 50}`,
        personalNotes: `filler notes ${i % 50}`,
        brewMethod: 'v60' as const,
        drinkType: 'pour_over' as const,
        preparationNotes: '',
      })),
    );
    createdRecipes.push(...fillerIds);

    // Steady state for the planner: merge the GIN fast-update pending lists (autovacuum does
    // this in production; test inserts leave hundreds of pending pages that make every
    // trigram scan look expensive) and refresh the statistics.
    for (const index of TRIGRAM_INDEXES) {
      await client`select gin_clean_pending_list(${index}::regclass)`;
    }
    await client`analyze recipe, recipe_version`;
  }, 60_000);

  afterAll(async () => {
    await db.delete(recipeVersions).where(inArray(recipeVersions.recipeId, createdRecipes));
    await db.delete(recipes).where(inArray(recipes.id, createdRecipes));
    await db.delete(users).where(inArray(users.id, [author.id]));
  }, 60_000);

  it('the search page query bitmap-scans all three trigram indexes', async () => {
    const plan = await explainWithoutSeqscan(compiledSearch('espresso').page);
    const used = bitmapIndexes(plan);
    for (const index of TRIGRAM_INDEXES) expect(used, planOutline(plan)).toContain(index);
  });

  it('the search count query bitmap-scans all three trigram indexes', async () => {
    const plan = await explainWithoutSeqscan(compiledSearch('espresso').count);
    const used = bitmapIndexes(plan);
    for (const index of TRIGRAM_INDEXES) expect(used, planOutline(plan)).toContain(index);
  });

  it('returns the same ids in the same order with sequential scans on and off', async () => {
    for (const term of ['espresso', 'istanbul']) {
      const withSeq = await searchIds(term, true);
      const withoutSeq = await searchIds(term, false);
      expect(withoutSeq).toEqual(withSeq);
    }
    const istanbul = await searchIds('istanbul', false);
    expect(istanbul).toContain(titles['İstanbul Blend']);
    expect(istanbul.indexOf(titles['İstanbul Blend'])).toBeLessThan(
      istanbul.indexOf(titles['Explain roast']),
    );
  });

  it('escaped patterns return the same ids with sequential scans on and off', async () => {
    for (const term of ['a_c', '100%', '\\']) {
      const withSeq = await searchIds(term, true);
      const withoutSeq = await searchIds(term, false);
      expect(withoutSeq).toEqual(withSeq);
    }
    expect(await searchIds('a_c', false)).toContain(titles.a_c);
    expect(await searchIds('a_c', false)).not.toContain(titles.abc);
    expect(await searchIds('100%', false)).toContain(titles['100% Arabica']);
    expect(await searchIds('100%', false)).not.toContain(titles['1000 Arabica']);
    expect(await searchIds('\\', false)).toContain(titles['Explain backslash']);
  });
});
