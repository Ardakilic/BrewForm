import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { parseStatementTimeoutMs, sharedPoolOptions } from './pool-options.ts';
import * as schema from './schema.ts';

const connectionString = process.env.DATABASE_URL!;

/**
 * Server-side statement timeout for every pooled connection, from
 * `DB_STATEMENT_TIMEOUT_MS` (default 10000 ms; `0` disables it; a non-integer or
 * negative value falls back to the default). A cancelled statement fails with
 * SQLSTATE `57014`, which the API maps to 503 `QUERY_TIMEOUT`.
 */
const statementTimeoutMs = parseStatementTimeoutMs(process.env.DB_STATEMENT_TIMEOUT_MS);

/**
 * Raw postgres-js connection pool shared by the API: `max: 10` connections, a 10 s
 * `connect_timeout`, a 20 s `idle_timeout`, and the `statement_timeout` startup
 * parameter (see {@link statementTimeoutMs}) on every connection.
 */
const client = postgres(connectionString, sharedPoolOptions(statementTimeoutMs));
/** Drizzle ORM instance bound to the full BrewForm schema. */
export const db = drizzle(client, { schema });
export { client };
