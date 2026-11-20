import '../../test-setup.ts';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { log as rateLimitLog } from '../../middleware/rateLimit.ts';
import { log as clientIpLog } from '../../utils/client-ip/index.ts';
import { peerEnv, uniqueTestIp } from '../../utils/client-ip/test-helpers.ts';
import { resetRateLimitBackend } from '../../utils/rate-limit/registry.ts';
import contact from './index.ts';

/** The contact router behind a requestId middleware (as in the main stack). */
function createTestApp() {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('requestId' as never, crypto.randomUUID() as never);
    await next();
  });
  app.route('/api/v1/contact', contact);
  return app;
}

/**
 * POST a contact message from the simulated client `ip`.
 *
 * @param app - The test app.
 * @param ip - The simulated TCP peer.
 * @param body - The request body.
 * @param headers - Extra headers.
 */
function postContact(app: Hono, ip: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(
    '/api/v1/contact',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
    peerEnv(ip),
  );
}

const VALID = {
  name: 'Test User',
  email: 'test@example.com',
  subject: 'Bug report',
  message: 'This is a test message longer than ten chars.',
};

describe('POST /api/v1/contact', () => {
  beforeEach(() => {
    resetRateLimitBackend();
    vi.spyOn(rateLimitLog, 'warn').mockImplementation(() => {});
    vi.spyOn(clientIpLog, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 with valid payload', async () => {
    const app = createTestApp();
    const res = await postContact(app, uniqueTestIp(), VALID);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 400 when message is shorter than 10 chars', async () => {
    const app = createTestApp();
    const res = await postContact(app, uniqueTestIp(), { ...VALID, message: 'short' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when email is malformed', async () => {
    const app = createTestApp();
    const res = await postContact(app, uniqueTestIp(), { ...VALID, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('returns 429 with the envelope and Retry-After on the 4th request within the window', async () => {
    const app = createTestApp();
    const ip = uniqueTestIp();
    for (let i = 0; i < 3; i++) {
      expect((await postContact(app, ip, VALID)).status).toBe(200);
    }
    const res = await postContact(app, ip, VALID);
    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(900);
    const body = await res.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.requestId).toEqual(expect.any(String));
    expect(body.error.message).toBe('Too many contact messages, please try again later');
  });

  it('shares one bucket across random X-Forwarded-For values from one peer', async () => {
    const app = createTestApp();
    const ip = uniqueTestIp();
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await postContact(app, ip, VALID, {
        'x-forwarded-for': `${10 + i}.0.0.${i + 1}, spoof-${crypto.randomUUID()}`,
      });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it('does not throttle a second client IP', async () => {
    const app = createTestApp();
    const ip = uniqueTestIp();
    for (let i = 0; i < 4; i++) await postContact(app, ip, VALID);
    expect((await postContact(app, uniqueTestIp(), VALID)).status).toBe(200);
  });
});
