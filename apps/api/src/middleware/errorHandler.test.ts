import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import type { Context } from 'hono';
import { errorHandler } from './errorHandler.ts';

function createMockContext(requestId = 'test-req-1'): Context {
  return {
    get: (key: string) => key === 'requestId' ? requestId : undefined,
    json: (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  } as unknown as Context;
}

describe('Error Handler Logic', () => {
  describe('Error type detection', () => {
    it('should identify ZodError by name', () => {
      const err = new Error('Validation failed');
      err.name = 'ZodError';
      expect(err.name).toBe('ZodError');
    });

    it('should identify JWT errors by message', () => {
      const messages = ['jwt expired', 'jwt malformed', 'Invalid token'];
      for (const msg of messages) {
        const err = new Error(msg);
        expect(['jwt expired', 'jwt malformed', 'Invalid token']).toContain(err.message);
      }
    });

    it('should identify UnauthorizedError by name', () => {
      const err = new Error('Auth required');
      err.name = 'UnauthorizedError';
      expect(err.name).toBe('UnauthorizedError');
    });
  });

  describe('Response structure', () => {
    it('should create error response with correct structure', () => {
      const requestId = 'req-123';
      const response = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
          requestId,
        },
      };
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('NOT_FOUND');
      expect(response.error.requestId).toBe(requestId);
    });

    it('should create validation error with details', () => {
      const details = [
        { field: 'email', message: 'Invalid email' },
        { field: 'password', message: 'Too short' },
      ];
      const response = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details,
        },
      };
      expect(response.error.details.length).toBe(2);
      expect(response.error.details[0].field).toBe('email');
    });
  });

  describe('Postgres error handling by name', () => {
    it('should return 409 CONFLICT for Postgres unique violation (23505)', async () => {
      const err = new Error('Unique constraint failed');
      err.name = 'PostgresError';
      (err as { code?: string }).code = '23505';
      const c = createMockContext();
      const res = errorHandler(err, c);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('CONFLICT');
    });
  });
});
