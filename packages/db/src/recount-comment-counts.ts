/**
 * Comment-count recount (D99.67, capability `comment-authz`, "Stored comment counts are
 * recounted after every migration run").
 *
 * `recipe.comment_count` is a stored display counter: creating a comment adds 1 and deleting one
 * subtracts the rows that delete soft-deleted. Old rows, the create crash window (create and
 * increment are separate statements) and data from before those rules can leave it drifted. This
 * script recomputes it for every live recipe and repairs the rows that differ.
 *
 * Invocation:
 *
 * ```sh
 * make db-recount-comments                                  # development (also run by make db-migrate)
 * pnpm --filter @brewform/db run recount-comment-counts     # any workspace shell with DATABASE_URL
 * node /app/packages/db/src/recount-comment-counts.ts       # inside the API image (the entrypoint
 *                                                           # runs it after every migration run)
 * ```
 *
 * Counting rule: a recipe counts its live comments (`deleted_at is null`) that are top-level, or
 * replies whose parent is a live comment on the same recipe. Comments of deleted accounts count
 * (they stay listed); replies past the 20-reply display cap count (they stay stored). Not counted:
 * a live reply whose parent was deleted (before the thread delete existed) and a reply stored under
 * another recipe's comment. Soft-deleted recipes are never touched.
 *
 * How: live recipes are read in keyset batches (`id` order, {@link RECOUNT_BATCH_SIZE} rows per
 * batch), each with its stored count and a correlated `$count` of the counted comments. Each
 * drifted row is repaired with one compare-and-set update (`where id = $id and comment_count =
 * $stored`): a counter that changed after its batch was read is left alone and reported as
 * skipped, and the next run repairs it. No transaction, no `sql` fragment; `updated_at` is not
 * changed. Re-running is harmless.
 *
 * Output contract (stdout through `output.log`, stderr through `output.error`):
 * - `Comment count recount: started`
 * - `Comment count recount: repaired recipe <id> (<stored> -> <counted>)` per repaired recipe
 * - `Comment count recount: skipped recipe <id> (changed since it was read)` per skipped recipe
 * - `Comment count recount: complete (scanned <n>, repaired <n>, skipped <n>)`
 * - on a query error: `Comment count recount failed: <message>` on stderr, exit code 1
 *
 * The docker entrypoint treats a failed run as a warning and keeps booting (the counter is a
 * display value and the next start repeats the recount); this script's own exit code stays 1, so
 * `make db-recount-comments` and the CI smoke test fail loudly.
 *
 * Privacy rule: the output names only recipe ids and counts, never users, emails or comment text,
 * and the error line carries only the error message (never `DATABASE_URL`).
 *
 * Required env: `DATABASE_URL`.
 *
 * @module
 */
