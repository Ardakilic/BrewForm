// deno-lint-ignore-file no-explicit-any require-await
import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { setCacheProvider } from '../../utils/cache/singleton.ts';
import { InMemoryCacheProvider } from '../../utils/cache/index.ts';
import vendorRouter from './index.ts';
import type { AppEnv } from '../../types/hono.ts';

/**
 * Pre-auth route tests for the vendors router (`/api/v1/vendors`).
 *
 * The `vendor` module does NOT export a `deps` object, so we mount the REAL
 * router. `GET /` and `GET /search` are public (pagination/search query
 * validated by `zValidator('query')`). `GET /:id` is public but has no
 * `zValidator('param')` — both a valid-but-unknown UUID and an invalid UUID
 * return 404 because the Drizzle/Postgres query yields no rows (it does not
 * error on non-UUID strings), so the service throws VENDOR_NOT_FOUND and the
 * route handler maps it to 404. `POST /` is auth-guarded → 401 without a
 * Bearer token; `PATCH/DELETE /:id` are admin-only → 401 without a Bearer
 * token.
 */

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
  });
  app.route('/api/v1/vendors', vendorRouter);
  return app;
}

describe(
  'Vendor Routes — pre-auth & validation',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    beforeEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    afterEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    describe('GET /api/v1/vendors', () => {
      it('returns 200 with a paginated vendor list', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/vendors');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.meta.pagination).toBeDefined();
      });
    });

    describe('GET /api/v1/vendors/search', () => {
      it('returns 200 with a list of matching vendors', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/vendors/search?q=Fellow');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
      });

      it('returns 400 when the q query is shorter than 2 characters', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/vendors/search?q=a');
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.success).toBe(false);
      });

      it('returns 400 when the q query is missing', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/vendors/search');
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });

    describe('GET /api/v1/vendors/:id', () => {
      it('returns 404 for a valid UUID that does not match any vendor', async () => {
        const app = createTestApp();
        const res = await app.request(`/api/v1/vendors/${crypto.randomUUID()}`);
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('NOT_FOUND');
      });

      it('returns 404 for an invalid UUID (DB query yields no rows, service throws VENDOR_NOT_FOUND)', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/vendors/not-a-uuid');
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('NOT_FOUND');
      });
    });

    describe('POST /api/v1/vendors', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/vendors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Test Vendor' }),
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });

      it('returns 401 (auth gate) when the body is invalid AND no token is present', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/vendors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: '' }),
        });
        expect(res.status).toBe(401);
      });
    });

    describe('PATCH /api/v1/vendors/:id', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request(`/api/v1/vendors/${crypto.randomUUID()}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Updated' }),
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });
    });

    describe('DELETE /api/v1/vendors/:id', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request(`/api/v1/vendors/${crypto.randomUUID()}`, {
          method: 'DELETE',
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });
    });
  },
);
