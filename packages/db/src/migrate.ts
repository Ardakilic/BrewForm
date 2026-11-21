/**
 * Database migration runner for BrewForm.
 *
 * Applies the committed SQL migrations in `packages/db/drizzle/` with Drizzle's
 * `postgres-js` migrator, tracking applied migrations in the default
 * `drizzle.__drizzle_migrations` table, so applying an already-applied set is a no-op.
 * It is the single migration path for development (`make db-migrate`), CI and test
 * provisioning (`pnpm --filter @brewform/db run migrate`) and production (the container
 * entrypoint runs `node /app/packages/db/src/migrate.ts`). It needs neither pnpm nor
 * drizzle-kit at runtime: Node 26 strips the TypeScript types natively.
 *
 * Before `migrate()` it runs {@link assertMigrationPreflight} (the `pg_trgm` check). A
 * failed pre-flight prints its fixed message to stderr and exits with status 1 without
 * applying anything.
 *
 * The runner opens its own single-connection client with NO statement timeout
 * (unlike the shared pool in `index.ts`), because index builds such as the GIN
 * `gin_trgm_ops` indexes can run longer than the API's 10 s query budget.
 *
 * Output: plain `console` lines (entry, pre-flight, exit). Errors print only the error
 * message (and its cause's message), never `DATABASE_URL` or credentials.
 *
 * Required env: `DATABASE_URL`.
 *
 * ```sh
 * node src/migrate.ts            # from packages/db (the `migrate` package script)
 * node /app/packages/db/src/migrate.ts   # inside the API image
 * ```
 *
 * @module
 */
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { assertMigrationPreflight, type PreflightClient } from './preflight.ts';

/** Absolute path of the committed migrations folder (`packages/db/drizzle`). */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));

/** The console methods the runner writes to (injectable for tests). */
export interface MigrationRunnerOutput {
  /** Progress lines (stdout). */
  log: (message: string) => void;
  /** Error lines (stderr). */
  error: (message: string) => void;
}

/** Everything {@link runMigrations} needs; tests inject stubs. */
export interface MigrationRunnerDeps {
  /** The runner's own postgres-js client (pre-flight query, then closed in `finally`). */
  client: PreflightClient & { end: () => Promise<void> };
  /** The pre-flight check (defaults to {@link assertMigrationPreflight}). */
  preflight: (client: PreflightClient) => Promise<void>;
  /** Applies pending migrations (defaults to Drizzle's `migrate()` on {@link MIGRATIONS_FOLDER}). */
  migrate: () => Promise<void>;
  /** Output sink (defaults to `console`). */
  output: MigrationRunnerOutput;
}

/**
 * Describe an error for stderr: its message plus the cause's message when present
 * (Drizzle wraps driver errors in `DrizzleQueryError`). Never includes the connection
 * string, which no error message here carries.
 *
 * @param err - The thrown value.
 * @returns One line of text.
 */
export function describeMigrationError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause instanceof Error ? err.cause.message : undefined;
  return cause && cause !== err.message ? `${err.message} (cause: ${cause})` : err.message;
}

/**
 * Run the pre-flight and then the migrations, always closing the client.
 *
 * @param deps - Client, pre-flight, migrate function and output sink.
 * @returns The process exit code: `0` on success, `1` when the pre-flight or a
 *   migration failed (the error message is printed to stderr first).
 */
export async function runMigrations(deps: MigrationRunnerDeps): Promise<0 | 1> {
  const { client, output } = deps;
  output.log('Migration runner: started');
  try {
    await deps.preflight(client);
    await deps.migrate();
    output.log('Migration runner: complete');
    return 0;
  } catch (err) {
    output.error(`Migration runner failed: ${describeMigrationError(err)}`);
    return 1;
  } finally {
    await client.end();
  }
}

/**
 * Build the production dependencies: a single-connection postgres-js client on
 * `databaseUrl` without a statement timeout, the real pre-flight and Drizzle's
 * migrator on {@link MIGRATIONS_FOLDER} with the default tracking table.
 *
 * @param databaseUrl - The PostgreSQL connection string.
 * @returns Dependencies for {@link runMigrations}.
 */
export function createMigrationRunnerDeps(databaseUrl: string): MigrationRunnerDeps {
  const client = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    onnotice: () => {
      // `CREATE SCHEMA IF NOT EXISTS` and friends raise NOTICEs on re-runs; drop them so
      // stdout stays clean (errors still reject the query).
    },
  });
  return {
    client,
    preflight: assertMigrationPreflight,
    migrate: () => migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER }),
    output: console,
  };
}

if (import.meta.main) {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error('Migration runner failed: DATABASE_URL is not set');
    process.exit(1);
  }
  process.exitCode = await runMigrations(createMigrationRunnerDeps(databaseUrl));
}
