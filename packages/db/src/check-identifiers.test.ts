/**
 * Tests for the operator identifier check `packages/db/src/check-identifiers.ts`
 * (spec: unique-identifiers, "Identifier conflicts are detected and remediated
 * before stricter constraints apply").
 *
 * The grouping and report helpers are pure and tested over plain row arrays;
 * `runCheck` is exercised against the migrated `brewform_test` database. The
 * duplicate-account and default-setup fixes cannot run there (the wave-6 unique
 * indexes forbid the data they repair), so they run against a fake Drizzle client
 * that serves row snapshots and records every update.
 */
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildReport,
  type DefaultSetupRow,
  findMultipleDefaults,
  formatReport,
  groupCaseInsensitiveDuplicates,
  hasBlockingIssues,
  type IdentifierUserRow,
  parseCliOptions,
  runCheck,
} from './check-identifiers.ts';
import { db } from './index.ts';
import { recipes, setups, users } from './schema.ts';

/** The rows one load pass of `runCheck` reads from the fake client. */
interface FakeSnapshot {
  users: IdentifierUserRow[];
  defaults: DefaultSetupRow[];
  emptySlugIds: string[];
}

/** One `update(table).set(values).where(…)` call recorded by the fake client. */
interface RecordedUpdate {
  table: unknown;
  values: Record<string, unknown>;
}

/** The write surface `runCheck` uses inside a transaction (and inside a savepoint). */
interface FakeWriter {
  update(table: unknown): {
    set(values: Record<string, unknown>): { where(condition: unknown): Promise<void> };
  };
  transaction<T>(fn: (savepoint: FakeWriter) => Promise<T>): Promise<T>;
}

/**
 * Build a fake Drizzle client for `runCheck`. Each load pass (which starts with the `user`
 * select) answers from the next snapshot, and the last snapshot repeats. Updates are recorded,
 * not applied. `savepointError(attempt)` may return an error that the nested transaction
 * (the per-candidate savepoint of `--fix-empty-slugs`) throws before running its update.
 *
 * @param snapshots - Rows per load pass: before the fixes, then after them.
 * @param savepointError - Optional failure per savepoint attempt (0-based).
 * @returns The client (typed as `db`), the recorded updates and the number of load passes.
 */
function fakeDatabase(
  snapshots: FakeSnapshot[],
  savepointError?: (attempt: number) => unknown,
): { database: typeof db; updates: RecordedUpdate[]; passes: () => number } {
  const updates: RecordedUpdate[] = [];
  let pass = 0;
  let savepointAttempts = 0;
  const rowsFor = (table: unknown): unknown[] => {
    if (table === users) pass++;
    const snapshot = snapshots[Math.min(pass, snapshots.length) - 1];
    if (table === users) return snapshot.users;
    if (table === setups) return snapshot.defaults;
    return snapshot.emptySlugIds.map((id) => ({ id }));
  };
  const writer: FakeWriter = {
    update: (table) => ({
      set: (values) => ({
        where: () => {
          updates.push({ table, values });
          return Promise.resolve();
        },
      }),
    }),
    transaction: async (fn) => {
      const err = savepointError?.(savepointAttempts++);
      if (err !== undefined) throw err;
      return await fn(writer);
    },
  };
  const database = {
    select: () => ({
      from: (table: unknown) => {
        const rows = rowsFor(table);
        return Object.assign(Promise.resolve(rows), { where: () => Promise.resolve(rows) });
      },
    }),
    transaction: async <T>(fn: (tx: FakeWriter) => Promise<T>) => await fn(writer),
  };
  return { database: database as unknown as typeof db, updates, passes: () => pass };
}

/** Build a user row for the pure helpers. */
function userRow(
  id: string,
  email: string,
  username: string,
  deleted = false,
  createdAt = new Date('2026-01-01T00:00:00Z'),
): IdentifierUserRow {
  return { id, email, username, deletedAt: deleted ? new Date() : null, createdAt };
}

