import '../test-setup.ts';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryCacheProvider } from '../utils/cache/index.ts';
import { setCacheProvider } from '../utils/cache/singleton.ts';
import { authRateLimitMiddleware, log, rateLimitMiddleware } from './rateLimit.ts';

describe('Rate Limit Middleware', () => {
  beforeEach(() => {
    setCacheProvider(new InMemoryCacheProvider());
  });

  function setupSpies() {
    return {
      debug: vi.spyOn(log, 'debug'),
      warn: vi.spyOn(log, 'warn'),
      error: vi.spyOn(log, 'error'),
    };
  }

  function restoreSpies(spies: ReturnType<typeof setupSpies>) {
    spies.debug.mockRestore();
    spies.warn.mockRestore();
    spies.error.mockRestore();
  }

  describe('rateLimitMiddleware', () => {
    function buildApp(limit: number) {
      const app = new Hono<{ Variables: { requestId: string } }>();
      app.use('/test', (c, next) => {
        c.set('requestId', 'req-test-1');
        return next();
      });
      app.use('/test', rateLimitMiddleware({ maxRequests: limit, windowMs: 60_000 }));
      app.get('/test', (c) => c.text('ok'));
      return app;
    }

    it('passes below limit without warning', async () => {
      const spies = setupSpies();
      try {
        const res = await buildApp(2).request('/test', {
          headers: { 'x-forwarded-for': '1.2.3.4' },
        });

        expect(res.status).toBe(200);
        expect(spies.warn).toHaveBeenCalledTimes(0);
      } finally {
        restoreSpies(spies);
      }
    });

    it('warns and returns 429 when limit is exceeded', async () => {
      const spies = setupSpies();
      try {
        const app = buildApp(2);
        const ip = '1.2.3.4';

        await app.request('/test', { headers: { 'x-forwarded-for': ip } });
        await app.request('/test', { headers: { 'x-forwarded-for': ip } });
        const res = await app.request('/test', { headers: { 'x-forwarded-for': ip } });
        const body = await res.json();

        expect(res.status).toBe(429);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('RATE_LIMITED');
        expect(body.error.requestId).toBe('req-test-1');
        expect(spies.warn).toHaveBeenCalledTimes(1);
        expect(spies.warn).toHaveBeenNthCalledWith(
          1,
          { limit: 2 },
          'rateLimitMiddleware rate limit exceeded',
        );
      } finally {
        restoreSpies(spies);
      }
    });
  });

  describe('authRateLimitMiddleware', () => {
    function buildApp(limit: number) {
      const app = new Hono<{ Variables: { userId: string; requestId: string } }>();
      app.use('/test', (c, next) => {
        c.set('userId', 'user-123');
        c.set('requestId', 'req-test-1');
        return next();
      });
      app.use('/test', authRateLimitMiddleware({ maxAttempts: limit, windowMs: 60_000 }));
      app.get('/test', (c) => c.text('ok'));
      return app;
    }

    it('passes below limit without warning', async () => {
      const spies = setupSpies();
      try {
        const res = await buildApp(2).request('/test', {
          headers: { 'x-forwarded-for': '5.6.7.8' },
        });

        expect(res.status).toBe(200);
        expect(spies.warn).toHaveBeenCalledTimes(0);
      } finally {
        restoreSpies(spies);
      }
    });

    it('warns and returns 429 when limit is exceeded', async () => {
      const spies = setupSpies();
      try {
        const app = buildApp(2);
        const ip = '5.6.7.8';

        await app.request('/test', { headers: { 'x-forwarded-for': ip } });
        await app.request('/test', { headers: { 'x-forwarded-for': ip } });
        const res = await app.request('/test', { headers: { 'x-forwarded-for': ip } });
        const body = await res.json();

        expect(res.status).toBe(429);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('RATE_LIMITED');
        expect(body.error.requestId).toBe('req-test-1');
        expect(spies.warn).toHaveBeenCalledTimes(1);
        expect(spies.warn).toHaveBeenNthCalledWith(
          1,
          { userId: 'user-123', limit: 2 },
          'authRateLimitMiddleware rate limit exceeded',
        );
      } finally {
        restoreSpies(spies);
      }
    });
  });
});
