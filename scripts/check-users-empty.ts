/**
 * First-boot seed sentinel for the BrewForm API Docker image.
 *
 * Prints the number of rows in the `users` table to stdout (and nothing else),
 * so the container entrypoint (`docker-entrypoint.sh`) can decide whether to run
 * the one-time database seed:
 *
 * ```sh
 * USER_COUNT=$(deno run --allow-env --allow-net --allow-read \
 *   /app/scripts/check-users-empty.ts)
 * [ "$USER_COUNT" = "0" ] && deno run --allow-all /app/packages/db/src/seed.ts
 * ```
 *
 * The admin account is the first row the seed inserts, so an empty `users` table
 * means the database has never been seeded. Using the existing `@brewform/db`
 * client (instead of `psql`) keeps the Deno runtime image free of a Postgres
 * client dependency.
 *
 * Output contract (load-bearing — the entrypoint captures stdout verbatim):
 *   - stdout: the bare integer count, e.g. `0` or `42`, followed by a newline.
 *   - stderr: any incidental diagnostics (none are emitted on the happy path).
 *
 * Failure behaviour: if the count query fails (DB unreachable, bad
 * `DATABASE_URL`, ...) the rejected promise propagates, Deno exits non-zero, and
 * the entrypoint's `set -e` aborts the boot. The check NEVER masks an error to
 * `0`, which would otherwise re-seed an already-populated database on every boot.
 *
 * Required permissions: `--allow-env` + `--allow-net` (reach Postgres via
 * `DATABASE_URL`) and `--allow-read` (Deno workspace / module resolution).
 *
 * @module
 */

import { client, db } from '@brewform/db';
import { users } from '@brewform/db/schema';

/**
 * Counts the rows in the `users` table.
 *
 * The Drizzle client is injected (rather than referencing the module-level `db`
 * directly) so the count logic is unit-testable with a lightweight stub and no
 * live Postgres connection. Production callers pass the real `@brewform/db` `db`.
 *
 * @param database The Drizzle database client (`@brewform/db`'s `db`, or a
 *   structurally compatible stub in tests).
 * @returns The total number of rows in the `users` table.
 */
export async function countUsers(database: typeof db): Promise<number> {
  // `$count` emits `SELECT count(*) FROM "user"` and resolves to a number,
  // avoiding a direct `drizzle-orm` import (not a dependency of repo-root scripts).
  return await database.$count(users);
}

if (import.meta.main) {
  // Print ONLY the bare integer to stdout; the entrypoint captures it directly.
  console.log(await countUsers(db));
  // Release the postgres connection pool so the process exits promptly.
  await client.end();
}
