// deno-lint-ignore-file no-explicit-any require-await
import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { setCacheProvider } from '../../utils/cache/singleton.ts';
import { InMemoryCacheProvider } from '../../utils/cache/index.ts';
import qrcodeRouter from './index.ts';
import type { AppEnv } from '../../types/hono.ts';

/**
 * Pre-auth route tests for the qrcode router (`/api/v1/qrcode`).
 *
 * The `qrcode` module does NOT export a `deps` object, so we mount the REAL
 * router. `GET /recipe/:filename` is public and uses
 * `zValidator('param', FilenameParamSchema, zodValidationHook)`, so an
 * invalid filename returns 400 from the validation hook. A valid filename
 * (slug + `.png`/`.svg`) proceeds to the service and returns 404 when the
 * recipe slug does not exist (RECIPE_NOT_FOUND).
 */

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
  });
  app.route('/api/v1/qrcode', qrcodeRouter);
  return app;
}

describe(
  'QR-Code Routes — pre-auth & validation',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    beforeEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    afterEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    describe('GET /api/v1/qrcode/recipe/:filename', () => {
      it('returns 400 for an invalid filename (missing extension)', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/qrcode/recipe/just-a-slug');
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('returns 400 for an invalid filename (unsupported extension)', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/qrcode/recipe/my-recipe.jpg');
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('returns 404 for a valid filename whose slug does not exist', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/qrcode/recipe/definitely-no-such-recipe.png');
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('NOT_FOUND');
      });
    });
  },
);
