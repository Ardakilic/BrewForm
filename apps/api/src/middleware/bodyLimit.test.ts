import '../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { bodyLimitMiddleware } from './bodyLimit.ts';
import { app as realApp } from '../main.ts';

/**
 * Build a fresh Hono app with the production bodyLimit middleware applied.
 *
 * Mounts three routes used by the test suite:
 *  - `POST /api/v1/test` — exercises the 1 MB JSON body limit
 *  - `GET  /api/v1/test` — sanity check that GETs pass through
 *  - `POST /api/v1/photos` — must bypass the body limit
 *  - `POST /api/v1/photoshop` — lookalike route that must NOT bypass the limit
 *  - `POST /api/v1/photos/sub` — subpath of /api/v1/photos that must bypass it
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
    // Simulate photo handler — return 401 because we don't send auth
    return c.json({ error: 'Authentication required' }, 401);
  });

  app.post('/api/v1/photos/sub', async (c) => {
    return c.json({ error: 'Authentication required' }, 401);
  });

  app.post('/api/v1/photoshop', async (c) => {
    // Handler for the lookalike route — bodyLimit must apply here
    return c.json({ ok: true }, 201);
  });

  app.get('/api/v1/test', (c) => c.json({ ok: true }));

  return app;
}

describe('bodyLimit middleware', () => {
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

  describe('photo route exclusion', () => {
    it('does not apply bodyLimit to POST /api/v1/photos', async () => {
      const app = createApp();
      const res = await app.request('/api/v1/photos', {
        method: 'POST',
        headers: { 'content-length': '2097152' }, // 2 MB would trigger 413 normally
        body: '{}',
      });
      expect(res.status).not.toBe(413);
      // Photo route handler runs (returns 401 because no auth token)
      expect(res.status).toBe(401);
    });

    it('does not apply bodyLimit to subpaths of /api/v1/photos', async () => {
      const app = createApp();
      const res = await app.request('/api/v1/photos/sub', {
        method: 'POST',
        headers: { 'content-length': '2097152' },
        body: '{}',
      });
      expect(res.status).not.toBe(413);
      // Subpath handler runs (returns 401 because no auth token)
      expect(res.status).toBe(401);
    });

    it('applies bodyLimit to lookalike routes like /api/v1/photoshop', async () => {
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
    });
  });

  describe('photo handler validation is unchanged', () => {
    it('returns 400 for files exceeding UPLOAD_MAX_SIZE_BYTES via validateImageUpload', async () => {
      // Direct unit test of validateImageUpload — confirms it's untouched
      const { validateImageUpload } = await import('../utils/upload/index.ts');
      const result = validateImageUpload({
        type: 'image/jpeg',
        size: 11 * 1024 * 1024, // 11 MB > 10 MB default
      });
      expect(result).not.toBeNull();
      expect(result).toContain('File too large');
    });
  });

  describe('integration with main.ts app', () => {
    it('returns 413 from the real app for an oversized JSON body', async () => {
      const res = await realApp.request('/api/v1/test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '2097152', // 2 MB
        },
        body: '{}',
      });
      expect(res.status).toBe(413);
      const result = await res.json();
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('excludes /api/v1/photos from bodyLimit in the real app', async () => {
      const res = await realApp.request('/api/v1/photos', {
        method: 'POST',
        headers: { 'content-length': '2097152' }, // 2 MB
        body: '{}',
      });
      expect(res.status).not.toBe(413);
    });
  });
});
