// deno-lint-ignore-file no-explicit-any require-await
import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { setCacheProvider } from '../../utils/cache/singleton.ts';
import { InMemoryCacheProvider } from '../../utils/cache/index.ts';
import photoRouter from './index.ts';
import type { AppEnv } from '../../types/hono.ts';

/**
 * Pre-auth route tests for the photos router (`/api/v1/photos`).
 *
 * The `photo` module does NOT export a `deps` object, so we mount the REAL
 * router. `GET /recipe/:recipeId` is public and has no `zValidator('param')`,
 * so both a valid-but-unknown UUID and an invalid UUID return 200 with an
 * empty array (the Drizzle query simply yields no matching rows rather than
 * erroring on non-UUID strings). `POST /` (multipart upload) and
 * `DELETE /:id` are auth-guarded → 401 without a Bearer token.
 */

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
  });
  app.route('/api/v1/photos', photoRouter);
  return app;
}

describe(
  'Photo Routes — pre-auth & validation',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    beforeEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    afterEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    describe('GET /api/v1/photos/recipe/:recipeId', () => {
      it('returns 200 with an empty array for a valid UUID with no photos', async () => {
        const app = createTestApp();
        const res = await app.request(`/api/v1/photos/recipe/${crypto.randomUUID()}`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data).toHaveLength(0);
      });

      it('returns 200 with an empty array for an invalid UUID (DB query yields no rows)', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/photos/recipe/not-a-uuid');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data).toHaveLength(0);
      });
    });

    describe('POST /api/v1/photos', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const form = new FormData();
        form.append('recipeId', crypto.randomUUID());
        form.append(
          'file',
          new File([new Uint8Array([1, 2, 3])], 'test.png', { type: 'image/png' }),
        );
        const res = await app.request('/api/v1/photos', {
          method: 'POST',
          body: form,
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });
    });

    describe('DELETE /api/v1/photos/:id', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request(`/api/v1/photos/${crypto.randomUUID()}`, {
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
