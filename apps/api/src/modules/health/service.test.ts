import '../../test-setup.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadConfig } from '../../config/env.ts';
import type { CacheProvider } from '../../utils/cache/index.ts';
import { InMemoryCacheProvider, NullCacheProvider } from '../../utils/cache/index.ts';
import { setCacheProvider } from '../../utils/cache/singleton.ts';
import type { RateLimitBackend } from '../../utils/rate-limit/backend.ts';
import { resetRateLimitBackend, setRateLimitBackend } from '../../utils/rate-limit/registry.ts';
import {
  defaultHealthDeps,
  getLiveness,
  getReadiness,
  type HealthDeps,
  READINESS_DB_TIMEOUT_MS,
  resetReadinessStateForTests,
} from './service.ts';

/** Build readiness deps for a healthy memory-backed setup; every function is a spy. */
function healthyDeps(overrides: Partial<HealthDeps> = {}) {
  return {
    ping: vi.fn(async () => {}),
    getCacheStatus: vi.fn(() => 'memory' as const),
    getRateLimitStoreStatus: vi.fn(() => 'memory' as const),
    checkStorageHealth: vi.fn(async () => 'ok' as const),
    isShuttingDown: vi.fn(() => false),
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
    ...overrides,
  };
}

/** A promise that never settles (a hung database). */
function never(): Promise<never> {
  return new Promise<never>(() => {});
}

beforeEach(() => {
  resetReadinessStateForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getLiveness', () => {
  it('returns { status: "ok" } without any dependency', () => {
    expect(getLiveness()).toEqual({ status: 'ok' });
  });
});

describe('getReadiness', () => {
  it('returns 200 and the exact body for a healthy setup', async () => {
    const deps = healthyDeps();
    expect(await getReadiness(deps)).toEqual({
      httpStatus: 200,
      body: {
        status: 'ready',
        db: 'connected',
        cache: 'memory',
        rateLimitStore: 'memory',
        storage: 'ok',
        shuttingDown: false,
      },
    });
    expect(deps.ping).toHaveBeenCalledOnce();
  });

  it('returns 503 with db disconnected when the ping rejects', async () => {
    const deps = healthyDeps({ ping: vi.fn(async () => Promise.reject(new Error('down'))) });
    const result = await getReadiness(deps);
    expect(result.httpStatus).toBe(503);
    expect(result.body).toMatchObject({ status: 'not_ready', db: 'disconnected' });
  });

  it('returns 503 after 2000 ms when the ping never settles', async () => {
    vi.useFakeTimers();
    const deps = healthyDeps({ ping: vi.fn(never) });
    let settled = false;
    const pending = getReadiness(deps).then((r) => {
      settled = true;
      return r;
    });

    await vi.advanceTimersByTimeAsync(READINESS_DB_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(READINESS_DB_TIMEOUT_MS).toBe(2000);
    expect(result.httpStatus).toBe(503);
    expect(result.body).toMatchObject({ status: 'not_ready', db: 'disconnected' });
  });

  it('shares one in-flight ping between ten concurrent calls', async () => {
    vi.useFakeTimers();
    const deps = healthyDeps({ ping: vi.fn(never) });
    const calls = Array.from({ length: 10 }, () => getReadiness(deps));
    await vi.advanceTimersByTimeAsync(READINESS_DB_TIMEOUT_MS);
    const results = await Promise.all(calls);
    expect(deps.ping).toHaveBeenCalledOnce();
    expect(results.every((r) => r.httpStatus === 503)).toBe(true);
  });

  it('starts a new ping once the previous one settled', async () => {
    const deps = healthyDeps();
    await getReadiness(deps);
    await getReadiness(deps);
    expect(deps.ping).toHaveBeenCalledTimes(2);
  });

  it('returns 503 with db skipped and never pings while shutting down', async () => {
    const deps = healthyDeps({ isShuttingDown: vi.fn(() => true) });
    const result = await getReadiness(deps);
    expect(result.httpStatus).toBe(503);
    expect(result.body).toMatchObject({ status: 'not_ready', db: 'skipped', shuttingDown: true });
    expect(deps.ping).not.toHaveBeenCalled();
  });

  it('stays 200 while the cache and rate-limit store are degraded', async () => {
    const deps = healthyDeps({
      getCacheStatus: vi.fn(() => 'degraded' as const),
      getRateLimitStoreStatus: vi.fn(() => 'degraded' as const),
    });
    const result = await getReadiness(deps);
    expect(result.httpStatus).toBe(200);
    expect(result.body).toMatchObject({
      status: 'ready',
      cache: 'degraded',
      rateLimitStore: 'degraded',
    });
  });

  it('reports ok and disabled cache and rate-limit store values as given', async () => {
    const deps = healthyDeps({
      getCacheStatus: vi.fn(() => 'disabled' as const),
      getRateLimitStoreStatus: vi.fn(() => 'ok' as const),
    });
    const result = await getReadiness(deps);
    expect(result.httpStatus).toBe(200);
    expect(result.body).toMatchObject({ cache: 'disabled', rateLimitStore: 'ok' });
  });

  it.each(['ok', 'ephemeral', 'degraded', 's3'] as const)(
    'passes storage %s through without changing the status code',
    async (storage) => {
      const deps = healthyDeps({ checkStorageHealth: vi.fn(async () => storage) });
      const result = await getReadiness(deps);
      expect(result.httpStatus).toBe(200);
      expect(result.body.storage).toBe(storage);
    },
  );

  it('logs one warn on ready→not_ready, one info on recovery and nothing above debug otherwise', async () => {
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const up = healthyDeps({ log });
    const down = healthyDeps({ log, ping: vi.fn(async () => Promise.reject(new Error('down'))) });

    await getReadiness(up);
    await getReadiness(up);
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();

    await getReadiness(down);
    await getReadiness(down);
    await getReadiness(down);
    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.warn.mock.calls[0][0]).toEqual({ db: 'disconnected', shuttingDown: false });
    expect(log.info).not.toHaveBeenCalled();

    await getReadiness(up);
    await getReadiness(up);
    expect(log.info).toHaveBeenCalledOnce();
    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.debug).toHaveBeenCalled();
  });

  it('logs the shutdown transition once with db skipped', async () => {
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };
    await getReadiness(healthyDeps({ log }));
    const stopping = healthyDeps({ log, isShuttingDown: vi.fn(() => true) });
    await getReadiness(stopping);
    await getReadiness(stopping);
    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.warn.mock.calls[0][0]).toEqual({ db: 'skipped', shuttingDown: true });
  });
});