import { and, asc, eq, exists, gt, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { client, db } from './index.ts';
import { describeMigrationError } from './migrate.ts';
import { comments, recipes } from './schema.ts';

/** Live recipes read per keyset batch. */
export const RECOUNT_BATCH_SIZE = 500;

/** The console methods the recount writes to (injectable for tests). */
export interface RecountOutput {
  /** Progress and result lines (stdout). */
  log: (message: string) => void;
  /** The failure line (stderr). */
  error: (message: string) => void;
}

/** One recipe of a read batch: its id, stored counter and freshly counted comments. */
export interface RecountRow {
  id: string;
  stored: number;
  counted: number;
}

/** Options for {@link recountCommentCounts}. */
export interface RecountOptions {
  /** Live recipes per keyset batch (default {@link RECOUNT_BATCH_SIZE}). */
  batchSize?: number;
  /** Output sink (default `console`). */
  output?: RecountOutput;
  /**
   * Test seam: runs after each batch is read and before its repairs, so a test can change a
   * stored counter in between and observe the compare-and-set skip.
   */
  afterRead?: (batch: readonly RecountRow[]) => Promise<void> | void;
}

/** What one run did. */
export interface RecountResult {
  /** Live recipes read. */
  scanned: number;
  /** Ids of recipes whose counter was repaired. */
  repaired: string[];
  /** Ids of drifted recipes left alone because their counter changed after it was read. */
  skipped: string[];
}

/**
 * The counted comments of the outer `recipe` row as a correlated `$count`: live comments of that
 * recipe that are top-level or reply to a live comment on the same recipe.
 *
 * @param database - The Drizzle client the subqueries are built on.
 */
function countedComments(database: typeof db) {
  const parent = alias(comments, 'parent_comment');
  return database.$count(
    comments,
    and(
      eq(comments.recipeId, recipes.id),
      isNull(comments.deletedAt),
      or(
        isNull(comments.parentCommentId),
        exists(
          database
            .select({ id: parent.id })
            .from(parent)
            .where(
              and(
                eq(parent.id, comments.parentCommentId),
                eq(parent.recipeId, comments.recipeId),
                isNull(parent.deletedAt),
              ),
            ),
        ),
      ),
    ),
  );
}

/**
 * Recount every live recipe's comments and repair the drifted counters (see the module docblock
 * for the counting rule, the output lines and the concurrency rule).
 *
 * @param database - The Drizzle client (`@brewform/db`'s `db`).
 * @param options - Batch size, output sink and the `afterRead` test seam.
 * @returns The number of recipes read and the ids repaired and skipped.
 */
export async function recountCommentCounts(
  database: typeof db,
  options: RecountOptions = {},
): Promise<RecountResult> {
  const batchSize = options.batchSize ?? RECOUNT_BATCH_SIZE;
  const output = options.output ?? console;
  const result: RecountResult = { scanned: 0, repaired: [], skipped: [] };
  output.log('Comment count recount: started');

  let lastId: string | null = null;
  for (;;) {
    const live = isNull(recipes.deletedAt);
    const batch: RecountRow[] = await database
      .select({ id: recipes.id, stored: recipes.commentCount, counted: countedComments(database) })
      .from(recipes)
      .where(lastId === null ? live : and(live, gt(recipes.id, lastId)))
      .orderBy(asc(recipes.id))
      .limit(batchSize);
    if (batch.length === 0) break;
    result.scanned += batch.length;
    lastId = batch[batch.length - 1].id;
    await options.afterRead?.(batch);

    for (const row of batch) {
      if (row.stored === row.counted) continue;
      const updated = await database
        .update(recipes)
        .set({ commentCount: row.counted })
        .where(and(eq(recipes.id, row.id), eq(recipes.commentCount, row.stored)))
        .returning({ id: recipes.id });
      if (updated.length > 0) {
        result.repaired.push(row.id);
        output.log(
          `Comment count recount: repaired recipe ${row.id} (${row.stored} -> ${row.counted})`,
        );
      } else {
        result.skipped.push(row.id);
        output.log(`Comment count recount: skipped recipe ${row.id} (changed since it was read)`);
      }
    }
    if (batch.length < batchSize) break;
  }

  output.log(
    `Comment count recount: complete (scanned ${result.scanned}, repaired ${result.repaired.length}, skipped ${result.skipped.length})`,
  );
  return result;
}

/**
 * Run the recount and map the outcome to a process exit code.
 *
 * @param database - The Drizzle client.
 * @param output - Output sink (the failure line goes to `output.error`).
 * @returns `0` after a complete run, `1` when a query failed.
 */
export async function runRecount(database: typeof db, output: RecountOutput): Promise<0 | 1> {
  try {
    await recountCommentCounts(database, { output });
    return 0;
  } catch (err) {
    output.error(`Comment count recount failed: ${describeMigrationError(err)}`);
    return 1;
  }
}

if (import.meta.main) {
  try {
    process.exitCode = await runRecount(db, console);
  } finally {
    // Release the postgres connection pool so the process exits promptly.
    await client.end();
  }
}
