/**
 * Consistent JSON response envelope helpers for the BrewForm API.
 *
 * Every response follows { success, data, meta } or { success, error }
 * with a requestId for distributed tracing. Use ContentfulStatusCode
 * (not StatusCode) — StatusCode includes 1xx codes which aren't valid
 * for JSON responses and cause type narrowing errors.
 */
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { PaginationMeta } from '@brewform/shared/types';

/** Return a success envelope with optional pagination metadata. */
export function success<T>(
  c: Context,
  data: T,
  status: ContentfulStatusCode = 200,
  meta?: { pagination?: PaginationMeta },
) {
  return c.json({
    success: true as const,
    data,
    meta: {
      requestId: c.get('requestId'),
      ...(meta?.pagination ? { pagination: meta.pagination } : {}),
    },
  }, status);
}

/** Return a success envelope with pagination metadata. Shorthand for success() with pagination. */
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

/** Return an error envelope with code, message, and optional field-level details. */
export function error(
  c: Context,
  code: string,
  message: string,
  status: ContentfulStatusCode,
  details?: Array<{ field: string; message: string }>,
) {
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

/**
 * Hook for @hono/zod-validator that formats Zod issues into our standard
 * { success: false, error: { code, message, details } } envelope instead of
 * returning the raw ZodError object.
 */
export function zodValidationHook(
  result: {
    success: boolean;
    error?: { issues: Array<{ path: (string | number | symbol)[]; message: string }> };
  },
  c: Context,
): Response | undefined {
  if (!result.success && result.error) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return validationError(c, details);
  }
}
