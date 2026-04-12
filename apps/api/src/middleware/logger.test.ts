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
  let callCountBefore: {
    debug: number;
    info: number;
    warn: number;
    error: number;
  };

  beforeEach(() => {
    logger = loggerMock.getLogger();
    callCountBefore = {
      debug: logger.debug.calls.length,
      info: logger.info.calls.length,
      warn: logger.warn.calls.length,
      error: logger.error.calls.length,
    };
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

      const debugCalls = logger.debug.calls.slice(callCountBefore.debug);
      const infoCalls = logger.info.calls.slice(callCountBefore.info);
      expect(debugCalls.length).toBeGreaterThan(0);
      expect(infoCalls.length).toBeGreaterThan(0);

      expect(debugCalls[0].args[0]).toMatchObject({
        type: 'http',
        phase: 'request',
        requestId: 'test-request-123',
        method: 'GET',
        path: '/test',
      });

      expect(infoCalls[0].args[0]).toMatchObject({
        type: 'http',
        phase: 'response',
        requestId: 'test-request-123',
        method: 'GET',
        path: '/test',
        status: 200,
      });
      expect(infoCalls[0].args[0].duration).toBeDefined();
    });

    it('should use "unknown" when requestId is not set', async () => {
      const app = new Hono();
      app.use('*', loggerMiddleware);
      app.get('/test', (c) => c.json({ success: true }));

      await app.request('/test');

      const debugCalls = logger.debug.calls.slice(callCountBefore.debug);
      const infoCalls = logger.info.calls.slice(callCountBefore.info);
      expect(debugCalls[0].args[0].requestId).toBe('unknown');
      expect(infoCalls[0].args[0].requestId).toBe('unknown');
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

      const errorCalls = logger.error.calls.slice(callCountBefore.error);
      expect(errorCalls.length).toBeGreaterThan(0);
      expect(errorCalls[0].args[0]).toMatchObject({
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

      const warnCalls = logger.warn.calls.slice(callCountBefore.warn);
      expect(warnCalls.length).toBeGreaterThan(0);
      expect(warnCalls[0].args[0]).toMatchObject({
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

      const infoCalls = logger.info.calls.slice(callCountBefore.info);
      expect(infoCalls[0].args[0].userId).toBe('user_123');
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

      const infoCalls = logger.info.calls.slice(callCountBefore.info);
      expect(infoCalls[0].args[0].duration).toBeGreaterThanOrEqual(10);
    });
  });
});
