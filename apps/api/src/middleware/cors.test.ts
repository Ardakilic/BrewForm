import '../test-setup.ts';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { describe, expect, it } from 'vitest';
import { corsMiddleware } from './cors.ts';

describe('CORS Middleware', () => {
  it('should set CORS headers on preflight requests', async () => {
    const app = new Hono();
    app.use(
      '*',
      cors({
        origin: ['http://localhost:5173', 'http://localhost:8000'],
        allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        credentials: true,
        maxAge: 600,
      }),
    );
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      method: 'GET',
      headers: {
        Origin: 'http://localhost:5173',
      },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });

  it('should handle OPTIONS preflight request', async () => {
    const app = new Hono();
    app.use(
      '*',
      cors({
        origin: ['http://localhost:5173'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
      }),
    );
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
      },
    });
    expect(res.status).toBe(204);
  });

  it('exposes the rate-limit headers to the cross-origin SPA', async () => {
    const app = new Hono();
    app.use('*', corsMiddleware);
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      method: 'GET',
      headers: { Origin: 'http://localhost:5173' },
    });
    const exposed = (res.headers.get('Access-Control-Expose-Headers') ?? '')
      .split(',')
      .map((name) => name.trim());
    expect(exposed).toEqual([
      'Retry-After',
      'RateLimit',
      'RateLimit-Policy',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ]);
  });
});
