/**
 * Truncate all database tables.
 *
 * Usage:
 *   pnpm --filter @brewform/api exec tsx scripts/flush-db.ts
 *   make flush-db
 */

import * as schema from '@brewform/db/schema';
import { getTableConfig } from 'drizzle-orm/pg-core';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required.');
  process.exit(1);
}

const { client } = await import('@brewform/db');

const TABLE_NAMES: string[] = [];
for (const value of Object.values(schema)) {
  try {
    TABLE_NAMES.push(getTableConfig(value as never).name);
  } catch {
    // skip non-table exports (enums, relations, etc.)
  }
}

console.log(`Truncating ${TABLE_NAMES.length} database tables...`);
try {
  await client.unsafe(`TRUNCATE TABLE ${TABLE_NAMES.join(', ')} RESTART IDENTITY CASCADE`);
  console.log(`Truncated ${TABLE_NAMES.length} tables successfully.`);
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to truncate tables: ${message}`);
  process.exit(1);
} finally {
  await client.end();
}
