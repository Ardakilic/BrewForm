// deno-lint-ignore-file no-explicit-any require-await
import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { setCacheProvider } from '../../utils/cache/singleton.ts';
import { InMemoryCacheProvider } from '../../utils/cache/index.ts';
import beanRouter from './index.ts';
import type { AppEnv } from '../../types/hono.ts';

/**
 * Pre-auth route tests for the beans router (`/api/v1/beans`).
 *
 * The `bean` module does NOT export a `deps` object, so we mount the REAL
 * router and exercise the unauthenticated / validation behaviour.
 *
 * - `GET /:id` is public (no auth) — a valid-but-unknown UUID returns 404
 *   (BEAN_NOT_FOUND), and an invalid UUID also returns 404 because the
 *   Drizzle/Postgres query yields no rows (it does not error on non-UUID
 *   strings for this column type), so the service throws BEAN_NOT_FOUND
 *   and the route handler maps it to 404.
 * - Authenticated routes (GET `/`, POST `/`, PATCH/DELETE `/:id`) return 401
 *   without a Bearer token.
 * - POST `/` with an invalid body returns 401 (auth runs before the JSON
 *   validator), and the 400 validation path is covered by the schema unit
 *   tests in packages/shared.
 */

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
  });
  app.route('/api/v1/beans', beanRouter);
  return app;
}

describe(
  'Bean Routes — pre-auth & validation',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    beforeEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    afterEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    describe('GET /api/v1/beans/:id', () => {
      it('returns 404 for a valid UUID that does not match any bean', async () => {
        const app = createTestApp();
        const res = await app.request(`/api/v1/beans/${crypto.randomUUID()}`);
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('NOT_FOUND');
      });

      it('returns 404 for an invalid UUID (DB query yields no rows, service throws BEAN_NOT_FOUND)', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/beans/not-a-uuid');
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('NOT_FOUND');
      });
    });

    describe('GET /api/v1/beans', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/beans');
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });
    });

    describe('POST /api/v1/beans', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/beans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Test Bean' }),
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });

      it('returns 401 (auth gate) when the body is invalid AND no token is present', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/beans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: '' }),
        });
        expect(res.status).toBe(401);
      });
    });

    describe('PATCH /api/v1/beans/:id', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request(`/api/v1/beans/${crypto.randomUUID()}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Updated' }),
        });
        expect(res.status).toBe(401);
      });
    });

    describe('DELETE /api/v1/beans/:id', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request(`/api/v1/beans/${crypto.randomUUID()}`, {
          method: 'DELETE',
        });
        expect(res.status).toBe(401);
      });
    });
  },
);