describe('groupCaseInsensitiveDuplicates', () => {
  it('groups emails that differ only in case and marks soft-deleted members fixable', () => {
    const rows = [
      userRow('u-active', 'A@x.io', 'alice'),
      userRow('u-deleted', 'a@x.io', 'alice-old', true),
      userRow('u-other', 'b@x.io', 'bob'),
    ];

    const groups = groupCaseInsensitiveDuplicates(rows, 'email');

    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((m) => m.id).sort()).toEqual(['u-active', 'u-deleted']);
    expect(groups[0].members.find((m) => m.id === 'u-deleted')?.fixable).toBe(true);
    expect(groups[0].members.find((m) => m.id === 'u-active')?.fixable).toBe(false);
    expect(groups[0].activeCount).toBe(1);
  });

  it('groups usernames that differ only in case', () => {
    const rows = [userRow('u1', 'one@x.io', 'Arda'), userRow('u2', 'two@x.io', 'arda')];
    const groups = groupCaseInsensitiveDuplicates(rows, 'username');
    expect(groups).toHaveLength(1);
    expect(groups[0].activeCount).toBe(2);
  });

  it('returns no groups when every value is unique ignoring case', () => {
    const rows = [userRow('u1', 'one@x.io', 'one'), userRow('u2', 'two@x.io', 'two')];
    expect(groupCaseInsensitiveDuplicates(rows, 'email')).toEqual([]);
  });
});

describe('findMultipleDefaults', () => {
  it('lists the older default setup for clearing and keeps the newest', () => {
    const result = findMultipleDefaults([
      { id: 's-old', userId: 'u1', updatedAt: new Date('2026-01-01T00:00:00Z') },
      { id: 's-new', userId: 'u1', updatedAt: new Date('2026-02-01T00:00:00Z') },
      { id: 's-solo', userId: 'u2', updatedAt: new Date('2026-01-01T00:00:00Z') },
    ]);
    expect(result).toEqual([{ userId: 'u1', keepId: 's-new', clearIds: ['s-old'] }]);
  });
});

describe('formatReport and hasBlockingIssues', () => {
  const duplicateRows = [
    userRow('u-active', 'A@x.io', 'alice'),
    userRow('u-deleted', 'a@x.io', 'alice-old', true),
    userRow('u-other', 'b@x.io', 'bob'),
  ];

  it('never prints an email address', () => {
    const text = formatReport(buildReport(duplicateRows, [], []));
    expect(text).not.toContain('a@x.io');
    expect(text).not.toContain('A@x.io');
    expect(text).not.toContain('@x.io');
    expect(text).toContain('u-active');
    expect(text).toContain('u-deleted');
  });

  it('prints the manual admin-rename path for groups with two or more active accounts', () => {
    const rows = [userRow('u1', 'one@x.io', 'Arda'), userRow('u2', 'two@x.io', 'arda')];
    const text = formatReport(buildReport(rows, [], []));
    expect(text).toContain('PATCH /api/v1/admin/users/:id');
  });

  it('is blocking for any email, username or default group', () => {
    expect(hasBlockingIssues(buildReport(duplicateRows, [], []))).toBe(true);
    expect(
      hasBlockingIssues(
        buildReport([userRow('u1', 'one@x.io', 'Arda'), userRow('u2', 'two@x.io', 'arda')], [], []),
      ),
    ).toBe(true);
    expect(
      hasBlockingIssues(
        buildReport(
          [],
          [
            { id: 's1', userId: 'u1', updatedAt: new Date('2026-01-01T00:00:00Z') },
            { id: 's2', userId: 'u1', updatedAt: new Date('2026-02-01T00:00:00Z') },
          ],
          [],
        ),
      ),
    ).toBe(true);
  });

  it('prints the keep and clear ids for a user with several active defaults', () => {
    const text = formatReport(
      buildReport(
        [],
        [
          { id: 's-old', userId: 'u1', updatedAt: new Date('2026-01-01T00:00:00Z') },
          { id: 's-new', userId: 'u1', updatedAt: new Date('2026-02-01T00:00:00Z') },
        ],
        [],
      ),
    );
    expect(text).toContain(
      'user u1: keeps default setup s-new; clear with --fix-setup-defaults: s-old',
    );
    expect(text).toContain('Result: blocking issues found');
  });

  it('is not blocking for empty slugs only, and prints 0 for every blocking category', () => {
    const report = buildReport([], [], ['recipe-1']);
    expect(hasBlockingIssues(report)).toBe(false);
    const text = formatReport(report);
    expect(text).toMatch(/email case duplicates: 0/);
    expect(text).toMatch(/username case duplicates: 0/);
    expect(text).toMatch(/multiple active default setups: 0/);
    expect(text).toContain('recipe-1');
  });
});

