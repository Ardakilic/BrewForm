/**
 * DB-backed tests for the comment-count recount (D99.67, comment-authz "Stored comment counts are
 * recounted after every migration run").
 *
 * Fixtures use unique ids and are deleted in `afterEach`. The recount scans every live recipe of
 * the test database, so assertions name the fixture recipes (other rows may be repaired too).
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from './index.ts';
import {
  RECOUNT_BATCH_SIZE,
  type RecountOutput,
  recountCommentCounts,
  runRecount,
} from './recount-comment-counts.ts';
import { comments, recipes, users } from './schema.ts';

/** An output sink that records every line. */
function captureOutput(): RecountOutput & { lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    lines,
    errors,
    log: (message: string) => lines.push(message),
    error: (message: string) => errors.push(message),
  };
}

/**
 * A database stand-in whose every builder call returns itself and whose awaited queries reject,
 * like a database that went away mid-run.
 */
function rejectingDatabase(): typeof db {
  const handler: ProxyHandler<() => unknown> = {
    get: (_target, prop) =>
      prop === 'then'
        ? (_resolve: unknown, reject: (err: Error) => void) =>
            reject(new Error('connection refused'))
        : stand,
    apply: () => stand,
  };
  const stand: unknown = new Proxy(() => undefined, handler);
  return stand as typeof db;
}

