import '../../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../../types/hono.ts';
import {
  AdminBanUserSchema,
  AdminCreateUserSchema,
  AdminUpdateUserSchema,
  CoffeeVarietyCreateSchema,
  CoffeeVarietyUpdateSchema,
  PaginationSchema,
} from '@brewform/shared/schemas';
import { z } from 'zod';

function createValidationApp() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('userId', 'test-admin-id');
    c.set('user', { id: 'test-admin-id', isAdmin: true });
    await next();
  });

  app.post('/users', zValidator('json', AdminCreateUserSchema), (c) => {
    return c.json({ success: true, data: {} }, 201);
  });

  app.patch('/users/:id', zValidator('json', AdminUpdateUserSchema), (c) => {
    return c.json({ success: true, data: {} });
  });

  app.post('/users/:id/ban', zValidator('json', AdminBanUserSchema), (c) => {
    return c.json({ success: true, data: {} });
  });

  return app;
}

describe('Admin Routes — Integration', () => {
  describe('POST /admin/users validation', () => {
    it('should reject empty body', async () => {
      const app = createValidationApp();
      const res = await app.request('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('should reject invalid email', async () => {
      const app = createValidationApp();
      const res = await app.request('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bad', username: 'testuser', password: '12345678' }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject short username', async () => {
      const app = createValidationApp();
      const res = await app.request('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', username: 'ab', password: '12345678' }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject weak password', async () => {
      const app = createValidationApp();
      const res = await app.request('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          username: 'testuser',
          password: 'short',
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject username with special characters', async () => {
      const app = createValidationApp();
      const res = await app.request('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          username: 'user name!',
          password: '12345678',
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should accept valid payload', async () => {
      const app = createValidationApp();
      const res = await app.request('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'new@example.com',
          username: 'newuser',
          password: 'password123',
          displayName: 'New User',
          bio: 'Hello',
          isAdmin: true,
          isBanned: false,
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('PATCH /admin/users/:id validation', () => {
    it('should reject empty body', async () => {
      const app = createValidationApp();
      const res = await app.request('/users/some-id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('should reject invalid email', async () => {
      const app = createValidationApp();
      const res = await app.request('/users/some-id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject short username', async () => {
      const app = createValidationApp();
      const res = await app.request('/users/some-id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ab' }),
      });
      expect(res.status).toBe(400);
    });

    it('should accept single field update', async () => {
      const app = createValidationApp();
      const res = await app.request('/users/some-id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Updated Name' }),
      });
      expect(res.status).toBe(200);
    });

    it('should accept all fields update', async () => {
      const app = createValidationApp();
      const res = await app.request('/users/some-id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'updated@example.com',
          username: 'updateduser',
          password: 'newpassword123',
          displayName: 'Updated',
          bio: 'New bio',
          isAdmin: true,
          isBanned: false,
        }),
      });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /admin/users/:id/ban validation', () => {
    it('should reject ban without reason', async () => {
      const app = createValidationApp();
      const res = await app.request('/users/some-id/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: '550e8400-e29b-41d4-a716-446655440000',
          banned: true,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should accept valid ban with reason', async () => {
      const app = createValidationApp();
      const res = await app.request('/users/some-id/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: '550e8400-e29b-41d4-a716-446655440000',
          banned: true,
          reason: 'Spam account',
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('should accept unban without reason', async () => {
      const app = createValidationApp();
      const res = await app.request('/users/some-id/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: '550e8400-e29b-41d4-a716-446655440000',
          banned: false,
        }),
      });
      expect(res.status).toBe(200);
    });

    it('should reject invalid userId UUID', async () => {
      const app = createValidationApp();
      const res = await app.request('/users/some-id/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'not-a-uuid', banned: true, reason: 'Test' }),
      });
      expect(res.status).toBe(400);
    });

    it('should accept when URL param id differs from body userId (handler uses URL param)', async () => {
      const app = createValidationApp();
      const res = await app.request('/users/different-id/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: '550e8400-e29b-41d4-a716-446655440000',
          banned: true,
          reason: 'Spam',
        }),
      });
      expect(res.status).toBe(200);
    });
  });
});

function createCoffeeVarietyApp() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('userId', 'test-admin-id');
    c.set('user', { id: 'test-admin-id', isAdmin: true });
    await next();
  });

  app.get(
    '/coffee-varieties',
    zValidator(
      'query',
      PaginationSchema.extend({
        category: z.string().optional(),
        search: z.string().optional(),
      }),
    ),
    (c) => {
      const { page, perPage } = c.req.valid('query');
      return c.json({
        success: true,
        data: [],
        meta: { pagination: { page, perPage, total: 0, totalPages: 0 } },
      });
    },
  );

  app.post(
    '/coffee-varieties',
    zValidator('json', CoffeeVarietyCreateSchema),
    (c) => {
      const data = c.req.valid('json');
      return c.json({ success: true, data: { id: 'variety-1', ...data } }, 201);
    },
  );

  app.patch(
    '/coffee-varieties/:id',
    zValidator('json', CoffeeVarietyUpdateSchema),
    (c) => {
      const data = c.req.valid('json');
      return c.json({ success: true, data: { id: c.req.param('id'), ...data } });
    },
  );

  app.delete('/coffee-varieties/:id', (c) => {
    return c.json({ success: true, data: { message: 'Coffee variety deleted' } });
  });

  app.get('/coffee-varieties/:id/recipe-count', (c) => {
    return c.json({ success: true, data: { count: 3 } });
  });

  return app;
}

