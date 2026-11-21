/**
 * Unit tests for the shared pool options: `DB_STATEMENT_TIMEOUT_MS` parsing (default,
 * `0` disables, garbage falls back) and the options passed to postgres-js.
 */
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATEMENT_TIMEOUT_MS,
  parseStatementTimeoutMs,
  sharedPoolOptions,
} from './pool-options.ts';

describe('parseStatementTimeoutMs', () => {
  it('defaults to 10000 when unset or blank', () => {
    expect(DEFAULT_STATEMENT_TIMEOUT_MS).toBe(10_000);
    expect(parseStatementTimeoutMs(undefined)).toBe(10_000);
    expect(parseStatementTimeoutMs('')).toBe(10_000);
    expect(parseStatementTimeoutMs('   ')).toBe(10_000);
  });

  it('accepts 0 (disabled) and positive integers', () => {
    expect(parseStatementTimeoutMs('0')).toBe(0);
    expect(parseStatementTimeoutMs('2500')).toBe(2500);
    expect(parseStatementTimeoutMs(' 30000 ')).toBe(30_000);
  });

  it('falls back to the default for garbage, negative and fractional values', () => {
    for (const raw of ['abc', '-1', '1.5', '10s', '1e4', 'NaN', '99999999999999999999']) {
      expect(parseStatementTimeoutMs(raw)).toBe(10_000);
    }
  });
});

describe('sharedPoolOptions', () => {
  it('sets the pool size, connect/idle timeouts and the statement_timeout parameter', () => {
    expect(sharedPoolOptions(10_000)).toEqual({
      max: 10,
      connect_timeout: 10,
      idle_timeout: 20,
      connection: { statement_timeout: 10_000 },
    });
  });

  it('omits statement_timeout when the timeout is disabled', () => {
    expect(sharedPoolOptions(0).connection).toEqual({});
  });
});

describe('sharedPoolOptions against brewform_test', () => {
  /** Run `SHOW statement_timeout` on a fresh one-connection pool built from the options. */
  async function showStatementTimeout(timeoutMs: number): Promise<string> {
    const sql = postgres(process.env.DATABASE_URL ?? '', {
      ...sharedPoolOptions(timeoutMs),
      max: 1,
    });
    try {
      const rows = await sql<{ statement_timeout: string }[]>`show statement_timeout`;
      return rows[0].statement_timeout;
    } finally {
      await sql.end();
    }
  }

  it('applies the default 10s statement_timeout', async () => {
    expect(await showStatementTimeout(parseStatementTimeoutMs(undefined))).toBe('10s');
  });

  it('disables the statement_timeout for DB_STATEMENT_TIMEOUT_MS=0', async () => {
    expect(await showStatementTimeout(parseStatementTimeoutMs('0'))).toBe('0');
  });
});
