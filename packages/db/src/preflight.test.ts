/**
 * Tests for the migration pre-flight (`assertMigrationPreflight`, capability
 * `advanced-search`, "Migrations pre-flight the trigram extension").
 *
 * The three outcomes run against a stub client: a tagged-template function that
 * records the catalog query and returns canned catalog rows. One DB-backed case runs
 * the real query against `brewform_test` (official `postgres:18` image), which must pass.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { client } from './index.ts';
import {
  assertMigrationPreflight,
  PG_TRGM_NOT_AVAILABLE_MESSAGE,
  type PreflightCatalogRow,
  pgTrgmNoCreateMessage,
} from './preflight.ts';

/** Build a stub client returning one catalog row; `queries` records each query text. */
function stubClient(row: Partial<PreflightCatalogRow>) {
  const queries: string[] = [];
  const stub = (strings: TemplateStringsArray) => {
    queries.push(strings.join('$'));
    return Promise.resolve([
      {
        installed: false,
        available: false,
        can_create: false,
        role: 'brewform_app',
        database: 'brewform_prod',
        ...row,
      },
    ]);
  };
  return { stub, queries };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('assertMigrationPreflight (stub client)', () => {
  it('throws the "not available" message when pg_trgm is neither installed nor available', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { stub } = stubClient({ installed: false, available: false, can_create: true });
    await expect(assertMigrationPreflight(stub)).rejects.toThrow(PG_TRGM_NOT_AVAILABLE_MESSAGE);
    expect(PG_TRGM_NOT_AVAILABLE_MESSAGE).toBe(
      'pg_trgm is not available on this PostgreSQL server; use the official postgres image or install the contrib package',
    );
  });

  it('throws the "lacks CREATE" message naming the role and database', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { stub } = stubClient({ installed: false, available: true, can_create: false });
    await expect(assertMigrationPreflight(stub)).rejects.toThrow(
      'role brewform_app lacks CREATE on database brewform_prod; run "CREATE EXTENSION pg_trgm;" as the database owner, then rerun migrations',
    );
    expect(pgTrgmNoCreateMessage('r', 'd')).toBe(
      'role r lacks CREATE on database d; run "CREATE EXTENSION pg_trgm;" as the database owner, then rerun migrations',
    );
  });

  it('passes when pg_trgm is already installed, even without CREATE', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { stub } = stubClient({ installed: true, available: true, can_create: false });
    await expect(assertMigrationPreflight(stub)).resolves.toBeUndefined();
    const lines = log.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(lines).toContain('pre-flight');
    expect(lines).not.toMatch(/password|postgres(ql)?:\/\//i);
  });

  it('passes when pg_trgm is available and the role may create it', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { stub } = stubClient({ installed: false, available: true, can_create: true });
    await expect(assertMigrationPreflight(stub)).resolves.toBeUndefined();
  });

  it('reads only catalog data in one query', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { stub, queries } = stubClient({ installed: true });
    await assertMigrationPreflight(stub);
    expect(queries).toHaveLength(1);
    const [query] = queries;
    expect(query).toContain('pg_extension');
    expect(query).toContain('pg_available_extensions');
    expect(query).toContain("has_database_privilege(current_user, current_database(), 'CREATE')");
    // A single read-only SELECT: no second statement, no DDL/DML keyword outside the
    // privilege name passed to has_database_privilege.
    expect(query.trim().toLowerCase().startsWith('select')).toBe(true);
    expect(query).not.toContain(';');
    expect(query.replace("'CREATE'", '')).not.toMatch(
      /\b(create|insert|update|delete|drop|alter)\b/i,
    );
  });
});

describe('assertMigrationPreflight (brewform_test)', () => {
  it('passes on the official postgres image', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(assertMigrationPreflight(client)).resolves.toBeUndefined();
  });
});
