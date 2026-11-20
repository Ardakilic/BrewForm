import './test-setup.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadConfig } from './config/env.ts';
import { app, skipGlobalRateLimit } from './main.ts';
import { log as rateLimitLog } from './middleware/rateLimit.ts';
import { InMemoryCacheProvider, NullCacheProvider } from './utils/cache/index.ts';
import { setCacheProvider } from './utils/cache/singleton.ts';
import { peerEnv } from './utils/client-ip/test-helpers.ts';
import { resetRateLimitBackend } from './utils/rate-limit/registry.ts';

/**
 * Wiring test for the global limiter in `main.ts` (api-rate-limiting: "Health
 * probes and local uploads bypass the global limiter", "Limiter still works
 * with caching disabled"). The middleware unit cases live in
 * `middleware/rateLimit.test.ts`.
 */
describe('main app rate-limit wiring', () => {
  beforeEach(() => {
    resetRateLimitBackend();
    vi.spyOn(rateLimitLog, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    setCacheProvider(new InMemoryCacheProvider());
    vi.restoreAllMocks();
  });

  /**
   * Send `n` GETs to `path` from one simulated peer and return the statuses.
   *
   * @param path - Request path.
   * @param n - Number of requests.
   * @param ip - The simulated TCP peer.
   */
  async function statuses(path: string, n: number, ip: string): Promise<number[]> {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push((await app.request(path, {}, peerEnv(ip))).status);
    return out;
  }

  it('never answers 429 to 150 GET /health requests', async () => {
    const result = await statuses('/health', 150, '203.0.113.10');
    expect(result.every((s) => s === 200)).toBe(true);
  });

  it('does not count 150 GET /uploads/* requests against the global limit', async () => {
    const result = await statuses('/uploads/missing-file.webp', 150, '203.0.113.11');
    expect(result).not.toContain(429);
    // The global budget of this peer is untouched afterwards.
    const [api] = await statuses('/api/v1/auth/registration-status', 1, '203.0.113.11');
    expect(api).toBe(200);
  });

  it('answers 429 to the 101st API request from one peer', async () => {
    const result = await statuses('/api/v1/auth/registration-status', 101, '203.0.113.12');
    expect(result.slice(0, 100).every((s) => s === 200)).toBe(true);
    expect(result[100]).toBe(429);
  });

  it('keeps the same limit with the cache disabled', async () => {
    const original = process.env.CACHE_ENABLED;
    try {
      process.env.CACHE_ENABLED = 'false';
      reloadConfig();
      setCacheProvider(new NullCacheProvider());
      const result = await statuses('/api/v1/auth/registration-status', 101, '203.0.113.13');
      expect(result.slice(0, 100).every((s) => s === 200)).toBe(true);
      expect(result[100]).toBe(429);
    } finally {
      if (original === undefined) delete process.env.CACHE_ENABLED;
      else process.env.CACHE_ENABLED = original;
      reloadConfig();
    }
  });

  it('skips /health, /ready and GET/HEAD /uploads/* only', () => {
    /**
     * Minimal context stand-in for the skip predicate.
     *
     * @param method - HTTP method.
     * @param path - Request path.
     */
    const ctx = (method: string, path: string) =>
      ({ req: { method, path } }) as unknown as Parameters<typeof skipGlobalRateLimit>[0];
    expect(skipGlobalRateLimit(ctx('GET', '/health'))).toBe(true);
    expect(skipGlobalRateLimit(ctx('GET', '/ready'))).toBe(true);
    expect(skipGlobalRateLimit(ctx('GET', '/uploads/a/b.webp'))).toBe(true);
    expect(skipGlobalRateLimit(ctx('HEAD', '/uploads/a.webp'))).toBe(true);
    expect(skipGlobalRateLimit(ctx('POST', '/uploads/a.webp'))).toBe(false);
    expect(skipGlobalRateLimit(ctx('GET', '/api/v1/recipes'))).toBe(false);
    expect(skipGlobalRateLimit(ctx('GET', '/healthz'))).toBe(false);
  });
});
