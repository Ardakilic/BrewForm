/**
 * Migration pre-flight checks, run by the migration runner (`packages/db/src/migrate.ts`)
 * before any migration is applied.
 *
 * The `enable_pg_trgm` migration runs `CREATE EXTENSION IF NOT EXISTS pg_trgm;` and the
 * next one builds GIN `gin_trgm_ops` indexes (ADR-017). On a server without the contrib
 * modules, or for a role without `CREATE` on the database, that would fail half-way
 * through a deployment. {@link assertMigrationPreflight} detects both up front from
 * catalog data only, so the runner can stop with a clear remedy before `migrate()`.
 * Both official images BrewForm uses (`postgres:18-trixie`, `postgres:18-alpine`) ship
 * `pg_trgm` 1.6, so the check protects managed or custom PostgreSQL servers.
 */

/** One row of the pre-flight catalog query. */
export interface PreflightCatalogRow {
  /** `pg_trgm` is already installed in the current database (`pg_extension`). */
  installed: boolean;
  /** The server can install `pg_trgm` (`pg_available_extensions`). */
  available: boolean;
  /** The connected role has `CREATE` on the current database (enough: `pg_trgm` is trusted). */
  can_create: boolean;
  /** `current_user`, named in the "lacks CREATE" message. */
  role: string;
  /** `current_database()`, named in the "lacks CREATE" message. */
  database: string;
}

/**
 * The client the pre-flight runs on: a postgres-js `sql` tagged-template function (the
 * runner's own client), or any stub with the same call shape returning catalog rows.
 * The query interpolates no values.
 */
export type PreflightClient = (
  strings: TemplateStringsArray,
) => PromiseLike<readonly PreflightCatalogRow[]>;

/** Error message when the server cannot install `pg_trgm` at all. */
export const PG_TRGM_NOT_AVAILABLE_MESSAGE =
  'pg_trgm is not available on this PostgreSQL server; use the official postgres image or install the contrib package';

/**
 * Error message when `pg_trgm` is available but not installed and the role cannot create it.
 *
 * @param role - The connected role (`current_user`).
 * @param database - The target database (`current_database()`).
 * @returns The fixed remedy message naming the role and database.
 */
export function pgTrgmNoCreateMessage(role: string, database: string): string {
  return `role ${role} lacks CREATE on database ${database}; run "CREATE EXTENSION pg_trgm;" as the database owner, then rerun migrations`;
}

/**
 * Verify that the `pg_trgm` extension is installed in the target database, or available
 * on the server and creatable by the connected role, before any migration runs.
 *
 * Runs ONE read-only catalog query (`pg_extension`, `pg_available_extensions` and
 * `has_database_privilege(current_user, current_database(), 'CREATE')`). Outcomes:
 * - installed → passes (no privilege needed, `IF NOT EXISTS` is a no-op);
 * - not installed and not available → throws {@link PG_TRGM_NOT_AVAILABLE_MESSAGE};
 * - available but the role lacks `CREATE` → throws {@link pgTrgmNoCreateMessage};
 * - available and creatable → passes.
 *
 * The runner prints the error message and exits with status 1 without calling
 * `migrate()`. Log lines go to `console` like the rest of the runner and never include
 * the connection string or credentials.
 *
 * @param client - The runner's postgres-js client (or a stub; see {@link PreflightClient}).
 * @returns Resolves when migrations may proceed.
 * @throws {Error} With one of the two fixed messages when they may not.
 */
export async function assertMigrationPreflight(client: PreflightClient): Promise<void> {
  console.log('Migration pre-flight: checking the pg_trgm extension...');

  // D03 raw-SQL exception: catalog pre-flight in the migration runner, not application
  // query code. Drizzle has no builder for pg_extension / pg_available_extensions or
  // has_database_privilege(); the statement is fixed text with no interpolated values.
  const rows = await client`
    select
      exists (select 1 from pg_extension where extname = 'pg_trgm') as installed,
      exists (select 1 from pg_available_extensions where name = 'pg_trgm') as available,
      has_database_privilege(current_user, current_database(), 'CREATE') as can_create,
      current_user as role,
      current_database() as database
  `;
  const row = rows[0];

  if (row.installed) {
    console.log('Migration pre-flight passed: pg_trgm is installed');
    return;
  }
  if (!row.available) throw new Error(PG_TRGM_NOT_AVAILABLE_MESSAGE);
  if (!row.can_create) throw new Error(pgTrgmNoCreateMessage(row.role, row.database));
  console.log('Migration pre-flight passed: pg_trgm is available and the role can create it');
}
