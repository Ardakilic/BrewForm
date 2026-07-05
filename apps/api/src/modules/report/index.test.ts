import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { setCacheProvider } from '../../utils/cache/singleton.ts';
import { InMemoryCacheProvider } from '../../utils/cache/index.ts';
import report from './index.ts';
import type { AppEnv } from '../../types/hono.ts';

/**
 * Rate-limit route tests for `POST /api/v1/reports`.
 *
 * The rate-limit middleware is the FIRST middleware in the POST chain (before
 * `authMiddleware` and `zValidator`), so the 429 fires regardless of body or
 * auth validity. These tests exploit that to send unauthenticated POSTs with
 * empty bodies — the limiter keys by IP, not auth state, so the 4th POST from
 * the same IP returns 429 no matter what. This mirrors the contact rate-limit
 * test (`contact.test.ts:53-68`) and avoids the JWT-minting complexity that
 * authenticated route tests normally require.
 *
 * Admin GET/PATCH routes on the same router are NOT throttled by the
 * `keyPrefix: 'report'` limiter (it is applied to POST only, not via
 * `report.use('*', ...)`) — the second test asserts that exhausting the POST
 * budget does not produce 429 on `GET /api/v1/reports`.
 */

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
  });
  app.route('/api/v1/reports', report);
  return app;
}

describe(
  'POST /api/v1/reports — rate limit',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    beforeEach(() => {
      // Fresh cache per test so the rate-limit counter does not leak between tests
      // (pattern from rateLimit.test.ts:11-13).
      setCacheProvider(new InMemoryCacheProvider());
    });

    afterEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    it('returns 429 on the 4th POST within the rate-limit window', async () => {
      const app = createTestApp();
      // The first 3 POSTs are processed by the limiter (they may 401/400 because
      // auth/body are invalid, but the limiter counter increments regardless —
      // it runs before authMiddleware and zValidator).
      for (let i = 0; i < 3; i++) {
        await app.request('/api/v1/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipeId: crypto.randomUUID(), reason: 'spam' }),
        });
      }
      // The 4th POST in the same 15-minute window from the same IP returns 429.
      const res = await app.request('/api/v1/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: crypto.randomUUID(), reason: 'spam' }),
      });
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('RATE_LIMITED');
    });

    it('does not throttle admin GET routes (report limiter is POST-only)', async () => {
      const app = createTestApp();
      // Exhaust the POST budget first.
      for (let i = 0; i < 3; i++) {
        await app.request('/api/v1/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipeId: crypto.randomUUID(), reason: 'spam' }),
        });
      }
      // A 4th POST would be 429 — but a GET on the same router must NOT be 429
      // (the report-specific limiter is applied to POST only, not via
      // `report.use('*', ...)`). The GET may return 401 (no auth) or 403 (not
      // admin), but the assertion is that it is not throttled by the report
      // limiter.
      const res = await app.request('/api/v1/reports', { method: 'GET' });
      expect(res.status).not.toBe(429);
    });
  },
);
