import '../test-setup.ts';
import { db } from '@brewform/db';
import { recipes, users } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../config/index.ts';
import { app as realApp } from '../main.ts';
import { signAccessToken } from '../modules/auth/jwt.ts';
import { makeJpeg } from '../test-fixtures/images.ts';
import { PHOTO_BODY_MAX_BYTES } from '../utils/upload/limits.ts';
import { bodyLimitMiddleware } from './bodyLimit.ts';

/** Paths whose handler ran in the current test (reset in `beforeEach`). */
let handled: string[] = [];

/**
 * Build a fresh Hono app with the production bodyLimit middleware applied.
 *
 * Mounts the routes used by the test suite:
 *  - `POST /api/v1/test` — exercises the 1 MB JSON body limit
 *  - `GET  /api/v1/test` — sanity check that GETs pass through
 *  - `POST /api/v1/photos` — subject to the photo body cap instead of 1 MB
 *  - `POST /api/v1/photos/sub` — subpath of /api/v1/photos, same photo cap
 *  - `POST /api/v1/photoshop` — lookalike route that keeps the 1 MB limit
 *
 * Every photo/lookalike handler records its path in {@link handled}, so tests
 * can assert that a rejected request never reached it.
 *
 * @returns A configured Hono app ready to be queried via `app.request()`.
 */
function createApp() {
  const app = new Hono();

  app.use('*', async (c, next) => {
    c.set('requestId', 'test-req-id');
    await next();
  });

  app.use('*', bodyLimitMiddleware);

  app.post('/api/v1/test', async (c) => {
    const body = await c.req.json();
    return c.json({ received: true, size: JSON.stringify(body).length }, 201);
  });

  app.post('/api/v1/photos', async (c) => {
    // Simulate the photo handler: read the body, then answer 401 (no auth sent).
    await c.req.arrayBuffer();
    handled.push(c.req.path);
    return c.json({ error: 'Authentication required' }, 401);
  });

  app.post('/api/v1/photos/sub', async (c) => {
    await c.req.arrayBuffer();
    handled.push(c.req.path);
    return c.json({ error: 'Authentication required' }, 401);
  });

  app.post('/api/v1/photoshop', (c) => {
    // Handler for the lookalike route — the 1 MB limit must apply here
    handled.push(c.req.path);
    return c.json({ ok: true }, 201);
  });

  app.get('/api/v1/test', (c) => c.json({ ok: true }));

  return app;
}

/**
 * A body stream of `total` bytes sent in 64 KiB chunks, with no Content-Length
 * (so the middleware must count the streamed bytes itself).
 */
function chunkedBody(total: number): ReadableStream<Uint8Array> {
  const chunk = new Uint8Array(64 * 1024);
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= total) {
        controller.close();
        return;
      }
      const size = Math.min(chunk.byteLength, total - sent);
      controller.enqueue(chunk.subarray(0, size));
      sent += size;
    },
  });
}

