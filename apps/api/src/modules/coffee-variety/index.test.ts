import '../../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { AppEnv } from '../../types/hono.ts';
import coffeeVarietyRouter, { deps } from './index.ts';

deps.authMiddleware = async (_c: Context, next: Next) => {
  await next();
};

const mockService = {
  listCoffeeVarieties: (params: { search?: string; page: number; perPage: number }) => {
    if (params.search) {
      return Promise.resolve({
        data: [{ id: 'var-1', name: 'Arabica' }],
        total: 1,
      });
    }
    return Promise.resolve({ data: [], total: 0 });
  },
  getCoffeeVarietyById: (id: string) => {
    if (id === 'nonexistent') return Promise.resolve(null);
    return Promise.resolve({ id, name: 'Arabica', category: 'variety' });
  },
  createCoffeeVariety: (_data: Record<string, unknown>, _userId: string) => Promise.resolve({}),
  updateCoffeeVariety: (_id: string, data: Record<string, unknown>, _userId: string) =>
    Promise.resolve(data),
  deleteCoffeeVariety: (_id: string, _userId: string) =>
    Promise.resolve({ message: 'Variety deleted' }),
  getRecipesForVariety: (_varietyId: string, _page: number, _perPage: number) =>
    Promise.resolve({ data: [], total: 0 }),
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

  app.route('/coffee-varieties', coffeeVarietyRouter);

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
      expect(body.meta.pagination.page).toBe(2);
      expect(body.meta.pagination.perPage).toBe(10);
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
      expect(body.data.message).toBe('Variety deleted');
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