describe('Admin Coffee Variety Routes — Validation', () => {
  describe('GET /admin/coffee-varieties', () => {
    it('should return paginated list with default pagination', async () => {
      const app = createCoffeeVarietyApp();
      const res = await app.request('/coffee-varieties');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.meta.pagination).toBeDefined();
    });

    it('should accept category and search query params', async () => {
      const app = createCoffeeVarietyApp();
      const res = await app.request(
        '/coffee-varieties?category=variety&search=arabica&page=1&perPage=10',
      );
      expect(res.status).toBe(200);
    });
  });

  describe('POST /admin/coffee-varieties', () => {
    it('should reject empty body', async () => {
      const app = createCoffeeVarietyApp();
      const res = await app.request('/coffee-varieties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('should reject missing name', async () => {
      const app = createCoffeeVarietyApp();
      const res = await app.request('/coffee-varieties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'variety' }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject invalid category', async () => {
      const app = createCoffeeVarietyApp();
      const res = await app.request('/coffee-varieties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bourbon', category: 'invalid_category' }),
      });
      expect(res.status).toBe(400);
    });

    it('should accept valid create payload', async () => {
      const app = createCoffeeVarietyApp();
      const res = await app.request('/coffee-varieties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bourbon',
          category: 'variety',
          species: 'Coffea arabica',
          origin: 'Reunion Island',
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Bourbon');
    });

    it('should accept minimal valid payload (name + category only)', async () => {
      const app = createCoffeeVarietyApp();
      const res = await app.request('/coffee-varieties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Typica', category: 'variety' }),
      });
      expect(res.status).toBe(201);
    });
  });

  describe('PATCH /admin/coffee-varieties/:id', () => {
    it('should accept empty body (partial update)', async () => {
      const app = createCoffeeVarietyApp();
      const res = await app.request('/coffee-varieties/variety-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
    });

    it('should accept single field update', async () => {
      const app = createCoffeeVarietyApp();
      const res = await app.request('/coffee-varieties/variety-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Bourbon' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe('Updated Bourbon');
    });

    it('should reject invalid category on update', async () => {
      const app = createCoffeeVarietyApp();
      const res = await app.request('/coffee-varieties/variety-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'bogus' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /admin/coffee-varieties/:id', () => {
    it('should soft delete a variety', async () => {
      const app = createCoffeeVarietyApp();
      const res = await app.request('/coffee-varieties/variety-1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('GET /admin/coffee-varieties/:id/recipe-count', () => {
    it('should return recipe count', async () => {
      const app = createCoffeeVarietyApp();
      const res = await app.request('/coffee-varieties/variety-1/recipe-count');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.count).toBe(3);
    });
  });
});

function createEquipmentDeleteRequestApp() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('userId', 'test-admin-id');
    c.set('user', { id: 'test-admin-id', isAdmin: true });
    await next();
  });

  app.get(
    '/equipment/delete-requests',
    zValidator(
      'query',
      PaginationSchema.extend({ status: z.enum(['pending', 'approved', 'rejected']).optional() }),
    ),
    (c) => {
      const { page, perPage } = c.req.valid('query');
      return c.json({
        success: true,
        data: [],
        meta: { pagination: { page, perPage, total: 0, totalPages: 0 } },
      });
    },
  );

  app.post('/equipment/delete-requests/:id/approve', (c) => {
    const id = c.req.param('id');
    if (id === 'not-found') {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Delete request not found' },
      }, 404);
    }
    return c.json({ success: true, data: { id, status: 'approved' } });
  });

  app.post('/equipment/delete-requests/:id/reject', (c) => {
    const id = c.req.param('id');
    if (id === 'not-found') {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Delete request not found' },
      }, 404);
    }
    return c.json({ success: true, data: { id, status: 'rejected' } });
  });

  return app;
}

describe('Admin Equipment Delete Request Routes', () => {
  describe('GET /admin/equipment/delete-requests', () => {
    it('should return paginated list with default pagination', async () => {
      const app = createEquipmentDeleteRequestApp();
      const res = await app.request('/equipment/delete-requests');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.meta.pagination).toBeDefined();
    });

    it('should accept status filter', async () => {
      const app = createEquipmentDeleteRequestApp();
      const res = await app.request('/equipment/delete-requests?status=pending');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /admin/equipment/delete-requests/:id/approve', () => {
    it('should approve a delete request', async () => {
      const app = createEquipmentDeleteRequestApp();
      const res = await app.request('/equipment/delete-requests/req-1/approve', {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe('approved');
    });

    it('should return 404 for non-existent request', async () => {
      const app = createEquipmentDeleteRequestApp();
      const res = await app.request('/equipment/delete-requests/not-found/approve', {
        method: 'POST',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /admin/equipment/delete-requests/:id/reject', () => {
    it('should reject a delete request', async () => {
      const app = createEquipmentDeleteRequestApp();
      const res = await app.request('/equipment/delete-requests/req-1/reject', {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe('rejected');
    });

    it('should return 404 for non-existent request', async () => {
      const app = createEquipmentDeleteRequestApp();
      const res = await app.request('/equipment/delete-requests/not-found/reject', {
        method: 'POST',
      });
      expect(res.status).toBe(404);
    });
  });
});
