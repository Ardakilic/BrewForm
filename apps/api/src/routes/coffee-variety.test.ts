import '../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { AppEnv } from '../types/hono.ts';
import coffeeVarietyRouter, { deps } from '../modules/coffee-variety/index.ts';

const mockService = {
  listCoffeeVarieties: () => Promise.resolve({ data: [], total: 0 }),
};

const originalDeps = {
  authMiddleware: deps.authMiddleware,
  service: deps.service,
};

beforeEach(() => {
  deps.authMiddleware = async (_c: Context, next: Next) => {
    await next();
  };

  deps.service = { ...deps.service, ...mockService } as typeof deps.service;
});

afterEach(() => {
  deps.authMiddleware = originalDeps.authMiddleware;
  deps.service = originalDeps.service;
});

function createTestApp() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    c.set('userId', 'test-user-id');
    c.set('user', { id: 'test-user-id', isAdmin: false } as any);
    await next();
  });

  app.route('/api/v1/coffee-varieties', coffeeVarietyRouter);

  return app;
}

describe('Coffee Variety Route Registration', () => {
  const app = createTestApp();

  it('GET /api/v1/coffee-varieties returns a response (not 404)', async () => {
    const res = await app.request('/api/v1/coffee-varieties');
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('GET /api/v1/coffee-varieties/search?q=test returns a response', async () => {
    const res = await app.request('/api/v1/coffee-varieties/search?q=test');
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('GET /api/v1/coffee-varieties/search rejects short query', async () => {
    const res = await app.request('/api/v1/coffee-varieties/search?q=a');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.name).toBe('ZodError');
    expect(body.error.message).toBeDefined();
  });

  it('GET /api/v1/coffee-varieties accepts pagination params', async () => {
    const res = await app.request('/api/v1/coffee-varieties?page=2&perPage=10');
    expect(res.status).toBe(200);
  });

  it('GET /api/v1/coffee-varieties accepts category and search filters', async () => {
    const res = await app.request('/api/v1/coffee-varieties?category=variety&search=bourbon');
    expect(res.status).toBe(200);
  });
});
