import '../../test-setup.ts';
import { EventEmitter } from 'node:events';
import { RateLimiterRes } from 'rate-limiter-flexible';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryBackend,
  createRedisBackend,
  log,
  type RedisLimiterClient,
} from './backend.ts';
import type { RateLimitPolicy } from './policies.ts';

/**
 * Build a test policy.
 *
 * @param id - Policy id (key namespace).
 * @param points - Allowed points per window.
 * @param durationSec - Window length in seconds.
 */
function testPolicy(id: string, points: number, durationSec = 60): RateLimitPolicy {
  return { id, dimension: 'ip', points, durationSec, mode: 'count', message: 'Too many requests' };
}

/**
 * Consume `n` points one by one and count how many were admitted.
 *
 * @param consume - The consume call under test.
 * @param n - Number of attempts.
 */
async function admitted(consume: () => Promise<unknown>, n: number): Promise<number> {
  let ok = 0;
  for (let i = 0; i < n; i++) {
    try {
      await consume();
      ok += 1;
    } catch (err) {
      if (!(err instanceof RateLimiterRes)) throw err;
    }
  }
  return ok;
}

/**
 * A fake ioredis client whose every command rejects and whose status is
 * `end` (a dead server). It is an EventEmitter so tests can emit `ready`.
 */
function createDeadClient() {
  const fail = () => Promise.reject(new Error('Connection is closed.'));
  const chain: Record<string, unknown> = {};
  for (const name of ['get', 'pttl', 'set', 'incrby']) chain[name] = () => chain;
  chain.exec = fail;
  const client = Object.assign(new EventEmitter(), {
    status: 'end',
    defineCommand: vi.fn(),
    rlflxIncr: vi.fn<(...args: unknown[]) => Promise<unknown>>(fail),
    multi: () => chain,
    del: vi.fn(fail),
    disconnect: vi.fn(),
  });
  return client;
}

describe('createMemoryBackend', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('admits exactly `points` per key per window', async () => {
    const backend = createMemoryBackend();
    const limiter = backend.limiter(testPolicy('mem-a', 3));
    expect(await admitted(() => limiter.consume('k1'), 10)).toBe(3);
    expect(await admitted(() => limiter.consume('k2'), 10)).toBe(3);
  });

  it('isolates keys per policy and memoises one limiter per policy id', async () => {
    const backend = createMemoryBackend();
    const a = backend.limiter(testPolicy('mem-a', 2));
    const b = backend.limiter(testPolicy('mem-b', 2));
    expect(backend.limiter(testPolicy('mem-a', 2))).toBe(a);
    expect(a.keyPrefix).toBe('mem-a');
    expect(await admitted(() => a.consume('same'), 5)).toBe(2);
    expect(await admitted(() => b.consume('same'), 5)).toBe(2);
  });

  it('drops counters when their window ends (bounded memory)', async () => {
    vi.useFakeTimers();
    const backend = createMemoryBackend();
    const limiter = backend.limiter(testPolicy('mem-bounded', 5, 60));
    const keys = Array.from({ length: 1000 }, (_, i) => `key-${i}`);
    for (const key of keys) await limiter.consume(key);
    expect(await limiter.get('key-0')).not.toBeNull();

    vi.advanceTimersByTime(61_000);

    for (const key of keys) expect(await limiter.get(key)).toBeNull();
    const fresh = await limiter.consume('key-0');
    expect(fresh.consumedPoints).toBe(1);
    expect(fresh.remainingPoints).toBe(4);
  });

  it('reports the memory status and closes cleanly', async () => {
    const backend = createMemoryBackend();
    expect(backend.status()).toBe('memory');
    await expect(backend.close()).resolves.toBeUndefined();
  });
});

describe('createRedisBackend', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefixes keys under brewform-rl:<policy-id>', () => {
    const backend = createRedisBackend(createDeadClient() as unknown as RedisLimiterClient);
    expect(backend.limiter(testPolicy('redis-prefix', 3)).keyPrefix).toBe(
      'brewform-rl:redis-prefix',
    );
  });

  it('keeps enforcing limits through the insurance limiter while the store is down', async () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
    const info = vi.spyOn(log, 'info').mockImplementation(() => undefined);
    const client = createDeadClient();
    const backend = createRedisBackend(client as unknown as RedisLimiterClient);
    const limiter = backend.limiter(testPolicy('redis-down', 3));

    expect(backend.status()).toBe('ok');
    expect(await admitted(() => limiter.consume('k'), 50)).toBe(3);

    expect(backend.status()).toBe('degraded');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toEqual({ store: 'redis', err: expect.any(Error) });

    client.status = 'ready';
    client.emit('ready');
    expect(backend.status()).toBe('ok');
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toEqual({ store: 'redis', fallbackDecisions: 50 });

    // A second ready without an outage logs nothing new.
    client.emit('ready');
    expect(info).toHaveBeenCalledTimes(1);
  });

  it('leaves degraded mode on the next successful store call while the connection stays up', async () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
    const info = vi.spyOn(log, 'info').mockImplementation(() => undefined);
    const client = createDeadClient();
    client.status = 'ready';
    client.rlflxIncr.mockImplementation(() => Promise.reject(new Error('Command timed out')));
    const backend = createRedisBackend(client as unknown as RedisLimiterClient);
    const limiter = backend.limiter(testPolicy('redis-live', 10));

    // 1. A command timeout on a live connection: degraded, one warn.
    await limiter.consume('k');
    expect(backend.status()).toBe('degraded');
    expect(warn).toHaveBeenCalledTimes(1);

    // 2. The store answers again: ok, one recovery info with the fallback count.
    client.rlflxIncr.mockResolvedValue([1, 60000]);
    await limiter.consume('k');
    expect(backend.status()).toBe('ok');
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toEqual({ store: 'redis', fallbackDecisions: 1 });

    // 3. A later failure starts a new outage with its own warn.
    client.rlflxIncr.mockImplementation(() => Promise.reject(new Error('Command timed out')));
    await limiter.consume('k');
    expect(backend.status()).toBe('degraded');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('enters degraded mode on a client error event, once per outage', () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
    const client = createDeadClient();
    const backend = createRedisBackend(client as unknown as RedisLimiterClient);
    client.emit('error', new Error('connect ECONNREFUSED'));
    client.emit('error', new Error('connect ECONNREFUSED'));
    expect(backend.status()).toBe('degraded');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('disconnects the client on close', async () => {
    const client = createDeadClient();
    const backend = createRedisBackend(client as unknown as RedisLimiterClient);
    await backend.close();
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });
});
