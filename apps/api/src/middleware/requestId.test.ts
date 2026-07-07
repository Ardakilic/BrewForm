// deno-lint-ignore-file no-explicit-any require-await
import '../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { requestIdMiddleware } from './requestId.ts';

function createTestApp() {
  const app = new Hono();
  app.use('*', requestIdMiddleware);
  app.get('/test', (c) => c.json({ requestId: c.get('requestId') }));
  return app;
}

describe('requestIdMiddleware', () => {
  it('should generate a UUID when no X-Request-ID header is provided', async () => {
    const app = createTestApp();
    const res = await app.request('/test');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requestId).toBeDefined();
    expect(typeof body.requestId).toBe('string');
    // UUID v4 format: 8-4-4-4-12 hex
    expect(body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('should use the X-Request-ID header when provided', async () => {
    const app = createTestApp();
    const res = await app.request('/test', {
      headers: { 'X-Request-ID': 'custom-id-123' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requestId).toBe('custom-id-123');
  });

  it('should return different request IDs across separate requests', async () => {
    const app = createTestApp();
    const res1 = await app.request('/test');
    const res2 = await app.request('/test');
    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body1.requestId).not.toBe(body2.requestId);
  });
});