describe('parseCliOptions', () => {
  it('defaults every fix to off', () => {
    expect(parseCliOptions([])).toEqual({
      fixDeletedDuplicates: false,
      fixSetupDefaults: false,
      fixEmptySlugs: false,
    });
  });

  it('reads the opt-in flags and drops a forwarded leading --', () => {
    expect(parseCliOptions(['--', '--fix-setup-defaults', '--fix-empty-slugs'])).toEqual({
      fixDeletedDuplicates: false,
      fixSetupDefaults: true,
      fixEmptySlugs: true,
    });
  });

  it('rejects an unknown flag', () => {
    expect(() => parseCliOptions(['--fix-everything'])).toThrow();
  });
});

describe('runCheck fixes (fake client)', () => {
  const deletedId = '0a1b2c3d-4e5f-4789-abcd-ef0123456789';
  const created = new Date('2026-01-01T00:00:00Z');
  const olderDefault = { id: 's-old', userId: 'u1', updatedAt: new Date('2026-01-01T00:00:00Z') };
  const newerDefault = { id: 's-new', userId: 'u1', updatedAt: new Date('2026-02-01T00:00:00Z') };

  it('tombstones only soft-deleted duplicates, clears older defaults and reloads', async () => {
    const before: FakeSnapshot = {
      users: [
        userRow('u-active', 'A@x.io', 'alice', false, created),
        userRow(deletedId, 'a@x.io', 'Alice', true, created),
      ],
      defaults: [olderDefault, newerDefault],
      emptySlugIds: [],
    };
    const after: FakeSnapshot = {
      users: [
        userRow('u-active', 'A@x.io', 'alice', false, created),
        userRow(deletedId, `deleted+${deletedId}@deleted.invalid`, 'deleted-0a1b2c3d4e5f', true),
      ],
      defaults: [newerDefault],
      emptySlugIds: [],
    };
    const fake = fakeDatabase([before, after]);

    const { report, fixes } = await runCheck(fake.database, {
      fixDeletedDuplicates: true,
      fixSetupDefaults: true,
    });

    // The deleted account sits in both the email and the username group but is fixed once.
    expect(fixes.deletedDuplicates).toEqual([deletedId]);
    expect(fixes.setupDefaults).toEqual(['s-old']);
    expect(fake.updates).toEqual([
      {
        table: users,
        values: { email: `deleted+${deletedId}@deleted.invalid`, username: 'deleted-0a1b2c3d4e5f' },
      },
      { table: setups, values: { isDefault: false } },
    ]);
    expect(fake.passes()).toBe(2);
    expect(report.fixes).toBe(fixes);
    expect(hasBlockingIssues(report)).toBe(false);
    const text = formatReport(report);
    expect(text).toContain(`Fixed: tombstoned 1 soft-deleted account(s): ${deletedId}`);
    expect(text).toContain('Fixed: cleared 1 extra default setup(s): s-old');
    expect(text).toContain('Result: no blocking issues.');
    expect(text).not.toContain('@x.io');
  });

  it('changes nothing and skips the reload when no member is fixable', async () => {
    const fake = fakeDatabase([
      {
        users: [userRow('u1', 'one@x.io', 'Arda'), userRow('u2', 'two@x.io', 'arda')],
        defaults: [newerDefault],
        emptySlugIds: [],
      },
    ]);

    const { report, fixes } = await runCheck(fake.database, {
      fixDeletedDuplicates: true,
      fixSetupDefaults: true,
    });

    expect(fixes).toEqual({ deletedDuplicates: [], setupDefaults: [], emptySlugs: [] });
    expect(fake.updates).toEqual([]);
    expect(fake.passes()).toBe(1);
    expect(report.usernameGroups[0].activeCount).toBe(2);
    expect(hasBlockingIssues(report)).toBe(true);
  });

  it('tries the next slug candidate after a unique violation on the cause chain', async () => {
    const fake = fakeDatabase(
      [
        { users: [], defaults: [], emptySlugIds: ['r1'] },
        { users: [], defaults: [], emptySlugIds: [] },
      ],
      (attempt) =>
        attempt === 0 ? new Error('Failed query', { cause: { code: '23505' } }) : undefined,
    );

    const { report, fixes } = await runCheck(fake.database, { fixEmptySlugs: true });

    expect(fixes.emptySlugs).toHaveLength(1);
    expect(fixes.emptySlugs[0].id).toBe('r1');
    expect(fixes.emptySlugs[0].slug).toMatch(/^recipe-[23456789bcdfghjkmnpqrstvwxz]{6}$/);
    expect(fake.updates).toEqual([{ table: recipes, values: { slug: fixes.emptySlugs[0].slug } }]);
    expect(report.emptySlugRecipeIds).toEqual([]);
    expect(formatReport(report)).toContain(
      `Fixed: assigned 1 slug(s): r1 -> ${fixes.emptySlugs[0].slug}`,
    );
  });

  it('rethrows an error that is not a unique violation', async () => {
    const fake = fakeDatabase([{ users: [], defaults: [], emptySlugIds: ['r1'] }], () => {
      return new Error('connection lost');
    });

    await expect(runCheck(fake.database, { fixEmptySlugs: true })).rejects.toThrow(
      'connection lost',
    );
    expect(fake.updates).toEqual([]);
  });

  it('fails when every slug candidate collides', async () => {
    const fake = fakeDatabase([{ users: [], defaults: [], emptySlugIds: ['r1'] }], () => {
      return { code: '23505' };
    });

    await expect(runCheck(fake.database, { fixEmptySlugs: true })).rejects.toThrow(
      'could not allocate a slug for recipe r1',
    );
  });
});

