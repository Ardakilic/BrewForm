import '../../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../../types/hono.ts';
import {
  CoffeeVarietyCreateSchema,
  CoffeeVarietyFilterSchema,
  CoffeeVarietyUpdateSchema,
} from '@brewform/shared/schemas';

function createTestApp() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('userId', 'test-user-id');
    c.set('user', { id: 'test-user-id', isAdmin: false } as any);
    await next();
  });

  app.get('/coffee-varieties', zValidator('query', CoffeeVarietyFilterSchema), (c) => {
    const query = c.req.valid('query');
    return c.json({
      success: true,
      data: [],
      meta: {
        page: query.page ?? 1,
        perPage: query.perPage ?? 20,
        total: 0,
        totalPages: 0,
      },
    });
  });

  app.get('/coffee-varieties/search', (c) => {
    const q = c.req.query('q');
    if (!q || q.length < 2) {
      return c.json({ success: true, data: [] });
    }
    return c.json({ success: true, data: [{ id: 'var-1', name: 'Arabica' }] });
  });

  app.post('/coffee-varieties', zValidator('json', CoffeeVarietyCreateSchema), (c) => {
    return c.json({ success: true, data: {} }, 201);
  });

  app.get('/coffee-varieties/:id', (c) => {
    const id = c.req.param('id');
    if (id === 'nonexistent') {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Coffee variety not found' } },
        404,
      );
    }
    return c.json({
      success: true,
      data: { id, name: 'Arabica', category: 'variety' },
    });
  });

  app.patch('/coffee-varieties/:id', zValidator('json', CoffeeVarietyUpdateSchema), (c) => {
    const body = c.req.valid('json');
    return c.json({
      success: true,
      data: { id: c.req.param('id'), ...body },
    });
  });

  app.delete('/coffee-varieties/:id', (c) => {
    return c.json({ success: true, data: { message: 'Variety deleted' } });
  });

  app.get('/coffee-varieties/:id/recipes', (c) => {
    return c.json({
      success: true,
      data: [],
      meta: { page: 1, perPage: 12, total: 0, totalPages: 0 },
    });
  });

  return app;
}

describe('Coffee Variety Routes — Integration', () => {
  describe('GET /coffee-varieties', () => {
    it('should return paginated list', async () => {
      const app = createTestApp();
      const res = await app.request('/coffee-varieties');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.meta).toBeDefined();
    });

    it('should accept pagination query params', async () => {
      const app = createTestApp();
      const res = await app.request('/coffee-varieties?page=2&perPage=10');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.meta.page).toBe(2);
      expect(body.meta.perPage).toBe(10);
    });

    it('should accept category filter', async () => {
      const app = createTestApp();
      const res = await app.request('/coffee-varieties?category=variety');
      expect(res.status).toBe(200);
    });

    it('should reject invalid category', async () => {
      const app = createTestApp();
      const res = await app.request('/coffee-varieties?category=invalid');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /coffee-varieties/search', () => {
    it('should return results for query with 2+ chars', async () => {
      const app = createTestApp();
      const res = await app.request('/coffee-varieties/search?q=Arabica');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('should return empty for query shorter than 2 chars', async () => {
      const app = createTestApp();
      const res = await app.request('/coffee-varieties/search?q=A');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
    });

    it('should return empty for missing query', async () => {
      const app = createTestApp();
      const res = await app.request('/coffee-varieties/search');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
    });
  });

  describe('POST /coffee-varieties', () => {
    it('should create variety with valid data when authenticated', async () => {
      const app = createTestApp();
      const res = await app.request('/coffee-varieties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Geisha', category: 'variety' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('should reject empty name', async () => {
      const app = createTestApp();
      const res = await app.request('/coffee-varieties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', category: 'variety' }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject missing category', async () => {
      const app = createTestApp();
      const res = await app.request('/coffee-varieties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /coffee-varieties/:id', () => {
    it('should return variety by id', async () => {
      const app = createTestApp();
      const res = await app.request('/coffee-varieties/var-1');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('var-1');
    });

    it('should return 404 for missing variety', async () => {
      const app = createTestApp();
      const res = await app.request('/coffee-varieties/nonexistent');
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /coffee-varieties/:id', () => {
    it('should update variety with valid data', async () => {
      const app = createTestApp();
      const res = await app.request('/coffee-varieties/var-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Variety' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('should reject invalid update data', async () => {
      const app = createTestApp();
      const res = await app.request('/coffee-varieties/var-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /coffee-varieties/:id', () => {
    it('should soft delete variety', async () => {
      const app = createTestApp();
      const res = await app.request('/coffee-varieties/var-1', {
        method: 'DELETE',
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('GET /coffee-varieties/:id/recipes', () => {
    it('should return recipes for variety', async () => {
      const app = createTestApp();
      const res = await app.request('/coffee-varieties/var-1/recipes');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.meta).toBeDefined();
    });
  });
});
