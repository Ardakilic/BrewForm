/**
 * Request ID Middleware Tests
 */

import { describe, it } from '@std/testing';
import { expect } from '@std/expect';
import { Hono } from 'hono';
import { requestIdMiddleware } from './_impl/requestId.ts';

describe('Request ID Middleware', () => {
  describe('requestIdMiddleware', () => {
    it('should generate a new request ID when none is provided', async () => {
      const app = new Hono();
      app.use('*', requestIdMiddleware);
      app.get('/test', (c) => c.json({ requestId: c.get('requestId') }));

      const response = await app.request('/test');
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.requestId).toBeDefined();
      expect(typeof body.requestId).toBe('string');
      expect(body.requestId.length).toBe(21);
      expect(response.headers.get('X-Request-ID')).toBe(body.requestId);
    });

    it('should reuse existing X-Request-ID header', async () => {
      const app = new Hono();
      app.use('*', requestIdMiddleware);
      app.get('/test', (c) => c.json({ requestId: c.get('requestId') }));

      const existingId = 'existing-request-id-123';
      const response = await app.request('/test', {
        headers: {
          'X-Request-ID': existingId,
        },
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.requestId).toBe(existingId);
      expect(response.headers.get('X-Request-ID')).toBe(existingId);
    });

    it('should set request ID in context and response header', async () => {
      const app = new Hono();
      app.use('*', requestIdMiddleware);
      app.get('/test', (c) => {
        const requestId = c.get('requestId');
        return c.json({ contextId: requestId });
      });

      const response = await app.request('/test');
      const body = await response.json();
      const headerId = response.headers.get('X-Request-ID');

      expect(body.contextId).toBeDefined();
      expect(headerId).toBeDefined();
      expect(body.contextId).toBe(headerId);
    });
  });
});
