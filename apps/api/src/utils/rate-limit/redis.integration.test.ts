/**
 * Valkey integration suite for the redis rate-limit backend (opt-in).
 *
 * Runs only when `REDIS_TEST_URL` is set; `make test-api` skips it. Against
 * the compose Valkey (`docker compose up -d valkey`), run from the repo root:
 *
 *   docker compose run --rm -e REDIS_TEST_URL=redis://:dev-valkey-password@valkey:6379 \
 *     app pnpm --filter @brewform/api exec vitest run src/utils/rate-limit/redis.integration.test.ts
 *
 * i.e. `REDIS_TEST_URL=redis://:dev-valkey-password@valkey:6379`. It checks
 * atomicity under concurrency, a budget shared by two processes (two clients),
 * fail-soft against a closed port, and that every shared-store key has a TTL.
 * ioredis 6 speaks RESP3 by default; `RateLimiterRedis`'s Lua reply
 * (`{consumed, ttl}`) and its `MULTI GET/PTTL` replies parse identically under
 * RESP3, so no `protocol: 2` override is needed (verified by this suite).
 */
import '../../test-setup.ts';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { RateLimiterRes } from 'rate-limiter-flexible';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRedisClient } from '../redis/client.ts';
import { createRedisBackend, log, type RateLimitBackend, REDIS_KEY_ROOT } from './backend.ts';
import type { RateLimitPolicy } from './policies.ts';

const url = process.env.REDIS_TEST_URL;

/**
 * A uniquely named test policy, so runs never collide with leftover keys.
 *
 * @param points - Allowed points per window.
 * @param durationSec - Window length in seconds.
 */
function uniquePolicy(points: number, durationSec: number): RateLimitPolicy {
  return {
    id: `it-${randomUUID().slice(0, 8)}`,
    dimension: 'ip',
    points,
    durationSec,
    mode: 'count',
    message: 'Too many requests',
  };
}

/**
 * Resolve once the client is ready.
 *
 * @param client - An ioredis client.
 */
async function ready(client: Redis): Promise<void> {
  if (client.status === 'ready') return;
  await new Promise<void>((resolve) => client.once('ready', () => resolve()));
}

/**
 * Consume one point and report whether it was admitted.
 *
 * @param backend - The backend under test.
 * @param policy - The policy to consume.
 * @param key - The counter key.
 */
async function tryConsume(
  backend: RateLimitBackend,
  policy: RateLimitPolicy,
  key: string,
): Promise<boolean> {
  try {
    await backend.limiter(policy).consume(key);
    return true;
  } catch (err) {
    if (err instanceof RateLimiterRes) return false;
    throw err;
  }
}

describe.skipIf(!url)('redis rate-limit backend against Valkey', () => {
  let clientA: Redis;
  let clientB: Redis;
  let backendA: RateLimitBackend;
  let backendB: RateLimitBackend;
  const createdPrefixes: string[] = [];

  beforeAll(async () => {
    clientA = createRedisClient(url as string, { connectionName: 'brewform-rl-test-a' });
    clientB = createRedisClient(url as string, { connectionName: 'brewform-rl-test-b' });
    await Promise.all([ready(clientA), ready(clientB)]);
    backendA = createRedisBackend(clientA);
    backendB = createRedisBackend(clientB);
  });

  afterAll(async () => {
    for (const prefix of createdPrefixes) {
      const keys = await clientA.keys(`${prefix}*`);
      if (keys.length > 0) await clientA.del(...keys);
    }
    await backendA.close();
    await backendB.close();
  });

  it('admits exactly 10 of 50 concurrent checks against a limit of 10', async () => {
    const policy = uniquePolicy(10, 60);
    createdPrefixes.push(`${REDIS_KEY_ROOT}${policy.id}:`);
    const results = await Promise.all(
      Array.from({ length: 50 }, () => tryConsume(backendA, policy, 'burst')),
    );
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(backendA.status()).toBe('ok');
  });

  it('shares one budget between two backends on separate clients', async () => {
    const policy = uniquePolicy(10, 60);
    createdPrefixes.push(`${REDIS_KEY_ROOT}${policy.id}:`);
    const results: boolean[] = [];
    for (let i = 0; i < 11; i++) {
      results.push(await tryConsume(i % 2 === 0 ? backendA : backendB, policy, 'shared'));
    }
    expect(results.slice(0, 10).every(Boolean)).toBe(true);
    expect(results[10]).toBe(false);
  });

  it('keeps a TTL of at most the window on every shared-store key', async () => {
    const policy = uniquePolicy(5, 15 * 60);
    createdPrefixes.push(`${REDIS_KEY_ROOT}${policy.id}:`);
    await backendA.limiter(policy).consume('ttl-key');
    const pttl = await clientA.pttl(`${REDIS_KEY_ROOT}${policy.id}:ttl-key`);
    expect(pttl).toBeGreaterThan(0);
    expect(pttl).toBeLessThanOrEqual(900_000);
  });

  it('answers every check within 1 s through insurance when the store is unreachable', async () => {
    vi.spyOn(log, 'warn').mockImplementation(() => undefined);
    const dead = createRedisClient('redis://127.0.0.1:1', { connectionName: 'brewform-rl-dead' });
    const backend = createRedisBackend(dead);
    const policy = uniquePolicy(3, 60);
    try {
      const results: boolean[] = [];
      for (let i = 0; i < 5; i++) {
        const started = Date.now();
        results.push(await tryConsume(backend, policy, 'dead'));
        expect(Date.now() - started).toBeLessThan(1000);
      }
      expect(results).toEqual([true, true, true, false, false]);
      expect(backend.status()).toBe('degraded');
    } finally {
      await backend.close();
      vi.restoreAllMocks();
    }
  });
});
