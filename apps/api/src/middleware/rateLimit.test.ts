import '../test-setup.ts';
import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadConfig } from '../config/env.ts';
import { InMemoryCacheProvider, NullCacheProvider } from '../utils/cache/index.ts';
import { setCacheProvider } from '../utils/cache/singleton.ts';
import { log as clientIpLog } from '../utils/client-ip/index.ts';
import { peerEnv } from '../utils/client-ip/test-helpers.ts';
import type { RateLimitBackend } from '../utils/rate-limit/backend.ts';
import { POLICIES, type RateLimitPolicy } from '../utils/rate-limit/policies.ts';
import {
  getRateLimitBackend,
  resetRateLimitBackend,
  setRateLimitBackend,
} from '../utils/rate-limit/registry.ts';
import { emailKey, log, rateLimit, rateLimitFailures } from './rateLimit.ts';

const PEER = '203.0.113.50';

/**
 * A small counting policy for focused cases.
 *
 * @param points - Allowed requests per window.
 * @param mode - Counting mode.
 */
function smallPolicy(points: number, mode: RateLimitPolicy['mode'] = 'count'): RateLimitPolicy {
  return {
    id: `test-${mode}-${points}`,
    dimension: 'ip',
    points,
    durationSec: 60,
    mode,
    message: 'Too many test requests, please try again later',
  };
}

/** Spy on every level of the middleware logger (and silence the client-IP hint). */
function spyLogs() {
  vi.spyOn(clientIpLog, 'warn').mockImplementation(() => undefined);
  return {
    debug: vi.spyOn(log, 'debug'),
    info: vi.spyOn(log, 'info'),
    warn: vi.spyOn(log, 'warn'),
    error: vi.spyOn(log, 'error'),
  };
}

/**
 * App with a requestId middleware, optional extra middleware (e.g. a fake
 * auth step) and the middleware under test in front of `GET|POST /t`.
 */
function buildApp(...middleware: Parameters<Hono['use']>[1][]) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('requestId' as never, 'req-test-1' as never);
    await next();
  });
  for (const mw of middleware) app.use('/t', mw);
  app.all('/t', (c) => c.json({ ok: true }));
  return app;
}

/**
 * Send `n` requests from one peer and return the responses.
 *
 * @param app - The app under test.
 * @param n - Number of requests.
 * @param init - Request init (method, headers).
 */
async function hit(app: Hono, n: number, init: RequestInit = {}, ip = PEER) {
  const responses: Response[] = [];
  for (let i = 0; i < n; i++) responses.push(await app.request('/t', init, peerEnv(ip)));
  return responses;
}

