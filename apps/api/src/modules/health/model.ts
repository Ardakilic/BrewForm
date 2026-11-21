/**
 * Health data-access layer: the readiness probe's database round-trip.
 *
 * Pure Drizzle ORM — no business logic, no logging. Called exclusively by
 * `health/service.ts`, so no route imports `drizzle-orm` and no raw SQL is used.
 */
import { db } from '@brewform/db';
import { users } from '@brewform/db/schema';

/**
 * Database connectivity probe for `GET /ready`: one bounded Drizzle query
 * (`select id from "user" limit 1`) on the shared pool.
 *
 * It reads no row data (the result is discarded; an empty table passes too) and
 * only proves a round-trip. Because it names a migrated table, it also fails on an
 * unmigrated schema, so readiness doubles as "migrations ran".
 *
 * @returns Resolves when the database answered; rejects on any connection or query error.
 */
export async function pingDatabase(): Promise<void> {
  await db.select({ id: users.id }).from(users).limit(1);
}