describe('bodyLimit middleware', () => {
  beforeEach(() => {
    handled = [];
  });

  describe('requests within the 1 MB limit', () => {
    it('allows a POST with a 500 KB JSON body', async () => {
      const app = createApp();
      const body = JSON.stringify({ data: 'x'.repeat(500_000) }); // ~500 KB
      const res = await app.request('/api/v1/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      expect(res.status).toBe(201);
      const result = await res.json();
      expect(result.received).toBe(true);
    });
  });

  describe('requests exceeding the 1 MB limit', () => {
    it('returns 413 when Content-Length exceeds 1 MB', async () => {
      const app = createApp();
      const res = await app.request('/api/v1/test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '2097152', // 2 MB — bodyLimit checks this first
        },
        body: '{}', // Body is short; Content-Length is what triggers the rejection
      });
      expect(res.status).toBe(413);
      const result = await res.json();
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(result.error.message).toBe('Request body too large');
      expect(result.error.requestId).toBe('test-req-id');
    });

    it('returns 413 when streamed body exceeds 1 MB (no Content-Length)', async () => {
      const app = createApp();
      const bigString = 'x'.repeat(1024 * 1024 + 100); // 1 MB + 100 bytes
      const body = JSON.stringify({ data: bigString });
      const res = await app.request('/api/v1/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body, // No Content-Length header — bodyLimit streams and measures
      });
      expect(res.status).toBe(413);
      const result = await res.json();
      expect(result.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('requests without a body', () => {
    it('allows GET requests through unaffected', async () => {
      const app = createApp();
      const res = await app.request('/api/v1/test', { method: 'GET' });
      expect(res.status).toBe(200);
      const result = await res.json();
      expect(result.ok).toBe(true);
    });
  });

  describe('photo routes: the photo body cap replaces the 1 MB limit', () => {
    it('sizes the cap as UPLOAD_MAX_SIZE_BYTES + min(1 MiB, UPLOAD_MAX_SIZE_BYTES) + 64 KiB', () => {
      expect(PHOTO_BODY_MAX_BYTES).toBe(
        config.UPLOAD_MAX_SIZE_BYTES +
          Math.min(1024 * 1024, config.UPLOAD_MAX_SIZE_BYTES) +
          64 * 1024,
      );
    });

    it.each(['/api/v1/photos', '/api/v1/photos/sub'])(
      'returns 413 on %s when Content-Length exceeds the cap, without running the handler',
      async (route) => {
        const app = createApp();
        const res = await app.request(route, {
          method: 'POST',
          headers: { 'content-length': String(PHOTO_BODY_MAX_BYTES + 1) },
          body: '{}',
        });
        expect(res.status).toBe(413);
        const result = await res.json();
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('PAYLOAD_TOO_LARGE');
        expect(result.error.message).toBe('Request body too large');
        expect(result.error.requestId).toBe('test-req-id');
        expect(handled).toEqual([]);
      },
    );

    it.each(['/api/v1/photos', '/api/v1/photos/sub'])(
      'returns 413 on %s for a chunked body above the cap',
      async (route) => {
        const app = createApp();
        const res = await app.request(route, {
          method: 'POST',
          body: chunkedBody(PHOTO_BODY_MAX_BYTES + 64 * 1024),
          // Node's fetch Request requires half-duplex for a streamed body.
          duplex: 'half',
        } as RequestInit);
        expect(res.status).toBe(413);
        const result = await res.json();
        expect(result.error.code).toBe('PAYLOAD_TOO_LARGE');
        expect(handled).toEqual([]);
      },
    );

    it.each(['/api/v1/photos', '/api/v1/photos/sub'])(
      'lets a 2 MB Content-Length on %s reach the handler',
      async (route) => {
        const app = createApp();
        const res = await app.request(route, {
          method: 'POST',
          headers: { 'content-length': '2097152' }, // 2 MB: over 1 MB, within the photo cap
          body: '{}',
        });
        expect(res.status).toBe(401);
        expect(handled).toEqual([route]);
      },
    );

    it('lets a streamed photo body over 1 MB but within the cap reach the handler', async () => {
      const app = createApp();
      const res = await app.request('/api/v1/photos', {
        method: 'POST',
        body: chunkedBody(3 * 1024 * 1024),
        duplex: 'half',
      } as RequestInit);
      expect(res.status).toBe(401);
      expect(handled).toEqual(['/api/v1/photos']);
    });

    it('keeps the 1 MB limit on lookalike routes like /api/v1/photoshop', async () => {
      const app = createApp();
      const res = await app.request('/api/v1/photoshop', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '2097152', // 2 MB
        },
        body: '{}',
      });
      expect(res.status).toBe(413);
      const result = await res.json();
      expect(result.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(handled).toEqual([]);
    });
  });

  describe('integration with main.ts app', () => {
    it('returns 413 from the real app for an oversized JSON body', async () => {
      const res = await realApp.request('/api/v1/test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '2097152', // 2 MB
          'x-forwarded-for': `body-limit-${crypto.randomUUID()}`,
        },
        body: '{}',
      });
      expect(res.status).toBe(413);
      const result = await res.json();
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('applies the photo cap to /api/v1/photos in the real app', async () => {
      const res = await realApp.request('/api/v1/photos', {
        method: 'POST',
        headers: {
          'content-length': String(PHOTO_BODY_MAX_BYTES + 1),
          'x-forwarded-for': `body-limit-${crypto.randomUUID()}`,
        },
        body: '{}',
      });
      expect(res.status).toBe(413);
      const result = await res.json();
      expect(result.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(result.error.requestId).toBe(res.headers.get('x-request-id'));
    });

    it('lets a 2 MB photo request through the real app to the auth check', async () => {
      const res = await realApp.request('/api/v1/photos', {
        method: 'POST',
        headers: {
          'content-length': '2097152', // 2 MB
          'x-forwarded-for': `body-limit-${crypto.randomUUID()}`,
        },
        body: '{}',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('real app: a file part over UPLOAD_MAX_SIZE_BYTES within the photo cap', () => {
    let userId: string;
    let recipeId: string;
    let token: string;

    beforeAll(async () => {
      userId = crypto.randomUUID();
      recipeId = crypto.randomUUID();
      const [user] = await db
        .insert(users)
        .values({
          id: userId,
          email: `body-limit-${userId}@example.com`,
          username: `body-limit-${userId.slice(0, 8)}`,
          passwordHash: 'hash',
          emailVerifiedAt: new Date(),
        })
        .returning();
      await db.insert(recipes).values({
        id: recipeId,
        slug: `body-limit-${recipeId}`,
        title: `Body Limit ${recipeId.slice(0, 8)}`,
        authorId: userId,
        visibility: 'public',
      });
      token = await signAccessToken({
        id: user.id,
        email: user.email,
        username: user.username,
        isAdmin: false,
      });
    });

    afterAll(async () => {
      await db.delete(recipes).where(eq(recipes.id, recipeId));
      await db.delete(users).where(eq(users.id, userId));
    });

    it('returns 400 FILE_TOO_LARGE (not 413) for the file part', async () => {
      const oversized = new Uint8Array(config.UPLOAD_MAX_SIZE_BYTES + 1);
      oversized.set(makeJpeg(10, 10));
      const form = new FormData();
      form.append('recipeId', recipeId);
      form.append('file', new File([oversized], 'big.jpg', { type: 'image/jpeg' }));

      const res = await realApp.request('/api/v1/photos', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-forwarded-for': `body-limit-${crypto.randomUUID()}`,
        },
        body: form,
      });

      expect(res.status).toBe(400);
      const result = await res.json();
      expect(result.error.code).toBe('FILE_TOO_LARGE');
      expect(result.error.details[0].field).toBe('file');
    });
  });
});
