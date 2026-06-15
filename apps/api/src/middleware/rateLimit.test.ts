import '../test-setup.ts';
import { beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { assertSpyCallArgs, assertSpyCalls, spy } from 'jsr:@std/testing/mock';
import { Hono } from 'hono';
import { InMemoryCacheProvider } from '../utils/cache/index.ts';
import { setCacheProvider } from '../utils/cache/singleton.ts';
import { authRateLimitMiddleware, log, rateLimitMiddleware } from './rateLimit.ts';

describe('Rate Limit Middleware', { sanitizeOps: false, sanitizeResources: false }, () => {
  beforeEach(() => {
    setCacheProvider(new InMemoryCacheProvider());
  });

  function setupSpies() {
    return {
      debug: spy(log, 'debug'),
      warn: spy(log, 'warn'),
      error: spy(log, 'error'),
    };
  }

  function restoreSpies(spies: ReturnType<typeof setupSpies>) {
    spies.debug.restore();
    spies.warn.restore();
    spies.error.restore();
  }

  describe('rateLimitMiddleware', () => {
    function buildApp(limit: number) {
      const app = new Hono();
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
        assertSpyCalls(spies.warn, 0);
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
        assertSpyCalls(spies.warn, 1);
        assertSpyCallArgs(spies.warn, 0, [
          { limit: 2 },
          'rateLimitMiddleware rate limit exceeded',
        ]);
      } finally {
        restoreSpies(spies);
      }
    });
  });

  describe('authRateLimitMiddleware', () => {
    function buildApp(limit: number) {
      const app = new Hono<{ Variables: { userId: string } }>();
      app.use('/test', (c, next) => {
        c.set('userId', 'user-123');
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
        assertSpyCalls(spies.warn, 0);
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
        assertSpyCalls(spies.warn, 1);
        assertSpyCallArgs(spies.warn, 0, [
          { userId: 'user-123', limit: 2 },
          'authRateLimitMiddleware rate limit exceeded',
        ]);
      } finally {
        restoreSpies(spies);
      }
    });
  });
});
