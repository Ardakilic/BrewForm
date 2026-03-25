/**
 * Logger Middleware Tests
 */

import { beforeEach, describe, it } from '@std/testing';
import { expect } from '@std/expect';
import { Hono } from 'hono';
import { loggerMiddleware } from './_impl/logger.ts';
import * as loggerMock from '../test/mocks/logger.ts';

describe('Logger Middleware', () => {
  let logger: ReturnType<typeof loggerMock.getLogger>;

  beforeEach(() => {
    logger = loggerMock.getLogger();
    logger.debug.calls = [];
    logger.info.calls = [];
    logger.warn.calls = [];
    logger.error.calls = [];
  });

  describe('loggerMiddleware', () => {
    it('should log request and response phases', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('requestId', 'test-request-123');
        await next();
      });
      app.use('*', loggerMiddleware);
      app.get('/test', (c) => c.json({ success: true }));

      await app.request('/test');

      expect(logger.debug.calls.length).toBeGreaterThan(0);
      expect(logger.info.calls.length).toBeGreaterThan(0);

      const debugCall = logger.debug.calls[0];
      expect(debugCall.args[0]).toMatchObject({
        type: 'http',
        phase: 'request',
        requestId: 'test-request-123',
        method: 'GET',
        path: '/test',
      });

      const infoCall = logger.info.calls[0];
      expect(infoCall.args[0]).toMatchObject({
        type: 'http',
        phase: 'response',
        requestId: 'test-request-123',
        method: 'GET',
        path: '/test',
        status: 200,
      });
      expect(infoCall.args[0].duration).toBeDefined();
    });

    it('should use "unknown" when requestId is not set', async () => {
      const app = new Hono();
      app.use('*', loggerMiddleware);
      app.get('/test', (c) => c.json({ success: true }));

      await app.request('/test');

      const debugCall = logger.debug.calls[0];
      expect(debugCall.args[0].requestId).toBe('unknown');

      const infoCall = logger.info.calls[0];
      expect(infoCall.args[0].requestId).toBe('unknown');
    });

    it('should log with error level for 5xx status codes', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('requestId', 'error-request');
        await next();
      });
      app.use('*', loggerMiddleware);
      app.get('/test', (c) => c.json({ error: 'Server error' }, 500));

      await app.request('/test');

      expect(logger.error.calls.length).toBeGreaterThan(0);
      const errorCall = logger.error.calls[0];
      expect(errorCall.args[0]).toMatchObject({
        type: 'http',
        phase: 'response',
        status: 500,
      });
    });

    it('should log with warn level for 4xx status codes', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('requestId', 'warn-request');
        await next();
      });
      app.use('*', loggerMiddleware);
      app.get('/test', (c) => c.json({ error: 'Not found' }, 404));

      await app.request('/test');

      expect(logger.warn.calls.length).toBeGreaterThan(0);
      const warnCall = logger.warn.calls[0];
      expect(warnCall.args[0]).toMatchObject({
        type: 'http',
        phase: 'response',
        status: 404,
      });
    });

    it('should include userId when user is authenticated', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('requestId', 'auth-request');
        c.set('user', {
          id: 'user_123',
          email: 'test@example.com',
          username: 'testuser',
          isAdmin: false,
          isBanned: false,
        });
        await next();
      });
      app.use('*', loggerMiddleware);
      app.get('/test', (c) => c.json({ success: true }));

      await app.request('/test');

      const infoCall = logger.info.calls[0];
      expect(infoCall.args[0].userId).toBe('user_123');
    });

    it('should measure request duration', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('requestId', 'duration-test');
        await next();
      });
      app.use('*', loggerMiddleware);
      app.get('/test', async (c) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return c.json({ success: true });
      });

      await app.request('/test');

      const infoCall = logger.info.calls[0];
      expect(infoCall.args[0].duration).toBeGreaterThanOrEqual(10);
    });
  });
});
