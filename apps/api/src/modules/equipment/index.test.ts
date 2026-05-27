import '../../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { AppEnv } from '../../types/hono.ts';
import equipmentRouter, { deps } from './index.ts';

deps.authMiddleware = async (_c: Context, next: Next) => {
  await next();
};

const mockService = {
  listEquipmentWithFilters: (
    _params: { type?: string; search?: string; page: number; perPage: number },
  ) => Promise.resolve({ items: [], total: 0 }),
  searchEquipment: (q: string) => {
    const results = q.length >= 2
      ? [{ id: 'eq-1', name: 'Fellow Stagg', type: 'kettle', brand: 'Fellow', model: 'Stagg EKG' }]
      : [];
    return Promise.resolve(results);
  },
  createEquipment: (_userId: string, data: Record<string, unknown>) => Promise.resolve(data),
  getEquipment: (id: string) => {
    if (id === 'nonexistent') return Promise.reject(new Error('EQUIPMENT_NOT_FOUND'));
    return Promise.resolve({
      id,
      name: 'Fellow Stagg',
      type: 'kettle',
      brand: 'Fellow',
      model: 'Stagg EKG',
    });
  },
  updateEquipment: (_userId: string, id: string, data: Record<string, unknown>) =>
    Promise.resolve({ id, ...data }),
  deleteEquipment: () => Promise.resolve(),
  getRecipesForEquipment: () => Promise.resolve({ data: [], total: 0 }),
  requestEquipmentDeletion: (equipmentId: string, _userId: string, reason?: string) => {
    if (equipmentId === 'nonexistent') return Promise.reject(new Error('EQUIPMENT_NOT_FOUND'));
    return Promise.resolve({ equipmentId, reason: reason ?? null });
  },
};

deps.service = { ...deps.service, ...mockService } as typeof deps.service;

function createTestApp() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    c.set('userId', 'test-user-id');
    c.set('user', { id: 'test-user-id', isAdmin: false } as any);
    await next();
  });

  app.route('/equipment', equipmentRouter);

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
      expect(body.meta.pagination.page).toBe(2);
      expect(body.meta.pagination.perPage).toBe(10);
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
        body: JSON.stringify({
          name: 'Fellow Stagg',
          type: 'kettle',
          brand: 'Fellow',
          model: 'Stagg EKG',
        }),
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
      expect(body.total).toBe(0);
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
