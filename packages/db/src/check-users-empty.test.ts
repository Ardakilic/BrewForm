/**
 * Unit tests for the first-boot seed sentinel `scripts/check-users-empty.ts`.
 *
 * The script's count logic is exposed as the dependency-injected `countUsers`
 * function, which lets these tests assert the returned integer for a known DB
 * state using a lightweight Drizzle stub — no live Postgres connection required.
 * This matches the repo's preference for fast, hermetic unit tests where a real
 * database harness is not readily available.
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

import { countUsers } from '../../../scripts/check-users-empty.ts';

/**
 * Builds a minimal Drizzle-shaped stub whose `$count(table)` resolves to the
 * given count — the exact shape the real client returns for `db.$count(users)`.
 *
 * @param userCount The user count the stubbed query should report.
 * @returns A stub cast to the parameter type expected by `countUsers`.
 */
function dbStub(userCount: number): Parameters<typeof countUsers>[0] {
  const stub = {
    $count() {
      return Promise.resolve(userCount);
    },
  };
  return stub as unknown as Parameters<typeof countUsers>[0];
}

describe('countUsers (check-users-empty)', () => {
  it('returns 0 for an empty users table (first-boot seed trigger)', async () => {
    const result = await countUsers(dbStub(0));
    expect(result).toBe(0);
  });

  it('returns the row count for a populated users table (seed skipped)', async () => {
    const result = await countUsers(dbStub(42));
    expect(result).toBe(42);
  });

  it('resolves to a number (the entrypoint compares it as a shell string)', async () => {
    const result = await countUsers(dbStub(1));
    expect(typeof result).toBe('number');
    expect(Number.isInteger(result)).toBe(true);
  });
});
