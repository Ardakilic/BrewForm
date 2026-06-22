import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import {
  cursorPaginated,
  error,
  forbidden,
  notFound,
  paginated,
  success,
  unauthorized,
  validationError,
} from './index.ts';
import type { PaginationMeta } from '@brewform/shared/types';

function createMockContext(requestId: string = 'test-req-id') {
  return {
    get: (key: string) => key === 'requestId' ? requestId : null,
    json: (body: unknown, status: number) => ({ body, status }),
  } as any;
}

describe('Response Helpers', () => {
  const pagination: PaginationMeta = {
    page: 1,
    perPage: 20,
    total: 100,
    totalPages: 5,
  };

  describe('success', () => {
    it('should return success response with data', () => {
      const c = createMockContext();
      const result = success(c, { id: '1', name: 'Test' }, 200);
      expect(result.status).toBe(200);
      expect((result as any).body.success).toBe(true);
      expect((result as any).body.data).toEqual({ id: '1', name: 'Test' });
    });

    it('should include pagination meta when provided', () => {
      const c = createMockContext();
      const result = success(c, [], 200, { pagination });
      expect((result as any).body.meta.pagination).toEqual(pagination);
    });

    it('should default to status 200', () => {
      const c = createMockContext();
      const result = success(c, { ok: true });
      expect(result.status).toBe(200);
    });
  });

  describe('paginated', () => {
    it('should return paginated response', () => {
      const c = createMockContext();
      const data = [{ id: '1' }, { id: '2' }];
      const result = paginated(c, data, pagination);
      expect((result as any).body.success).toBe(true);
      expect((result as any).body.data).toEqual(data);
      expect((result as any).body.meta.pagination).toEqual(pagination);
    });
  });

  describe('error', () => {
    it('should return error response', () => {
      const c = createMockContext();
      const result = error(c, 'NOT_FOUND', 'Resource not found', 404);
      expect(result.status).toBe(404);
      expect((result as any).body.success).toBe(false);
      expect((result as any).body.error.code).toBe('NOT_FOUND');
      expect((result as any).body.error.message).toBe('Resource not found');
    });

    it('should include details when provided', () => {
      const c = createMockContext();
      const details = [{ field: 'email', message: 'Invalid email' }];
      const result = error(c, 'VALIDATION_ERROR', 'Validation failed', 400, details);
      expect((result as any).body.error.details).toEqual(details);
    });
  });

  describe('notFound', () => {
    it('should return 404 with default message', () => {
      const c = createMockContext();
      const result = notFound(c);
      expect(result.status).toBe(404);
      expect((result as any).body.error.code).toBe('NOT_FOUND');
      expect((result as any).body.error.message).toBe('Resource not found');
    });

    it('should use custom resource name', () => {
      const c = createMockContext();
      const result = notFound(c, 'Recipe');
      expect((result as any).body.error.message).toBe('Recipe not found');
    });
  });

  describe('unauthorized', () => {
    it('should return 401', () => {
      const c = createMockContext();
      const result = unauthorized(c);
      expect(result.status).toBe(401);
      expect((result as any).body.error.code).toBe('UNAUTHORIZED');
    });

    it('should use custom message', () => {
      const c = createMockContext();
      const result = unauthorized(c, 'Token expired');
      expect((result as any).body.error.message).toBe('Token expired');
    });
  });

  describe('forbidden', () => {
    it('should return 403', () => {
      const c = createMockContext();
      const result = forbidden(c);
      expect(result.status).toBe(403);
      expect((result as any).body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('validationError', () => {
    it('should return 400 with validation details', () => {
      const c = createMockContext();
      const details = [
        { field: 'email', message: 'Invalid email' },
        { field: 'password', message: 'Too short' },
      ];
      const result = validationError(c, details);
      expect(result.status).toBe(400);
      expect((result as any).body.error.code).toBe('VALIDATION_ERROR');
      expect((result as any).body.error.details).toEqual(details);
    });
  });
});

describe('paginated with headers option (D28)', () => {
  it('sets response headers when options.headers is provided', async () => {
    const app = new Hono();
    app.get('/test', (c) =>
      paginated(c, [], { page: 1, perPage: 20, total: 0, totalPages: 0 }, {
        headers: { Deprecation: 'true' },
      }));
    const res = await app.request('/test');
    expect(res.headers.get('Deprecation')).toBe('true');
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.meta.pagination).toEqual({ page: 1, perPage: 20, total: 0, totalPages: 0 });
  });

  it('does not set headers when options is not provided', async () => {
    const app = new Hono();
    app.get('/test', (c) => paginated(c, [], { page: 1, perPage: 20, total: 0, totalPages: 0 }));
    const res = await app.request('/test');
    expect(res.headers.get('Deprecation')).toBeNull();
  });
});

describe('cursorPaginated with headers option (D28)', () => {
  it('sets response headers when options.headers is provided', async () => {
    const app = new Hono();
    app.get('/test', (c) =>
      cursorPaginated(c, [], { nextCursor: null, hasMore: false }, {
        headers: { Deprecation: 'true' },
      }));
    const res = await app.request('/test');
    expect(res.headers.get('Deprecation')).toBe('true');
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.meta.cursor).toEqual({ nextCursor: null, hasMore: false });
  });

  it('does not set headers when options is not provided', async () => {
    const app = new Hono();
    app.get('/test', (c) => cursorPaginated(c, [], { nextCursor: null, hasMore: false }));
    const res = await app.request('/test');
    expect(res.headers.get('Deprecation')).toBeNull();
  });
});
