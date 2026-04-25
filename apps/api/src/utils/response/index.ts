import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { PaginationMeta } from '@brewform/shared/types';

export function success<T>(c: Context, data: T, status: ContentfulStatusCode = 200, meta?: { pagination?: PaginationMeta }) {
  return c.json({
    success: true as const,
    data,
    meta: {
      requestId: c.get('requestId'),
      ...(meta?.pagination ? { pagination: meta.pagination } : {}),
    },
  }, status);
}

export function paginated<T>(c: Context, data: T[], pagination: PaginationMeta) {
  return c.json({
    success: true as const,
    data,
    meta: {
      requestId: c.get('requestId'),
      pagination,
    },
  }, 200);
}

export function error(c: Context, code: string, message: string, status: ContentfulStatusCode, details?: Array<{ field: string; message: string }>) {
  return c.json({
    success: false as const,
    error: {
      code,
      message,
      details,
      requestId: c.get('requestId'),
    },
  }, status);
}

export function notFound(c: Context, resource: string = 'Resource') {
  return error(c, 'NOT_FOUND', `${resource} not found`, 404);
}

export function unauthorized(c: Context, message: string = 'Authentication required') {
  return error(c, 'UNAUTHORIZED', message, 401);
}

export function forbidden(c: Context, message: string = 'Insufficient permissions') {
  return error(c, 'FORBIDDEN', message, 403);
}

export function validationError(c: Context, details: Array<{ field: string; message: string }>) {
  return error(c, 'VALIDATION_ERROR', 'Validation failed', 400, details);
}