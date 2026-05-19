import '../../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import auth from './index.ts';
import { reloadConfig } from '../../config/env.ts';

function createTestApp() {
  const app = new Hono();
  app.route('/auth', auth);
  return app;
}

describe('Auth Routes', () => {
  describe('GET /auth/registration-status', () => {
    it('should return enabled status', async () => {
      const app = createTestApp();
      const res = await app.request('/auth/registration-status');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.enabled).toBe(true);
    });
  });

  describe('POST /auth/login with rememberMe', () => {
    it('should accept rememberMe as optional boolean in request body', async () => {
      const app = createTestApp();
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          rememberMe: true,
        }),
      });
      // Schema passes (not 400), service call may fail with different status
      expect(res.status).not.toBe(400);
    });

    it('should accept request without rememberMe field', async () => {
      const app = createTestApp();
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      });
      // Schema passes (not 400), service call may fail with different status
      expect(res.status).not.toBe(400);
    });

    it('should return 400 when rememberMe is not a boolean', async () => {
      const app = createTestApp();
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          rememberMe: 'yes',
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/refresh with rememberMe', () => {
    it('should accept rememberMe in refresh request body', async () => {
      const app = createTestApp();
      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: 'some-fake-token',
          rememberMe: true,
        }),
      });
      expect(res.status).toBe(401);
    });

    it('should accept refresh request without rememberMe', async () => {
      const app = createTestApp();
      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: 'some-fake-token',
        }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/register', () => {
    it('should return 400 for invalid body', async () => {
      const app = createTestApp();
      const res = await app.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });
      expect(res.status).toBe(400);
    });

    it('should return 403 when registration is disabled', async () => {
      const original = Deno.env.get('ENABLE_REGISTRATION');
      try {
        Deno.env.set('ENABLE_REGISTRATION', 'false');
        reloadConfig();

        const app = createTestApp();
        const res = await app.request('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'newuser@test.com',
            username: 'newuser',
            password: 'Test12345!',
          }),
        });
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('REGISTRATION_DISABLED');
      } finally {
        if (original === undefined) {
          Deno.env.delete('ENABLE_REGISTRATION');
        } else {
          Deno.env.set('ENABLE_REGISTRATION', original);
        }
        reloadConfig();
      }
    });
  });
});
