import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { z } from 'zod';
import {
  cursorEnvelope,
  CursorPaginationMetaSchema,
  ErrorEnvelopeSchema,
  paginatedEnvelope,
  PaginationMetaSchema,
  successEnvelope,
} from './response.ts';

describe('ErrorEnvelopeSchema', () => {
  it('parses a representative error() output (with details)', () => {
    // Mirrors error(c, 'VALIDATION_ERROR', 'Validation failed', 400, details)
    const payload = {
      success: false as const,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [{ field: 'name', message: 'Required' }],
        requestId: 'req-123',
      },
    };
    const result = ErrorEnvelopeSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(payload);
    }
  });

  it('parses an error() output without details (optional field omitted)', () => {
    // Mirrors notFound(c) → error(c, 'NOT_FOUND', '...', 404) with details undefined
    const payload = {
      success: false as const,
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        requestId: 'req-456',
      },
    };
    const result = ErrorEnvelopeSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('rejects when success is true (wrong discriminant)', () => {
    const result = ErrorEnvelopeSchema.safeParse({
      success: true,
      error: { code: 'X', message: 'Y', requestId: 'z' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects when a required field (requestId) is missing', () => {
    const result = ErrorEnvelopeSchema.safeParse({
      success: false,
      error: { code: 'X', message: 'Y' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('requestId'))).toBe(true);
    }
  });
});

describe('PaginationMetaSchema', () => {
  it('parses valid pagination metadata', () => {
    const result = PaginationMetaSchema.safeParse({
      page: 1,
      perPage: 20,
      total: 42,
      totalPages: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejects page < 1', () => {
    const result = PaginationMetaSchema.safeParse({
      page: 0,
      perPage: 20,
      total: 0,
      totalPages: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('page'))).toBe(true);
    }
  });

  it('rejects total < 0', () => {
    const result = PaginationMetaSchema.safeParse({
      page: 1,
      perPage: 20,
      total: -1,
      totalPages: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('total'))).toBe(true);
    }
  });

  it('rejects non-integer page', () => {
    const result = PaginationMetaSchema.safeParse({
      page: 1.5,
      perPage: 20,
      total: 0,
      totalPages: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('successEnvelope(dataSchema)', () => {
  const schema = successEnvelope(z.object({ id: z.string(), name: z.string() }));

  it('parses a representative success() output', () => {
    // Mirrors success(c, data) → { success:true, data, meta:{ requestId } }
    const payload = {
      success: true as const,
      data: { id: 'bean-1', name: 'Ethiopia Yirgacheffe' },
      meta: { requestId: 'req-789' },
    };
    const result = schema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(payload);
    }
  });

  it('rejects when the wrapped data fails the supplied schema', () => {
    const result = schema.safeParse({
      success: true,
      data: { id: 'bean-1' },
      meta: { requestId: 'req-789' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });

  it('rejects when meta.requestId is missing', () => {
    const result = schema.safeParse({
      success: true,
      data: { id: 'bean-1', name: 'X' },
      meta: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('CursorPaginationMetaSchema', () => {
  it('parses a representative cursor meta without total', () => {
    const result = CursorPaginationMetaSchema.safeParse({
      nextCursor: 'eyJjcmVhdGVkQXQiOiIyMDI2LTA1LTI5VDEwOjMwOjAwLjAwMFoiLCJpZCI6ImFiYy0xMjMifQ==',
      hasMore: true,
    });
    expect(result.success).toBe(true);
  });

  it('parses a representative cursor meta with total', () => {
    const result = CursorPaginationMetaSchema.safeParse({
      nextCursor: null,
      hasMore: false,
      total: 42,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid total', () => {
    const result = CursorPaginationMetaSchema.safeParse({
      nextCursor: null,
      hasMore: false,
      total: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe('paginatedEnvelope(itemSchema)', () => {
  const schema = paginatedEnvelope(z.object({ id: z.string() }));

  it('parses a representative paginated() output', () => {
    // Mirrors paginated(c, items, pagination)
    const payload = {
      success: true as const,
      data: [{ id: 'a' }, { id: 'b' }],
      meta: {
        requestId: 'req-abc',
        pagination: { page: 1, perPage: 20, total: 2, totalPages: 1 },
      },
    };
    const result = schema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(payload);
    }
  });

  it('accepts an empty data array', () => {
    const result = schema.safeParse({
      success: true,
      data: [],
      meta: {
        requestId: 'req-abc',
        pagination: { page: 1, perPage: 20, total: 0, totalPages: 0 },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects out-of-bounds pagination meta (page < 1)', () => {
    const result = schema.safeParse({
      success: true,
      data: [],
      meta: {
        requestId: 'req-abc',
        pagination: { page: 0, perPage: 20, total: 0, totalPages: 0 },
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects when pagination meta is missing', () => {
    const result = schema.safeParse({
      success: true,
      data: [],
      meta: { requestId: 'req-abc' },
    });
    expect(result.success).toBe(false);
  });
});

describe('cursorEnvelope(itemSchema)', () => {
  const schema = cursorEnvelope(z.object({ id: z.string() }));

  it('parses a representative cursorPaginated() output', () => {
    const payload = {
      success: true as const,
      data: [{ id: 'a' }, { id: 'b' }],
      meta: {
        requestId: 'req-abc',
        cursor: { nextCursor: 'abc', hasMore: true },
      },
    };
    const result = schema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(payload);
    }
  });

  it('accepts a null nextCursor', () => {
    const result = schema.safeParse({
      success: true,
      data: [{ id: 'a' }],
      meta: {
        requestId: 'req-abc',
        cursor: { nextCursor: null, hasMore: false },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects when cursor meta is missing', () => {
    const result = schema.safeParse({
      success: true,
      data: [{ id: 'a' }],
      meta: { requestId: 'req-abc' },
    });
    expect(result.success).toBe(false);
  });
});
