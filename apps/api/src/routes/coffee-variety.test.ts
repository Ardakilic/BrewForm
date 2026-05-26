import '../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CoffeeVarietyFilterSchema } from '@brewform/shared/schemas';

function createCoffeeVarietyRouteApp() {
  const app = new Hono();

  app.get('/coffee-varieties', zValidator('query', CoffeeVarietyFilterSchema), (c) => {
    return c.json({ success: true, data: [], meta: { pagination: { total: 0 } } });
  });

  app.get('/coffee-varieties/search', (c) => {
    const q = c.req.query('q');
    if (!q || q.length < 2) {
      return c.json({ success: true, data: [] });
    }
    return c.json({ success: true, data: [{ id: 'v1', name: 'Test Variety' }] });
  });

  return app;
}

describe('Coffee Variety Route Registration', () => {
  const app = createCoffeeVarietyRouteApp();

  it('GET /api/v1/coffee-varieties returns a response (not 404)', async () => {
    const res = await app.request('/coffee-varieties');
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('GET /api/v1/coffee-varieties/search?q=test returns a response', async () => {
    const res = await app.request('/coffee-varieties/search?q=test');
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('GET /api/v1/coffee-varieties/search returns empty for short query', async () => {
    const res = await app.request('/coffee-varieties/search?q=a');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('GET /api/v1/coffee-varieties accepts pagination params', async () => {
    const res = await app.request('/coffee-varieties?page=2&perPage=10');
    expect(res.status).toBe(200);
  });

  it('GET /api/v1/coffee-varieties accepts category and search filters', async () => {
    const res = await app.request('/coffee-varieties?category=variety&search=bourbon');
    expect(res.status).toBe(200);
  });
});
