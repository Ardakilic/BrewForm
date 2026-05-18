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
} from '@brewform/shared/schemas';

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