describe('Rate Limit Middleware', () => {
  beforeEach(() => {
    resetRateLimitBackend();
    setCacheProvider(new InMemoryCacheProvider());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rateLimit', () => {
    it('answers over-limit requests with the 429 envelope, the policy message and Retry-After', async () => {
      spyLogs();
      const policy = smallPolicy(2);
      const responses = await hit(buildApp(rateLimit(policy)), 3);
      expect(responses.map((r) => r.status)).toEqual([200, 200, 429]);
      const res = responses[2];
      expect(await res.json()).toEqual({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many test requests, please try again later',
          requestId: 'req-test-1',
        },
      });
      const retryAfter = Number(res.headers.get('Retry-After'));
      expect(retryAfter).toBeGreaterThanOrEqual(1);
      expect(retryAfter).toBeLessThanOrEqual(60);
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    });

    it('appends RateLimit / RateLimit-Policy items for stacked policies, X-RateLimit-Limit from the last', async () => {
      const app = buildApp(rateLimit(POLICIES.global), rateLimit(POLICIES.contactIp));
      const [res] = await hit(app, 1, { method: 'POST' });
      expect(res.status).toBe(200);
      const policyHeader = res.headers.get('RateLimit-Policy') ?? '';
      expect(policyHeader).toContain('"global";q=100;w=60');
      expect(policyHeader).toContain('"contact-ip";q=3;w=900');
      const rateLimitHeader = res.headers.get('RateLimit') ?? '';
      expect(rateLimitHeader).toContain('"global";r=99;t=');
      expect(rateLimitHeader).toContain('"contact-ip";r=2;t=');
      expect(res.headers.get('X-RateLimit-Limit')).toBe('3');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('2');
      expect(Number(res.headers.get('X-RateLimit-Reset'))).toBeGreaterThan(Date.now() / 1000);
    });

    it('is a pass-through with no headers when RATE_LIMIT_ENABLED=false', async () => {
      const original = process.env.RATE_LIMIT_ENABLED;
      try {
        process.env.RATE_LIMIT_ENABLED = 'false';
        reloadConfig();
        const responses = await hit(buildApp(rateLimit(smallPolicy(2))), 200);
        expect(responses.every((r) => r.status === 200)).toBe(true);
        for (const name of [
          'RateLimit',
          'RateLimit-Policy',
          'X-RateLimit-Limit',
          'X-RateLimit-Remaining',
          'X-RateLimit-Reset',
        ]) {
          expect(responses[199].headers.get(name)).toBeNull();
        }
      } finally {
        if (original === undefined) delete process.env.RATE_LIMIT_ENABLED;
        else process.env.RATE_LIMIT_ENABLED = original;
        reloadConfig();
      }
    });

    it('keeps limiting with the null cache provider (the cache is not the store)', async () => {
      spyLogs();
      setCacheProvider(new NullCacheProvider());
      const responses = await hit(buildApp(rateLimit(smallPolicy(2))), 3);
      expect(responses.map((r) => r.status)).toEqual([200, 200, 429]);
    });

    it('does not create new buckets for random X-Forwarded-For values from one peer', async () => {
      spyLogs();
      const app = buildApp(rateLimit(smallPolicy(3)));
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) {
        const res = await app.request(
          '/t',
          { headers: { 'x-forwarded-for': `10.${i}.${i}.${i}, test-${crypto.randomUUID()}` } },
          peerEnv(PEER),
        );
        statuses.push(res.status);
      }
      expect(statuses).toEqual([200, 200, 200, 429]);
    });

    it('logs { policy, limit } once when an IP-keyed policy is exceeded', async () => {
      const spies = spyLogs();
      const responses = await hit(buildApp(rateLimit(POLICIES.global)), 101);
      expect(responses[99].status).toBe(200);
      expect(responses[100].status).toBe(429);
      expect(spies.warn).toHaveBeenCalledTimes(1);
      expect(spies.warn).toHaveBeenCalledWith(
        { policy: 'global', limit: 100 },
        'rateLimitMiddleware rate limit exceeded',
      );
    });

    it('logs { policy, limit, userId } once when a user-keyed policy is exceeded', async () => {
      const spies = spyLogs();
      // Stands in for authMiddleware, which sets userId before user-keyed policies.
      const fakeAuth: Parameters<Hono['use']>[1] = async (c, next) => {
        c.set('userId' as never, 'user-123' as never);
        await next();
      };
      const app = buildApp(fakeAuth, rateLimit(POLICIES.commentUser));
      // Different IPs: the user key, not the address, is what is counted.
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const [res] = await hit(app, 1, { method: 'POST' }, `198.51.100.${i + 1}`);
        statuses.push(res.status);
      }
      expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
      expect(spies.warn).toHaveBeenCalledTimes(1);
      expect(spies.warn).toHaveBeenCalledWith(
        { policy: 'comment-user', limit: 5, userId: 'user-123' },
        'rateLimitMiddleware rate limit exceeded',
      );
    });

    it('does not warn while requests stay under the limit', async () => {
      const spies = spyLogs();
      const responses = await hit(buildApp(rateLimit(POLICIES.global)), 10);
      expect(responses.every((r) => r.status === 200)).toBe(true);
      expect(spies.warn).not.toHaveBeenCalled();
    });

    it('skips counting when the skip predicate matches', async () => {
      const app = buildApp(rateLimit(smallPolicy(1), { skip: () => true }));
      const responses = await hit(app, 5);
      expect(responses.every((r) => r.status === 200)).toBe(true);
      expect(responses[0].headers.get('RateLimit')).toBeNull();
    });

    it('fails open, logging { err, policy }, when the limiter throws an Error', async () => {
      const spies = spyLogs();
      const broken: RateLimitBackend = {
        kind: 'redis',
        limiter: () => {
          throw new Error('limiter exploded');
        },
        status: () => 'degraded',
        close: () => Promise.resolve(),
      };
      setRateLimitBackend(broken);
      const [res] = await hit(buildApp(rateLimit(smallPolicy(1))), 1);
      expect(res.status).toBe(200);
      expect(spies.error).toHaveBeenCalledWith(
        { err: expect.any(Error), policy: 'test-count-1' },
        expect.stringContaining('rateLimit limiter failed'),
      );
    });

    it('never puts an IP, email or store key into a log call', async () => {
      const spies = spyLogs();
      const email = 'Alice@Example.com ';
      const hash = emailKey(email);
      const app = buildApp(
        rateLimit(smallPolicy(1)),
        rateLimitFailures(POLICIES.authLoginFailAccount, { key: () => hash }),
      );
      await hit(app, 3);
      const logged = JSON.stringify(
        [spies.debug, spies.info, spies.warn, spies.error].flatMap((s) => s.mock.calls),
      );
      expect(logged).not.toContain(PEER);
      expect(logged).not.toContain('alice@example.com');
      expect(logged).not.toContain(hash);
      expect(logged).not.toMatch(/test-count-1:/);
    });

    it('resolves the backend lazily on every request', async () => {
      const app = buildApp(rateLimit(smallPolicy(1)));
      expect((await hit(app, 2)).map((r) => r.status)).toEqual([200, 429]);
      resetRateLimitBackend();
      expect((await hit(app, 1))[0].status).toBe(200);
    });
  });

  describe('rateLimitFailures', () => {
    /**
     * App whose handler answers with the status given in `x-status`, behind a
     * failure-only policy, counting handler invocations.
     *
     * @param policy - The failure-only policy under test.
     * @param resetOnSuccess - Passed through to `rateLimitFailures`.
     * @param delayMs - How long the handler waits before answering (a slow
     *   password check), so concurrent requests overlap.
     */
    function buildFailureApp(policy: RateLimitPolicy, resetOnSuccess = false, delayMs = 0) {
      const handler = vi.fn();
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('requestId' as never, 'req-test-2' as never);
        await next();
      });
      app.post(
        '/t',
        rateLimitFailures(policy, { key: () => 'acct', resetOnSuccess }),
        async (c) => {
          handler();
          if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
          const status = Number(c.req.header('x-status') ?? '200');
          return c.json({ status }, status as 200);
        },
      );
      return { app, handler };
    }

    /**
     * Send one POST answered with `status`.
     *
     * @param app - The app under test.
     * @param status - The status the handler should return.
     */
    function post(app: Hono, status: number) {
      return app.request(
        '/t',
        { method: 'POST', headers: { 'x-status': String(status) } },
        peerEnv(PEER),
      );
    }

    it('answers 429 before the handler once the failure counter reaches the limit', async () => {
      spyLogs();
      const { app, handler } = buildFailureApp(smallPolicy(3, 'failures'));
      for (let i = 0; i < 3; i++) expect((await post(app, 401)).status).toBe(401);
      const res = await post(app, 200);
      expect(res.status).toBe(429);
      expect(handler).toHaveBeenCalledTimes(3);
      expect(Number(res.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
      expect(res.headers.get('RateLimit-Policy')).toBe('"test-failures-3";q=3;w=60');
      const body = await res.json();
      expect(body.error).toEqual({
        code: 'RATE_LIMITED',
        message: 'Too many test requests, please try again later',
        requestId: 'req-test-2',
      });
    });

    it('lets no more concurrent failures through than the policy allows', async () => {
      spyLogs();
      const { app, handler } = buildFailureApp(smallPolicy(3, 'failures'), false, 10);
      const responses = await Promise.all(Array.from({ length: 10 }, () => post(app, 401)));
      expect(handler).toHaveBeenCalledTimes(3);
      expect(responses.map((r) => r.status).sort()).toEqual([
        401, 401, 401, 429, 429, 429, 429, 429, 429, 429,
      ]);
    });

    it('gives the point back for successes and non-401 failures', async () => {
      const policy = smallPolicy(2, 'failures');
      const { app } = buildFailureApp(policy);
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) statuses.push((await post(app, 200)).status);
      statuses.push((await post(app, 400)).status);
      statuses.push((await post(app, 500)).status);
      expect(statuses).not.toContain(429);
      expect(await getRateLimitBackend().limiter(policy).get('acct')).toMatchObject({
        consumedPoints: 0,
      });
    });

    it('counts only 401 responses as failures', async () => {
      const { app } = buildFailureApp(smallPolicy(2, 'failures'));
      for (const status of [400, 403, 500, 200, 201]) await post(app, status);
      expect((await post(app, 401)).status).toBe(401);
      expect((await post(app, 200)).status).toBe(200);
      expect(
        await getRateLimitBackend().limiter(smallPolicy(2, 'failures')).get('acct'),
      ).toMatchObject({
        consumedPoints: 1,
      });
    });

    it('deletes the counter on a 2xx when resetOnSuccess is set', async () => {
      const policy = smallPolicy(3, 'failures');
      const { app } = buildFailureApp(policy, true);
      await post(app, 401);
      await post(app, 401);
      expect((await post(app, 200)).status).toBe(200);
      expect(await getRateLimitBackend().limiter(policy).get('acct')).toBeNull();
      await post(app, 401);
      await post(app, 401);
      expect((await post(app, 200)).status).toBe(200);
    });

    it('keeps the counter on a 2xx without resetOnSuccess', async () => {
      const policy = smallPolicy(2, 'failures');
      const { app } = buildFailureApp(policy, false);
      spyLogs();
      await post(app, 401);
      await post(app, 200);
      await post(app, 401);
      expect((await post(app, 200)).status).toBe(429);
    });

    it('sets no rate-limit headers unless it answers 429', async () => {
      const { app } = buildFailureApp(smallPolicy(3, 'failures'));
      for (const status of [401, 200]) {
        const res = await post(app, status);
        expect(res.headers.get('RateLimit')).toBeNull();
        expect(res.headers.get('RateLimit-Policy')).toBeNull();
        expect(res.headers.get('X-RateLimit-Limit')).toBeNull();
        expect(res.headers.get('Retry-After')).toBeNull();
      }
    });

    it('fails open when the limiter throws', async () => {
      const spies = spyLogs();
      setRateLimitBackend({
        kind: 'redis',
        limiter: () => {
          throw new Error('limiter exploded');
        },
        status: () => 'degraded',
        close: () => Promise.resolve(),
      });
      const { app, handler } = buildFailureApp(smallPolicy(1, 'failures'));
      expect((await post(app, 401)).status).toBe(401);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(spies.error).toHaveBeenCalledWith(
        { err: expect.any(Error), policy: 'test-failures-1' },
        expect.stringContaining('rateLimitFailures'),
      );
    });
  });

  describe('emailKey', () => {
    it('is the first 32 hex chars of the SHA-256 of the trimmed, lower-cased email', () => {
      const expected = createHash('sha256').update('alice@example.com').digest('hex').slice(0, 32);
      expect(emailKey('Alice@Example.com ')).toBe(expected);
      expect(emailKey(' alice@EXAMPLE.com')).toBe(expected);
      expect(emailKey('Alice@Example.com ')).not.toContain('@');
      expect(emailKey('Alice@Example.com ')).toHaveLength(32);
    });

    it('stores email-keyed counters as <policy-id>:<hash>', async () => {
      const hash = emailKey('Alice@Example.com ');
      const app = buildApp(rateLimit(POLICIES.authForgotAccount, { key: () => hash }));
      await hit(app, 1, { method: 'POST' });
      const limiter = getRateLimitBackend().limiter(POLICIES.authForgotAccount);
      expect(await limiter.get(hash)).not.toBeNull();
      expect(limiter.getKey(hash)).toBe(`auth-forgot-account:${hash}`);
    });
  });
});