describe('recountCommentCounts', () => {
  const userIds: string[] = [];
  const recipeIds: string[] = [];
  let recipeA: string;
  let recipeB: string;
  let recipeC: string;
  let recipeD: string;

  /** Insert a user and track it for cleanup. */
  async function insertUser(prefix: string, deleted = false): Promise<string> {
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      email: `${prefix}-${id}@example.com`,
      username: `${prefix}-${id.slice(0, 8)}`,
      passwordHash: 'hash',
      deletedAt: deleted ? new Date() : null,
    });
    userIds.push(id);
    return id;
  }

  /** Insert a recipe with a stored `commentCount` and track it for cleanup. */
  async function insertRecipe(
    authorId: string,
    commentCount: number,
    deleted = false,
  ): Promise<string> {
    const id = crypto.randomUUID();
    await db.insert(recipes).values({
      id,
      slug: `recount-${id}`,
      title: `Recount ${id.slice(0, 8)}`,
      authorId,
      visibility: 'public',
      commentCount,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: deleted ? new Date() : null,
    });
    recipeIds.push(id);
    return id;
  }

  /** Insert a comment and return its id. */
  async function insertComment(values: {
    recipeId: string;
    authorId: string;
    parentCommentId?: string;
    deleted?: boolean;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await db.insert(comments).values({
      id,
      recipeId: values.recipeId,
      authorId: values.authorId,
      content: 'recount fixture',
      parentCommentId: values.parentCommentId ?? null,
      deletedAt: values.deleted ? new Date() : null,
    });
    return id;
  }

  /**
   * Read the stored count and `updatedAt` of the fixture recipes; `get(id)` throws for an id that
   * is not a fixture recipe.
   */
  async function storedRows() {
    const rows = await db
      .select({ id: recipes.id, commentCount: recipes.commentCount, updatedAt: recipes.updatedAt })
      .from(recipes)
      .where(inArray(recipes.id, recipeIds));
    const byId = new Map(rows.map((row) => [row.id, row]));
    return {
      get(id: string) {
        const row = byId.get(id);
        if (!row) throw new Error(`fixture recipe ${id} not found`);
        return row;
      },
    };
  }

  beforeEach(async () => {
    const author = await insertUser('recount-author');
    const goneAuthor = await insertUser('recount-gone', true);

    // A stores 7: a live top-level comment and its live reply count; a deleted top-level
    // comment's live reply and a deleted reply do not. Expected 2.
    recipeA = await insertRecipe(author, 7);
    const liveTop = await insertComment({ recipeId: recipeA, authorId: author });
    await insertComment({ recipeId: recipeA, authorId: author, parentCommentId: liveTop });
    const deletedTop = await insertComment({ recipeId: recipeA, authorId: author, deleted: true });
    await insertComment({ recipeId: recipeA, authorId: author, parentCommentId: deletedTop });
    await insertComment({
      recipeId: recipeA,
      authorId: author,
      parentCommentId: liveTop,
      deleted: true,
    });

    // B stores -1: one live top-level comment by a soft-deleted account counts. Expected 1.
    recipeB = await insertRecipe(author, -1);
    await insertComment({ recipeId: recipeB, authorId: goneAuthor });

    // C stores 0: a live top-level comment counts; a live reply stored under a comment on A
    // (cross-recipe) does not. Expected 1.
    recipeC = await insertRecipe(author, 0);
    await insertComment({ recipeId: recipeC, authorId: author });
    await insertComment({ recipeId: recipeC, authorId: author, parentCommentId: liveTop });

    // D is soft-deleted and stores 5: never touched.
    recipeD = await insertRecipe(author, 5, true);
  });

  afterEach(async () => {
    // Replies first: the parent foreign key has no cascade.
    await db
      .delete(comments)
      .where(and(inArray(comments.recipeId, recipeIds), isNotNull(comments.parentCommentId)));
    await db.delete(comments).where(inArray(comments.recipeId, recipeIds));
    await db.delete(recipes).where(inArray(recipes.id, recipeIds));
    await db.delete(users).where(inArray(users.id, userIds));
    recipeIds.length = 0;
    userIds.length = 0;
  });

  it('uses batches of 500 by default', () => {
    expect(RECOUNT_BATCH_SIZE).toBe(500);
  });

  it('repairs drifted live recipes, leaves deleted ones and updatedAt alone, and reports ids only', async () => {
    const before = await storedRows();
    const output = captureOutput();

    const result = await recountCommentCounts(db, { batchSize: 1, output });

    const after = await storedRows();
    expect(after.get(recipeA).commentCount).toBe(2);
    expect(after.get(recipeB).commentCount).toBe(1);
    expect(after.get(recipeC).commentCount).toBe(1);
    expect(after.get(recipeD).commentCount).toBe(5);
    for (const id of recipeIds) {
      expect(after.get(id).updatedAt.getTime()).toBe(before.get(id).updatedAt.getTime());
    }

    expect(result.repaired).toEqual(expect.arrayContaining([recipeA, recipeB, recipeC]));
    expect(result.repaired).not.toContain(recipeD);
    expect(result.skipped).toEqual([]);
    expect(result.scanned).toBeGreaterThanOrEqual(3);
    expect(output.lines).toContain(`Comment count recount: repaired recipe ${recipeA} (7 -> 2)`);
    expect(output.lines).toContain(`Comment count recount: repaired recipe ${recipeB} (-1 -> 1)`);
    expect(output.lines).toContain(`Comment count recount: repaired recipe ${recipeC} (0 -> 1)`);
    expect(output.lines.at(-1)).toBe(
      `Comment count recount: complete (scanned ${result.scanned}, repaired ${result.repaired.length}, skipped 0)`,
    );
    expect(output.errors).toEqual([]);
    // Privacy: only recipe ids and counts, never user data or comment text.
    expect(output.lines.join('\n')).not.toMatch(/@example\.com|recount-author|recount fixture/);
  });

  it('is idempotent: a second run repairs nothing', async () => {
    await recountCommentCounts(db, { batchSize: 2, output: captureOutput() });
    const output = captureOutput();

    const second = await recountCommentCounts(db, { output });

    expect(second.repaired).toEqual([]);
    expect(second.skipped).toEqual([]);
    expect(output.lines.at(-1)).toMatch(
      /^Comment count recount: complete \(scanned \d+, repaired 0, skipped 0\)$/,
    );
  });

  it('skips a recipe whose stored count changed after its batch was read (compare-and-set)', async () => {
    const output = captureOutput();

    const result = await recountCommentCounts(db, {
      batchSize: 1,
      output,
      afterRead: async (batch) => {
        if (batch.some((row) => row.id === recipeA)) {
          await db.update(recipes).set({ commentCount: 9 }).where(eq(recipes.id, recipeA));
        }
      },
    });

    expect(result.skipped).toContain(recipeA);
    expect(result.repaired).not.toContain(recipeA);
    expect(result.repaired).toEqual(expect.arrayContaining([recipeB, recipeC]));
    expect((await storedRows()).get(recipeA).commentCount).toBe(9);
    expect(output.lines).toContain(
      `Comment count recount: skipped recipe ${recipeA} (changed since it was read)`,
    );
  });
});

describe('runRecount', () => {
  it('returns 0 after a successful run', async () => {
    const output = captureOutput();
    expect(await runRecount(db, output)).toBe(0);
    expect(output.errors).toEqual([]);
    expect(output.lines.at(-1)).toMatch(/^Comment count recount: complete \(/);
  });

  it('returns 1 and prints the failure line when a query rejects', async () => {
    const output = captureOutput();
    expect(await runRecount(rejectingDatabase(), output)).toBe(1);
    expect(output.errors).toEqual(['Comment count recount failed: connection refused']);
  });
});
