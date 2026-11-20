/**
 * Tests for the operator identifier check `packages/db/src/check-identifiers.ts`
 * (spec: unique-identifiers, "Identifier conflicts are detected and remediated
 * before stricter constraints apply").
 *
 * The grouping and report helpers are pure and tested over plain row arrays;
 * `runCheck` is exercised against the migrated `brewform_test` database.
 */
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildReport,
  findMultipleDefaults,
  formatReport,
  groupCaseInsensitiveDuplicates,
  hasBlockingIssues,
  type IdentifierUserRow,
  parseCliOptions,
  runCheck,
} from './check-identifiers.ts';
import { db } from './index.ts';
import { recipes, users } from './schema.ts';

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
