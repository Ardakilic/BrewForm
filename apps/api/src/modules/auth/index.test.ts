import { afterAll, describe, it } from 'jsr:@std/testing/bdd';
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
  afterAll(() => {
    Deno.env.delete('ENABLE_REGISTRATION');
    reloadConfig();
  });

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
      Deno.env.set('ENABLE_REGISTRATION', 'false');
      reloadConfig();

      const app = createTestApp();
      const res = await app.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'newuser@test.com', username: 'newuser', password: 'Test12345!' }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('REGISTRATION_DISABLED');
    });
  });
});
