// deno-lint-ignore-file no-explicit-any require-await
import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { setCacheProvider } from '../../utils/cache/singleton.ts';
import { InMemoryCacheProvider } from '../../utils/cache/index.ts';
import userRouter from './index.ts';
import type { AppEnv } from '../../types/hono.ts';

/**
 * Pre-auth route tests for the users router (`/api/v1/users`).
 *
 * The `user` module does NOT export a `deps` object, so we mount the REAL
 * router. `GET /me`, `PATCH /me`, and `DELETE /me` are auth-guarded → 401
 * without a Bearer token. `GET /:username` uses `optionalAuthMiddleware`,
 * so it proceeds unauthenticated and returns 404 for an unknown username.
 */

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
  });
  app.route('/api/v1/users', userRouter);
  return app;
}

describe(
  'User Routes — pre-auth & validation',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    beforeEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    afterEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    describe('GET /api/v1/users/me', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/users/me');
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });
    });

    describe('PATCH /api/v1/users/me', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/users/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: 'New Name' }),
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });

      it('returns 401 (auth gate) when the body is invalid AND no token is present', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/users/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatarUrl: 'not-a-url' }),
        });
        expect(res.status).toBe(401);
      });
    });

    describe('DELETE /api/v1/users/me', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/users/me', {
          method: 'DELETE',
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });
    });

    describe('GET /api/v1/users/:username', () => {
      it('returns 404 for a username that does not exist', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/users/definitely-no-such-user-xyz');
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('NOT_FOUND');
      });
    });
  },
);
