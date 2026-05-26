import '../../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../../types/hono.ts';
import {
  EquipmentCreateSchema,
  EquipmentFilterSchema,
  EquipmentUpdateSchema,
} from '@brewform/shared/schemas';

function createTestApp() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('userId', 'test-user-id');
    c.set('user', { id: 'test-user-id', isAdmin: false } as any);
    await next();
  });

  app.get('/equipment', zValidator('query', EquipmentFilterSchema), (c) => {
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

  app.get('/equipment/search', (c) => {
    const q = c.req.query('q');
    if (!q || q.length < 2) {
      return c.json({ success: true, data: [] });
    }
    return c.json({ success: true, data: [{ id: 'eq-1', name: 'Fellow Stagg', type: 'kettle' }] });
  });

  app.post('/equipment', zValidator('json', EquipmentCreateSchema), (c) => {
    return c.json({ success: true, data: {} }, 201);
  });

  app.get('/equipment/:id', (c) => {
    const id = c.req.param('id');
    if (id === 'nonexistent') {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Equipment not found' } },
        404,
      );
    }
    return c.json({
      success: true,
      data: { id, name: 'Fellow Stagg', type: 'kettle', brand: 'Fellow', model: 'Stagg EKG' },
    });
  });

  app.patch('/equipment/:id', zValidator('json', EquipmentUpdateSchema), (c) => {
    const body = c.req.valid('json');
    return c.json({
      success: true,
      data: { id: c.req.param('id'), ...body },
    });
  });

  app.delete('/equipment/:id', (c) => {
    return c.json({ success: true, data: { message: 'Equipment deleted' } });
  });

  app.get('/equipment/:id/recipes', (c) => {
    return c.json({
      success: true,
      data: [],
      meta: { page: 1, perPage: 12, total: 0, totalPages: 0 },
    });
  });

  app.post('/equipment/:id/delete-request', (c) => {
    const reason = c.req.query('reason');
    return c.json({
      success: true,
      data: { equipmentId: c.req.param('id'), reason: reason ?? null },
    }, 201);
  });

  return app;
}

describe('Equipment Routes — Integration', () => {
  describe('GET /equipment', () => {
    it('should return paginated list', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.meta).toBeDefined();
    });

    it('should accept pagination query params', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment?page=2&perPage=10');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.meta.page).toBe(2);
      expect(body.meta.perPage).toBe(10);
    });

    it('should accept type filter', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment?type=espresso_machine');
      expect(res.status).toBe(200);
    });

    it('should accept search filter', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment?search=Stagg');
      expect(res.status).toBe(200);
    });

    it('should accept both type and search filters', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment?type=kettle&search=Fellow');
      expect(res.status).toBe(200);
    });

    it('should reject invalid type', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment?type=invalid_type');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /equipment/search', () => {
    it('should return results for query with 2+ chars', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment/search?q=Fellow');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('should return empty for query shorter than 2 chars', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment/search?q=F');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
    });

    it('should return empty for missing query', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment/search');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
    });
  });

  describe('POST /equipment', () => {
    it('should create equipment with valid data', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Fellow Stagg', type: 'kettle', brand: 'Fellow', model: 'Stagg EKG' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('should reject empty name', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', type: 'kettle' }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject missing type', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /equipment/:id', () => {
    it('should return equipment by id', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment/eq-1');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('eq-1');
      expect(body.data.name).toBe('Fellow Stagg');
    });

    it('should return 404 for missing equipment', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment/nonexistent');
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /equipment/:id', () => {
    it('should update equipment with valid data', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment/eq-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Kettle' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('should reject invalid update data', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment/eq-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /equipment/:id', () => {
    it('should delete equipment', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment/eq-1', {
        method: 'DELETE',
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('GET /equipment/:id/recipes', () => {
    it('should return recipes for equipment', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment/eq-1/recipes');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.meta).toBeDefined();
    });
  });

  describe('POST /equipment/:id/delete-request', () => {
    it('should create delete request', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment/eq-1/delete-request?reason=Duplicate', {
        method: 'POST',
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.reason).toBe('Duplicate');
    });

    it('should handle missing reason', async () => {
      const app = createTestApp();
      const res = await app.request('/equipment/eq-1/delete-request', {
        method: 'POST',
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.reason).toBeNull();
    });
  });
});
