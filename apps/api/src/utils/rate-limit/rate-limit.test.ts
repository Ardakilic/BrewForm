/**
 * Rate Limit Utility Tests
 * Tests the Prisma-backed checkRateLimit function directly.
 */

import { afterEach, describe, it } from '@std/testing';
import { expect } from '@std/expect';
import { checkRateLimit } from '@test/rate-limit';
import { resetPrisma, setPrisma } from '../../test/mocks/database.ts';

// ---------------------------------------------------------------------------
// Mock Prisma builder
// ---------------------------------------------------------------------------

interface RateLimitRecord {
  id: string;
  identifier: string;
  action: string;
  count: number;
  windowStart: Date;
  expiresAt: Date;
}

function buildMockPrisma(options: {
  existing?: RateLimitRecord | null;
  updateReturn?: Partial<RateLimitRecord>;
  throwOnTransaction?: boolean;
}) {
  let _stored: RateLimitRecord | null = options.existing ?? null;

  const tx = {
    rateLimit: {
      findUnique: (_args: unknown) => Promise.resolve(_stored),
      create: (args: { data: RateLimitRecord }) => {
        _stored = { ...args.data };
        return Promise.resolve(_stored);
      },
      update: (args: {
        where: { id: string };
        data: {
          count?: number | { increment: number };
          windowStart?: Date;
          expiresAt?: Date;
        };
      }) => {
        if (!_stored) return Promise.resolve(null);
        const newCount = typeof args.data.count === 'object' &&
            'increment' in args.data.count
          ? _stored.count + args.data.count.increment
          : (args.data.count ?? _stored.count);
        _stored = {
          ..._stored,
          count: newCount,
          windowStart: args.data.windowStart ?? _stored.windowStart,
          expiresAt: args.data.expiresAt ?? _stored.expiresAt,
        };
        return Promise.resolve({ ..._stored, ...options.updateReturn });
      },
      delete: (_args: unknown) => {
        _stored = null;
        return Promise.resolve(null);
      },
    },
  };

  return {
    $transaction: options.throwOnTransaction
      ? (_fn: unknown) => Promise.reject(new Error('DB connection error'))
      : (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkRateLimit', () => {
  afterEach(() => {
    resetPrisma();
  });

  it('should allow first request and return correct remaining count', async () => {
    setPrisma(buildMockPrisma({ existing: null }));

    const result = await checkRateLimit('ip:127.0.0.1', 'default', 10, 60000);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });

  it('should allow subsequent request within window and decrement remaining', async () => {
    const windowStart = new Date(Date.now() - 1000); // 1 second ago
    setPrisma(
      buildMockPrisma({
        existing: {
          id: 'record-1',
          identifier: 'ip:127.0.0.1',
          action: 'default',
          count: 5,
          windowStart,
          expiresAt: new Date(Date.now() + 59000),
        },
      }),
    );

    const result = await checkRateLimit('ip:127.0.0.1', 'default', 10, 60000);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4); // 10 - (5 + 1)
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });

  it('should deny request when count equals maxRequests', async () => {
    const windowStart = new Date(Date.now() - 1000);
    setPrisma(
      buildMockPrisma({
        existing: {
          id: 'record-1',
          identifier: 'ip:127.0.0.1',
          action: 'default',
          count: 10,
          windowStart,
          expiresAt: new Date(Date.now() + 59000),
        },
      }),
    );

    const result = await checkRateLimit('ip:127.0.0.1', 'default', 10, 60000);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should deny request when count exceeds maxRequests', async () => {
    const windowStart = new Date(Date.now() - 1000);
    setPrisma(
      buildMockPrisma({
        existing: {
          id: 'record-1',
          identifier: 'ip:127.0.0.1',
          action: 'default',
          count: 15,
          windowStart,
          expiresAt: new Date(Date.now() + 59000),
        },
      }),
    );

    const result = await checkRateLimit('ip:127.0.0.1', 'default', 10, 60000);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should reset window and allow request when window has expired', async () => {
    // windowStart is 2 full windows ago — definitely expired
    const windowStart = new Date(Date.now() - 120000);
    setPrisma(
      buildMockPrisma({
        existing: {
          id: 'record-1',
          identifier: 'ip:127.0.0.1',
          action: 'default',
          count: 10,
          windowStart,
          expiresAt: new Date(Date.now() - 60000),
        },
      }),
    );

    const result = await checkRateLimit('ip:127.0.0.1', 'default', 10, 60000);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9); // fresh window: 10 - 1
    // resetAt must be in the future (new window)
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });

  it('should return resetAt anchored to window start, not now', async () => {
    const windowStart = new Date(Date.now() - 5000); // window started 5s ago
    const windowMs = 60000;
    const expectedResetAt = windowStart.getTime() + windowMs;

    setPrisma(
      buildMockPrisma({
        existing: {
          id: 'record-1',
          identifier: 'ip:127.0.0.1',
          action: 'default',
          count: 3,
          windowStart,
          expiresAt: new Date(windowStart.getTime() + windowMs),
        },
      }),
    );

    const result = await checkRateLimit(
      'ip:127.0.0.1',
      'default',
      10,
      windowMs,
    );

    expect(result.allowed).toBe(true);
    // resetAt should be based on the original windowStart, not the current time
    expect(result.resetAt).toBe(expectedResetAt);
  });

  it('should fail closed (deny) on database error', async () => {
    setPrisma(buildMockPrisma({ throwOnTransaction: true }));

    const result = await checkRateLimit('ip:127.0.0.1', 'default', 10, 60000);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should pass custom action and maxRequests to the limiter', async () => {
    setPrisma(buildMockPrisma({ existing: null }));

    const result = await checkRateLimit('ip:127.0.0.1', 'auth', 5, 15 * 60000);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4); // 5 - 1
  });
});
