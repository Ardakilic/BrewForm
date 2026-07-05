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
import type { CursorPaginationMeta, PaginationMeta } from '@brewform/shared/types';

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

/**
 * Return a success envelope with pagination metadata and optional response
 * headers. Shorthand for success() with pagination.
 *
 * @param c - Hono request context.
 * @param data - Items on the current page.
 * @param pagination - Offset pagination metadata.
 * @param options - Optional response headers (e.g., `Deprecation`).
 */
export function paginated<T>(
  c: Context,
  data: T[],
  pagination: PaginationMeta,
  options?: { headers?: Record<string, string> },
) {
  if (options?.headers) {
    for (const [name, value] of Object.entries(options.headers)) {
      c.header(name, value);
    }
  }
  return c.json({
    success: true as const,
    data,
    meta: {
      requestId: c.get('requestId'),
      pagination,
    },
  }, 200);
}

/**
 * Return a success envelope with cursor-pagination metadata and optional
 * response headers.
 *
 * Use this for cursor-based list endpoints. The response shape is
 * `{ success: true, data, meta: { requestId, cursor: { nextCursor, hasMore, total? } } }`.
 *
 * @param c - Hono request context.
 * @param data - Items on the current page.
 * @param cursorMeta - Cursor pagination metadata.
 * @param options - Optional response headers (e.g., `Deprecation`).
 */
export function cursorPaginated<T>(
  c: Context,
  data: T[],
  cursorMeta: CursorPaginationMeta,
  options?: { headers?: Record<string, string> },
) {
  if (options?.headers) {
    for (const [name, value] of Object.entries(options.headers)) {
      c.header(name, value);
    }
  }
  return c.json({
    success: true as const,
    data,
    meta: {
      requestId: c.get('requestId'),
      cursor: cursorMeta,
    },
  }, 200);
}

/**
 * Return a 400 `INVALID_CURSOR` error envelope.
 *
 * Used when a cursor query parameter cannot be decoded or validated.
 */
export function invalidCursor(c: Context, message: string = 'Invalid cursor') {
  return error(c, 'INVALID_CURSOR', message, 400);
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

/** Return a 404 `NOT_FOUND` error envelope for the named resource. */
export function notFound(c: Context, resource: string = 'Resource') {
  return error(c, 'NOT_FOUND', `${resource} not found`, 404);
}

/** Return a 401 `UNAUTHORIZED` error envelope. */
export function unauthorized(c: Context, message: string = 'Authentication required') {
  return error(c, 'UNAUTHORIZED', message, 401);
}

/** Return a 403 `FORBIDDEN` error envelope. */
export function forbidden(c: Context, message: string = 'Insufficient permissions') {
  return error(c, 'FORBIDDEN', message, 403);
}

/** Return a 400 `VALIDATION_ERROR` envelope with field-level details. */
export function validationError(c: Context, details: Array<{ field: string; message: string }>) {
  return error(c, 'VALIDATION_ERROR', 'Validation failed', 400, details);
}

/** Whether the authenticated user on the context has a verified email address. */
export function isEmailVerified(c: Context): boolean {
  const user = c.get('user') as { emailVerifiedAt: Date | null } | null;
  return !!user?.emailVerifiedAt;
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
