import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { setCacheProvider } from '../../utils/cache/singleton.ts';
import { InMemoryCacheProvider } from '../../utils/cache/index.ts';
import tasteRouter from './index.ts';
import type { AppEnv } from '../../types/hono.ts';

/**
 * Pre-auth route tests for the taste-notes router (`/api/v1/taste-notes`).
 *
 * The `taste` module does NOT export a `deps` object, so we mount the REAL
 * router. The three GET routes (`/hierarchy`, `/search`, `/flat`) are public
 * but read `cacheProvider!` from the imported singleton, so each test sets a
 * fresh `InMemoryCacheProvider` via `setCacheProvider(...)`. The mutations
 * (POST `/`, PATCH/DELETE `/:id`) are admin-only and return 401 without a
 * Bearer token (authMiddleware runs before adminMiddleware).
 */

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
  });
  app.route('/api/v1/taste-notes', tasteRouter);
  return app;
}

describe(
  'Taste-Note Routes — pre-auth & validation',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    beforeEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    afterEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    describe('GET /api/v1/taste-notes/hierarchy', () => {
      it('returns 200 with the taste-note hierarchy array', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/taste-notes/hierarchy');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
      });
    });

    describe('GET /api/v1/taste-notes/search', () => {
      it('returns 200 with a flat list when no search query is supplied', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/taste-notes/search');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
      });

      it('returns 400 when the search query is shorter than 3 characters', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/taste-notes/search?search=ab');
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });

    describe('GET /api/v1/taste-notes/flat', () => {
      it('returns 200 with a flat list of taste notes', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/taste-notes/flat');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
      });
    });

    describe('POST /api/v1/taste-notes', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request('/api/v1/taste-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Fruity', depth: 0 }),
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });
    });

    describe('PATCH /api/v1/taste-notes/:id', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request(`/api/v1/taste-notes/${crypto.randomUUID()}`, {
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

    describe('DELETE /api/v1/taste-notes/:id', () => {
      it('returns 401 when no Authorization header is present', async () => {
        const app = createTestApp();
        const res = await app.request(`/api/v1/taste-notes/${crypto.randomUUID()}`, {
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