/** A cache provider double that reports a degraded shared backend. */
function degradedCache(): CacheProvider {
  return {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve(),
    delete: () => Promise.resolve(),
    deleteByPrefix: () => Promise.resolve(),
    status: () => 'degraded',
  };
}

/** A rate-limit backend double that reports a degraded store. */
function degradedBackend(): RateLimitBackend {
  return {
    kind: 'redis',
    limiter: () => {
      throw new Error('not used');
    },
    status: () => 'degraded',
    close: () => Promise.resolve(),
  };
}

// The real cache and rate-limit registries behind `defaultHealthDeps` (the
// `memory`/`degraded`/`disabled` cases of task 6.36, carried over from the deleted
// routes/health.test.ts). Only the database ping is stubbed.
describe('defaultHealthDeps wiring', () => {
  /** Default deps with a passing ping and a silent logger. */
  function wiredDeps(): HealthDeps {
    return {
      ...defaultHealthDeps,
      ping: async () => {},
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
    };
  }

  afterEach(() => {
    setCacheProvider(new InMemoryCacheProvider());
    resetRateLimitBackend();
  });

  it('reports memory for the in-memory cache and limiter store', async () => {
    setCacheProvider(new InMemoryCacheProvider());
    resetRateLimitBackend();
    const result = await getReadiness(wiredDeps());
    expect(result.httpStatus).toBe(200);
    expect(result.body).toMatchObject({
      status: 'ready',
      db: 'connected',
      cache: 'memory',
      rateLimitStore: 'memory',
      shuttingDown: false,
    });
  });

  it('stays 200 while the cache and limiter store are degraded', async () => {
    setCacheProvider(degradedCache());
    setRateLimitBackend(degradedBackend());
    const result = await getReadiness(wiredDeps());
    expect(result.httpStatus).toBe(200);
    expect(result.body).toMatchObject({
      status: 'ready',
      cache: 'degraded',
      rateLimitStore: 'degraded',
    });
  });

  it('reports disabled for a disabled cache and limiter', async () => {
    const original = process.env.RATE_LIMIT_ENABLED;
    try {
      process.env.RATE_LIMIT_ENABLED = 'false';
      reloadConfig();
      setCacheProvider(new NullCacheProvider());
      const result = await getReadiness(wiredDeps());
      expect(result.httpStatus).toBe(200);
      expect(result.body).toMatchObject({ cache: 'disabled', rateLimitStore: 'disabled' });
    } finally {
      if (original === undefined) delete process.env.RATE_LIMIT_ENABLED;
      else process.env.RATE_LIMIT_ENABLED = original;
      reloadConfig();
    }
  });

  it('pings the real database through pingDatabase', async () => {
    const result = await getReadiness({
      ...defaultHealthDeps,
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
    });
    expect(result.body.db).toBe('connected');
    expect(result.httpStatus).toBe(200);
  });
});
