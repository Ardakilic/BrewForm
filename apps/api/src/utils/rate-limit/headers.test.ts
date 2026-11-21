import '../../test-setup.ts';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendRateLimitHeaders, setRetryAfter } from './headers.ts';
import type { RateLimitPolicy } from './policies.ts';

const A: RateLimitPolicy = {
  id: 'global',
  dimension: 'ip',
  points: 100,
  durationSec: 60,
  mode: 'count',
  message: 'Too many requests',
};
const B: RateLimitPolicy = {
  id: 'contact-ip',
  dimension: 'ip',
  points: 3,
  durationSec: 900,
  mode: 'count',
  message: 'Too many contact messages',
};

describe('appendRateLimitHeaders', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * App whose middleware evaluates A then B, and whose handler answers with
   * either `c.json` or a raw `Response`.
   */
  function buildApp(raw: boolean) {
    const app = new Hono();
    app.use('*', async (c, next) => {
      appendRateLimitHeaders(c, A, { remaining: 99, msBeforeNext: 59_500 });
      appendRateLimitHeaders(c, B, { remaining: 2, msBeforeNext: 899_001 });
      await next();
    });
    app.get('/', (c) => (raw ? new Response('raw body') : c.json({ ok: true })));
    return app;
  }

  it('appends one Structured-Field list item per policy and keeps X-RateLimit-* for the last', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T10:00:00.000Z'));
    const res = await buildApp(false).request('/');
    expect(res.headers.get('RateLimit-Policy')).toBe('"global";q=100;w=60, "contact-ip";q=3;w=900');
    expect(res.headers.get('RateLimit')).toBe('"global";r=99;t=60, "contact-ip";r=2;t=900');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('3');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('2');
    const expectedReset = Math.ceil((Date.parse('2026-11-21T10:00:00.000Z') + 899_001) / 1000);
    expect(res.headers.get('X-RateLimit-Reset')).toBe(String(expectedReset));
  });

  it('survives a handler that returns a raw Response', async () => {
    const res = await buildApp(true).request('/');
    expect(await res.text()).toBe('raw body');
    expect(res.headers.get('RateLimit-Policy')).toContain('"contact-ip";q=3;w=900');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('3');
  });
});

describe('setRetryAfter', () => {
  /**
   * Read the Retry-After header produced for `ms`.
   *
   * @param ms - Milliseconds until the window resets.
   */
  async function retryAfterFor(ms: number): Promise<string | null> {
    const app = new Hono();
    app.get('/', (c) => {
      setRetryAfter(c, ms);
      return c.json({ ok: false }, 429);
    });
    const res = await app.request('/');
    return res.headers.get('Retry-After');
  }

  it('uses whole seconds, rounded up, with a minimum of 1', async () => {
    expect(await retryAfterFor(0)).toBe('1');
    expect(await retryAfterFor(-5)).toBe('1');
    expect(await retryAfterFor(1500)).toBe('2');
    expect(await retryAfterFor(120_000)).toBe('120');
  });
});
