/**
 * Tests for the `lower()` helper of `packages/db/src/schema.ts` (spec: unique-identifiers,
 * "Email and username lookups are case-insensitive").
 *
 * The compile cases check that a lookup lowers both sides in SQL: the column is embedded and a
 * string becomes a bound parameter wrapped in `lower(...)`, so the database applies the same
 * case rules to both sides as the `_lower_unique` expression indexes do, on any locale.
 *
 * The DB-backed cases run against the migrated `brewform_test` database: PostgreSQL resolves
 * `lower($1)` with an untyped string parameter (no "function lower(unknown) is not unique"), the
 * lookup finds a row under any letter case, and `EXPLAIN (FORMAT JSON)` with
 * `SET LOCAL enable_seqscan = off` shows each lookup on its expression index.
 *
 * Test-only raw SQL: `SET LOCAL` and `EXPLAIN` need the postgres-js client directly (Drizzle has
 * no builder for planner settings or EXPLAIN). The explained statements are Drizzle's own
 * compiled SQL with its bound parameters.
 */
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, db } from './index.ts';
import { lower, users } from './schema.ts';

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

/** Names of every index any node of the plan reads (Index, Index Only or Bitmap Index Scan). */
function planIndexes(node: PlanNode, found = new Set<string>()): Set<string> {
  if (node['Index Name']) found.add(node['Index Name']);
  for (const child of node.Plans ?? []) planIndexes(child, found);
  return found;
}

/** Explain a compiled statement inside a transaction with sequential scans disabled. */
async function explainWithoutSeqscan(query: CompiledQuery): Promise<PlanNode> {
  const plan = await client.begin(async (tx) => {
    await tx.unsafe('SET LOCAL enable_seqscan = off');
    const rows = await tx.unsafe(`EXPLAIN (FORMAT JSON) ${query.sql}`, query.params as never[]);
    return (rows[0]['QUERY PLAN'] as Array<{ Plan: PlanNode }>)[0].Plan;
  });
  return plan as PlanNode;
}

/** The username lookup as the models build it. */
function usernameLookup(username: string) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(eq(lower(users.username), lower(username)));
}

/** The email lookup as the models build it. */
function emailLookup(email: string) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(eq(lower(users.email), lower(email)));
}

describe('lower() compiles both sides of a lookup (unique-identifiers)', () => {
  it('embeds the column and binds a string as a lowered parameter', () => {
    const compiled = emailLookup('A@B.co').toSQL();
    expect(compiled.sql).toMatch(/lower\("user"\."email"\) = lower\(\$1\)/);
    expect(compiled.params).toEqual(['A@B.co']);
  });

  it('lowers every value of an inArray lookup', () => {
    const compiled = db
      .select({ id: users.id })
      .from(users)
      .where(
        inArray(
          lower(users.username),
          ['Arda', 'Ilker'].map((u) => lower(u)),
        ),
      )
      .toSQL();
    expect(compiled.sql).toMatch(/lower\("user"\."username"\) in \(lower\(\$1\), lower\(\$2\)\)/);
    expect(compiled.params).toEqual(['Arda', 'Ilker']);
  });

  it('embeds an SQL expression as it is', () => {
    const compiled = db
      .select({ key: lower(lower(users.username)) })
      .from(users)
      .toSQL();
    expect(compiled.sql).toContain('lower(lower("user"."username"))');
    expect(compiled.params).toEqual([]);
  });
});

describe('lower() lookups against the database (unique-identifiers)', () => {
  const userId = crypto.randomUUID();
  const suffix = userId.slice(0, 8);
  const username = `Arda${suffix}`;
  const email = `lower-${suffix}@example.com`;

  beforeAll(async () => {
    await db.insert(users).values({ id: userId, email, username, passwordHash: 'hash' });
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  it('finds the account under any letter case of the username and email', async () => {
    expect(await usernameLookup(`ARDA${suffix.toUpperCase()}`)).toEqual([{ id: userId }]);
    expect(await usernameLookup(`arda${suffix}`)).toEqual([{ id: userId }]);
    expect(await emailLookup(`Lower-${suffix.toUpperCase()}@Example.COM`)).toEqual([
      { id: userId },
    ]);
  });

  it('serves the username lookup from user_username_lower_unique', async () => {
    const plan = await explainWithoutSeqscan(usernameLookup(username).toSQL());
    expect([...planIndexes(plan)]).toContain('user_username_lower_unique');
  });

  it('serves the email lookup from user_email_lower_unique', async () => {
    const plan = await explainWithoutSeqscan(emailLookup(email).toSQL());
    expect([...planIndexes(plan)]).toContain('user_email_lower_unique');
  });
});
