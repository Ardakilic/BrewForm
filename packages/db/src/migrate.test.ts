/**
 * Tests for the migration runner (`packages/db/src/migrate.ts`).
 *
 * - DB-backed: the real runner (spawned as `node src/migrate.ts`, exactly as the
 *   package script and the container entrypoint run it) succeeds twice against
 *   `brewform_test`, and the second run applies nothing: the rows of the default
 *   `drizzle.__drizzle_migrations` tracking table are identical before and after it, and
 *   their number matches the committed journal.
 * - Stubbed: a failing pre-flight prints its message to stderr, returns exit code 1 and
 *   never calls `migrate`; the client is closed on every path.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { asc } from 'drizzle-orm';
import { bigint, pgSchema, serial, text } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { db } from './index.ts';
import {
  describeMigrationError,
  MIGRATIONS_FOLDER,
  type MigrationRunnerDeps,
  runMigrations,
} from './migrate.ts';
import { PG_TRGM_NOT_AVAILABLE_MESSAGE } from './preflight.ts';

/** Drizzle's default tracking table (`drizzle.__drizzle_migrations`), declared for reads only. */
const drizzleMigrations = pgSchema('drizzle').table('__drizzle_migrations', {
  id: serial('id').primaryKey(),
  hash: text('hash').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }),
});

/** Absolute path of the runner script. */
const RUNNER = fileURLToPath(new URL('./migrate.ts', import.meta.url));

/** Run the real runner in a child Node process (native type stripping, like production). */
function spawnRunner() {
  return spawnSync(process.execPath, [RUNNER], {
    env: { ...process.env },
    encoding: 'utf8',
    timeout: 120_000,
  });
}

/** Every applied migration row, ordered by id. */
async function appliedMigrations() {
  return await db
    .select({
      id: drizzleMigrations.id,
      hash: drizzleMigrations.hash,
      createdAt: drizzleMigrations.createdAt,
    })
    .from(drizzleMigrations)
    .orderBy(asc(drizzleMigrations.id));
}

/** Build stub deps; every function is a spy. */
function stubDeps(overrides: Partial<MigrationRunnerDeps> = {}) {
  const client = Object.assign(async () => [] as never[], {
    end: vi.fn(async () => {}),
  }) as unknown as MigrationRunnerDeps['client'] & { end: ReturnType<typeof vi.fn> };
  const deps = {
    client,
    preflight: vi.fn(async () => {}),
    migrate: vi.fn(async () => {}),
    output: { log: vi.fn(), error: vi.fn() },
    ...overrides,
  };
  return deps;
}

describe('migration runner (DB integration)', () => {
  it('runs twice successfully and the second run applies nothing', async () => {
    const first = spawnRunner();
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toContain('Migration runner: started');
    expect(first.stdout).toContain('Migration pre-flight passed');
    expect(first.stdout).toContain('Migration runner: complete');

    const afterFirst = await appliedMigrations();
    const journal = JSON.parse(readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, 'utf8')) as {
      entries: unknown[];
    };
    expect(afterFirst).toHaveLength(journal.entries.length);

    const second = spawnRunner();
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain('Migration runner: complete');
    expect(await appliedMigrations()).toEqual(afterFirst);
  }, 240_000);

  it('exits 1 with a message when DATABASE_URL is missing', () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    const result = spawnSync(process.execPath, [RUNNER], { env, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL is not set');
  });
});

describe('runMigrations (stubbed)', () => {
  it('applies migrations after a passing pre-flight and closes the client', async () => {
    const deps = stubDeps();
    expect(await runMigrations(deps)).toBe(0);
    expect(deps.preflight).toHaveBeenCalledWith(deps.client);
    expect(deps.migrate).toHaveBeenCalledOnce();
    expect(deps.client.end).toHaveBeenCalledOnce();
    expect(deps.output.log).toHaveBeenCalledWith('Migration runner: started');
    expect(deps.output.log).toHaveBeenCalledWith('Migration runner: complete');
    expect(deps.output.error).not.toHaveBeenCalled();
  });

  it('never calls migrate when the pre-flight fails, prints the message and returns 1', async () => {
    const deps = stubDeps({
      preflight: vi.fn(() => Promise.reject(new Error(PG_TRGM_NOT_AVAILABLE_MESSAGE))),
    });
    expect(await runMigrations(deps)).toBe(1);
    expect(deps.migrate).not.toHaveBeenCalled();
    expect(deps.output.error).toHaveBeenCalledWith(
      `Migration runner failed: ${PG_TRGM_NOT_AVAILABLE_MESSAGE}`,
    );
    expect(deps.output.log).not.toHaveBeenCalledWith('Migration runner: complete');
    expect(deps.client.end).toHaveBeenCalledOnce();
  });

  it('returns 1 and closes the client when a migration fails', async () => {
    const deps = stubDeps({
      migrate: vi.fn(() =>
        Promise.reject(
          new Error('Failed query: create table', { cause: new Error('syntax error') }),
        ),
      ),
    });
    expect(await runMigrations(deps)).toBe(1);
    expect(deps.output.error).toHaveBeenCalledWith(
      'Migration runner failed: Failed query: create table (cause: syntax error)',
    );
    expect(deps.client.end).toHaveBeenCalledOnce();
  });
});

describe('describeMigrationError', () => {
  it('describes non-Error values and errors without a cause', () => {
    expect(describeMigrationError('boom')).toBe('boom');
    expect(describeMigrationError(new Error('boom'))).toBe('boom');
  });
});
