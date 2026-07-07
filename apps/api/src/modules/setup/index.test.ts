// deno-lint-ignore-file no-explicit-any require-await
import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { setCacheProvider } from '../../utils/cache/singleton.ts';
import { InMemoryCacheProvider } from '../../utils/cache/index.ts';
import setupRouter from './index.ts';
import type { AppEnv } from '../../types/hono.ts';

/**
 * Pre-auth route tests for the setups router (`/api/v1/setups`).
 *
 * The `setup` module does NOT export a `deps` object, so we mount the REAL
 * router and assert pre-auth / validation behaviour. All routes on this
 * router are auth-guarded except `GET /:id`, which is public but has no
 * `zValidator('param', ...)` — an invalid UUID still returns 404 because
 * the Drizzle/Postgres query yields no rows (it does not error on non-UUID
 * strings), so the service throws SETUP_NOT_FOUND and the route handler
 * maps it to 404.
 */

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
  });
  app.route('/api/v1/setups', setupRouter);
  return app;
}

describe(
  'Setup Routes — pre-auth & validation',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    beforeEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    afterEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    describe('GET /api/v1/setups', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/setups');
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });
    });

    describe('POST /api/v1/setups', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/setups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'My V60 Setup' }),
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });

      it('returns 401 (auth gate) when the body is invalid AND no token is present', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/setups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: '' }),
        });
        expect(res.status).toBe(401);
      });
    });

    describe('GET /api/v1/setups/:id', () => {
      it('returns 404 for a valid UUID that does not match any setup', async () => {
        const app = createTestApp();
        const res = await app.request(`/api/v1/setups/${crypto.randomUUID()}`);
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('NOT_FOUND');
      });

      it('returns 404 for an invalid UUID (DB query yields no rows, service throws SETUP_NOT_FOUND)', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/setups/not-a-uuid');
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('NOT_FOUND');
      });
    });

    describe('PATCH /api/v1/setups/:id', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request(`/api/v1/setups/${crypto.randomUUID()}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Updated' }),
        });
        expect(res.status).toBe(401);
      });
    });

    describe('DELETE /api/v1/setups/:id', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request(`/api/v1/setups/${crypto.randomUUID()}`, {
          method: 'DELETE',
        });
        expect(res.status).toBe(401);
      });
    });

    describe('POST /api/v1/setups/:id/set-default', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request(`/api/v1/setups/${crypto.randomUUID()}/set-default`, {
          method: 'POST',
        });
        expect(res.status).toBe(401);
      });
    });
  },
);