describe('runCheck (DB-backed)', () => {
  const insertedRecipeIds: string[] = [];
  const insertedUserIds: string[] = [];

  afterAll(async () => {
    for (const id of insertedRecipeIds) await db.delete(recipes).where(eq(recipes.id, id));
    for (const id of insertedUserIds) await db.delete(users).where(eq(users.id, id));
  });

  it('reports zero blocking issues on the migrated test database', async () => {
    const { report } = await runCheck(db, {});
    expect(report.emailGroups).toEqual([]);
    expect(report.usernameGroups).toEqual([]);
    expect(report.multipleDefaults).toEqual([]);
    expect(hasBlockingIssues(report)).toBe(false);
  });

  it('reports an empty slug by id and repairs it only with fixEmptySlugs', async (ctx) => {
    const existing = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(eq(recipes.slug, ''))
      .limit(1);
    if (existing.length > 0) ctx.skip();

    const userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `empty-slug-${userId}@example.com`,
      username: `empty-slug-${userId.slice(0, 8)}`,
      passwordHash: 'hash',
    });
    insertedUserIds.push(userId);
    const [recipe] = await db
      .insert(recipes)
      .values({ slug: '', title: '東京コーヒー', authorId: userId, visibility: 'public' })
      .returning({ id: recipes.id });
    insertedRecipeIds.push(recipe.id);

    const plain = await runCheck(db, {});
    expect(plain.report.emptySlugRecipeIds).toContain(recipe.id);
    const [unchanged] = await db
      .select({ slug: recipes.slug })
      .from(recipes)
      .where(eq(recipes.id, recipe.id));
    expect(unchanged.slug).toBe('');

    const fixed = await runCheck(db, { fixEmptySlugs: true });
    expect(fixed.fixes.emptySlugs.map((f) => f.id)).toContain(recipe.id);
    expect(fixed.report.emptySlugRecipeIds).not.toContain(recipe.id);
    const [repaired] = await db
      .select({ slug: recipes.slug })
      .from(recipes)
      .where(eq(recipes.id, recipe.id));
    expect(repaired.slug).toMatch(/^recipe-[23456789bcdfghjkmnpqrstvwxz]{6}$/);
  });
});
