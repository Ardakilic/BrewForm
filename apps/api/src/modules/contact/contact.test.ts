import '../../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import contact from './index.ts';

function createTestApp() {
  const app = new Hono();
  app.route('/api/v1/contact', contact);
  return app;
}

const VALID = {
  name: 'Test User',
  email: 'test@example.com',
  subject: 'Bug report',
  message: 'This is a test message longer than ten chars.',
};

describe('POST /api/v1/contact', () => {
  it('returns 200 with valid payload', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 400 when message is shorter than 10 chars', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID, message: 'short' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when email is malformed', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID, email: 'not-an-email' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 429 on the 4th request within the rate-limit window', async () => {
    const app = createTestApp();
    for (let i = 0; i < 3; i++) {
      await app.request('/api/v1/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID),
      });
    }
    const res = await app.request('/api/v1/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID),
    });
    expect(res.status).toBe(429);
  });
});
