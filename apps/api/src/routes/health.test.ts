import '../test-setup.ts';
import { afterEach, describe, expect, it } from 'vitest';
import { reloadConfig } from '../config/env.ts';
import type { CacheProvider } from '../utils/cache/index.ts';
import { InMemoryCacheProvider, NullCacheProvider } from '../utils/cache/index.ts';
import { setCacheProvider } from '../utils/cache/singleton.ts';
import type { RateLimitBackend } from '../utils/rate-limit/backend.ts';
import { resetRateLimitBackend, setRateLimitBackend } from '../utils/rate-limit/registry.ts';
import health from './health.ts';

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

describe('Health routes (DB integration)', () => {
  afterEach(() => {
    setCacheProvider(new InMemoryCacheProvider());
    resetRateLimitBackend();
  });

  it('GET /health returns ok', async () => {
    const res = await health.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('GET /ready reports memory for the memory cache and limiter store', async () => {
    setCacheProvider(new InMemoryCacheProvider());
    resetRateLimitBackend();
    const res = await health.request('/ready');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'ready',
      db: 'connected',
      cache: 'memory',
      rateLimitStore: 'memory',
    });
  });

  it('GET /ready stays 200 while the cache and limiter store are degraded', async () => {
    setCacheProvider(degradedCache());
    setRateLimitBackend(degradedBackend());
    const res = await health.request('/ready');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ready');
    expect(body.cache).toBe('degraded');
    expect(body.rateLimitStore).toBe('degraded');
  });

  it('GET /ready reports disabled for a disabled cache and limiter', async () => {
    const original = process.env.RATE_LIMIT_ENABLED;
    try {
      process.env.RATE_LIMIT_ENABLED = 'false';
      reloadConfig();
      setCacheProvider(new NullCacheProvider());
      const res = await health.request('/ready');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cache).toBe('disabled');
      expect(body.rateLimitStore).toBe('disabled');
    } finally {
      if (original === undefined) delete process.env.RATE_LIMIT_ENABLED;
      else process.env.RATE_LIMIT_ENABLED = original;
      reloadConfig();
    }
  });
});
