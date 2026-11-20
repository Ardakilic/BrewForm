import '../../test-setup.ts';
import { db } from '@brewform/db';
import { reports } from '@brewform/db/schema';
import { inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadConfig } from '../../config/env.ts';
import { log as rateLimitLog } from '../../middleware/rateLimit.ts';
import type { AppEnv } from '../../types/hono.ts';
import { NullCacheProvider } from '../../utils/cache/index.ts';
import { setCacheProvider } from '../../utils/cache/singleton.ts';
import { log as clientIpLog } from '../../utils/client-ip/index.ts';
import { peerEnv, uniqueTestIp } from '../../utils/client-ip/test-helpers.ts';
import { resetRateLimitBackend } from '../../utils/rate-limit/registry.ts';
import contact from '../contact/index.ts';
import {
  bearer,
  type FixtureRecipe,
  type FixtureUser,
  NoteFixtures,
} from '../recipe-note/test-helpers.ts';
import report from './index.ts';

/**
 * Rate-limit route tests for `POST /api/v1/reports` (report-rate-limit spec).
 *
 * The IP-keyed `report-ip` policy is the FIRST middleware in the POST chain
 * (before `authMiddleware` and `zValidator`), so the 429 fires regardless of
 * body or auth validity: unauthenticated POSTs exhaust it. The user-keyed
 * `report-user` policy runs right after `authMiddleware` and is covered with a
 * seeded user and a signed token (DB-backed). Each simulated client is a
 * distinct TCP peer (`peerEnv`), never an `X-Forwarded-For` value, and limiter
 * state is reset per test with `resetRateLimitBackend()`.
 *
 * Admin GET/PATCH routes on the same router are NOT throttled by either
 * report policy (they are applied to POST only, not via `report.use('*', ...)`).
 */

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
  });
  app.route('/api/v1/reports', report);
  app.route('/api/v1/contact', contact);
  return app;
}

/** A `ReportCreateSchema`-shaped body. */
function reportBody(recipeId: string = crypto.randomUUID()) {
  return { recipeId, reason: 'spam', type: 'spam' };
}

/**
 * POST a report from the simulated client `ip`.
 *
 * @param app - The test app.
 * @param ip - The simulated TCP peer.
 * @param headers - Extra headers (auth, forwarding).
 * @param body - The request body.
 */
function postReport(
  app: Hono<AppEnv>,
  ip: string,
  headers: Record<string, string> = {},
  body: unknown = reportBody(),
) {
  return app.request(
    '/api/v1/reports',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
    peerEnv(ip),
  );
}

describe('POST /api/v1/reports — rate limit', () => {
  beforeEach(() => {
    resetRateLimitBackend();
    vi.spyOn(rateLimitLog, 'warn').mockImplementation(() => {});
    vi.spyOn(clientIpLog, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 429 with Retry-After and the legacy headers on the 4th POST from one IP', async () => {
    const app = createTestApp();
    const ip = uniqueTestIp();
    for (let i = 0; i < 3; i++) {
      expect((await postReport(app, ip)).status).not.toBe(429);
    }
    const res = await postReport(app, ip);
    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(900);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('3');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(res.headers.get('X-RateLimit-Reset')).not.toBeNull();
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.requestId).toEqual(expect.any(String));
  });

  it('does not throttle a second client IP', async () => {
    const app = createTestApp();
    const ip = uniqueTestIp();
    for (let i = 0; i < 4; i++) await postReport(app, ip);
    expect((await postReport(app, uniqueTestIp())).status).not.toBe(429);
  });

  it('does not create new buckets for random X-Forwarded-For values from one peer', async () => {
    const app = createTestApp();
    const ip = uniqueTestIp();
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await postReport(app, ip, { 'x-forwarded-for': `${i}.${i}.${i}.${i}` });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 3)).not.toContain(429);
    expect(statuses[3]).toBe(429);
  });

  it('is independent of the contact-ip budget', async () => {
    const app = createTestApp();
    const ip = uniqueTestIp();
    for (let i = 0; i < 4; i++) {
      await app.request(
        '/api/v1/contact',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'x',
            email: 'a@b.co',
            subject: 's',
            message: 'm'.repeat(20),
          }),
        },
        peerEnv(ip),
      );
    }
    expect((await postReport(app, ip)).status).not.toBe(429);
  });

  it('keeps limiting with the cache disabled', async () => {
    const original = process.env.CACHE_ENABLED;
    try {
      process.env.CACHE_ENABLED = 'false';
      reloadConfig();
      setCacheProvider(new NullCacheProvider());
      const app = createTestApp();
      const ip = uniqueTestIp();
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) statuses.push((await postReport(app, ip)).status);
      expect(statuses[3]).toBe(429);
    } finally {
      if (original === undefined) delete process.env.CACHE_ENABLED;
      else process.env.CACHE_ENABLED = original;
      reloadConfig();
    }
  });
});

describe('POST /api/v1/reports — per-user and admin routes (DB integration)', () => {
  const fixtures = new NoteFixtures();
  let reporter: FixtureUser;
  let admin: FixtureUser;
  let recipe: FixtureRecipe;

  beforeAll(async () => {
    const author = await fixtures.user('report-rl-author');
    reporter = await fixtures.user('report-rl-reporter');
    admin = await fixtures.user('report-rl-admin', { isAdmin: true });
    recipe = await fixtures.recipe(author.id, { visibility: 'public' });
  });

  beforeEach(() => {
    resetRateLimitBackend();
    vi.spyOn(rateLimitLog, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await db.delete(reports).where(inArray(reports.reporterId, [reporter.id, admin.id]));
    await fixtures.cleanup();
  });

  it('limits one user across 4 different IPs (report-user)', async () => {
    const app = createTestApp();
    const auth = { Authorization: await bearer(reporter) };
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push(
        (await postReport(app, uniqueTestIp(), auth, reportBody(recipe.recipe.id))).status,
      );
    }
    expect(statuses).toEqual([201, 201, 201, 429]);
  });

  it('does not throttle the admin list and resolve routes with the report policies', async () => {
    const app = createTestApp();
    const ip = uniqueTestIp();
    const auth = { Authorization: await bearer(admin) };
    // Exhaust the POST budget of this IP first.
    for (let i = 0; i < 4; i++) await postReport(app, ip);
    for (let i = 0; i < 4; i++) {
      const list = await app.request('/api/v1/reports', { headers: auth }, peerEnv(ip));
      expect(list.status).toBe(200);
    }
    for (let i = 0; i < 4; i++) {
      const resolve = await app.request(
        `/api/v1/reports/${crypto.randomUUID()}/resolve`,
        { method: 'PATCH', headers: auth },
        peerEnv(ip),
      );
      expect(resolve.status).not.toBe(429);
    }
  });
});
