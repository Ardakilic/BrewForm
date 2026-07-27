import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { setCacheProvider } from '../../utils/cache/singleton.ts';
import { InMemoryCacheProvider } from '../../utils/cache/index.ts';
import badgeRouter from './index.ts';
import type { AppEnv } from '../../types/hono.ts';

/**
 * Pre-auth route tests for the badges router (`/api/v1/badges`).
 *
 * The `badge` module does NOT export a `deps` object, so we mount the REAL
 * router. `GET /` and `GET /user/:userId` are public; the latter has no
 * `zValidator('param')` so both a valid-but-unknown UUID and an invalid UUID
 * return 200 with an empty array (the Drizzle query yields no rows rather
 * than erroring on non-UUID strings). `POST /evaluate/:userId` is admin-only
 * → 401 without a Bearer token (authMiddleware runs before adminMiddleware).
 */

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
  });
  app.route('/api/v1/badges', badgeRouter);
  return app;
}

describe(
  'Badge Routes — pre-auth & validation',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    beforeEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    afterEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    describe('GET /api/v1/badges', () => {
      it('returns 200 with the badge list array', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/badges');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
      });
    });

    describe('GET /api/v1/badges/user/:userId', () => {
      it('returns 200 with an empty array for a valid UUID with no badges', async () => {
        const app = createTestApp();
        const res = await app.request(`/api/v1/badges/user/${crypto.randomUUID()}`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data).toHaveLength(0);
      });

      it('returns 200 with an empty array for an invalid UUID (DB query yields no rows)', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/badges/user/not-a-uuid');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data).toHaveLength(0);
      });
    });

    describe('POST /api/v1/badges/evaluate/:userId', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request(`/api/v1/badges/evaluate/${crypto.randomUUID()}`, {
          method: 'POST',
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });
    });
  },
);
