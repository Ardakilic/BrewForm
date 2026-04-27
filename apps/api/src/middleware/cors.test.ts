import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

describe('CORS Middleware', () => {
  it('should set CORS headers on preflight requests', async () => {
    const app = new Hono();
    app.use('*', cors({
      origin: ['http://localhost:5173', 'http://localhost:8000'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
      maxAge: 600,
    }));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      method: 'GET',
      headers: {
        'Origin': 'http://localhost:5173',
      },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });

  it('should handle OPTIONS preflight request', async () => {
    const app = new Hono();
    app.use('*', cors({
      origin: ['http://localhost:5173'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    }));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
      },
    });
    expect(res.status).toBe(204);
  });
});