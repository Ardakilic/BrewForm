/**
 * Global Hono error handler (registered with `app.onError`).
 *
 * Maps every error that escapes a route to the standard JSON envelope
 * `{ success: false, error: { code, message, details?, requestId } }`, built with
 * `c.json` so headers already set on the context (CORS, request id, secure
 * headers) are preserved. Branch order:
 *
 * 1. `HTTPException` (framework errors such as malformed JSON) → its own status;
 *    a custom `res` is returned unchanged.
 * 2. Typed `AppError` (`utils/errors.ts`) → its declared status, code and details.
 * 3. `EQUIPMENT_INCOMPATIBLE` → 422 with per-equipment details.
 * 4. Postgres errors, found along the `cause` chain (drizzle-orm wraps driver
 *    errors in `DrizzleQueryError`) → the SQLSTATE table below.
 * 5. `ZodError` → 400 with field details.
 * 6. Auth/JWT failures → 401.
 * 7. Legacy string-coded domain errors (`FORBIDDEN`, `*_NOT_FOUND`,
 *    `ALREADY_*` / `*_ALREADY_EXISTS`, `VALIDATION_ERROR…`) → 403/404/409/400.
 * 8. Anything else → 500 (`Something went wrong` in production).
 *
 * SQLSTATE mapping: `23505` → 409 `CONFLICT`; `23503` → 400 `VALIDATION_ERROR` on
 * insert/update (or without query text) and 409 `CONFLICT` on delete; `23502`,
 * `23514` and class `22` → 400 `VALIDATION_ERROR`; `57014` (statement timeout) →
 * 503 `QUERY_TIMEOUT`; any other code → 500. Responses never contain SQL text,
 * parameters, constraint, table or column names.
 *
 * Logging never includes query parameters or row values: mapped database errors
 * log only `{ pgCode, constraint, table }`, and 500s log `toLoggableError(err)`.
 */
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { config } from '../config/index.ts';
import {
  AppError,
  type ErrorDetail,
  getPostgresError,
  isDatabaseError,
  type PostgresErrorLike,
  postgresStatementKind,
  toLoggableError,
} from '../utils/errors.ts';
import { createLogger } from '../utils/logger/index.ts';

/** Module-scoped structured logger (exported for test spies). */
export const log = createLogger('errorHandler');

/** A resolved client-facing error: status plus the envelope's `code` and `message`. */
interface MappedError {
  status: ContentfulStatusCode;
  code: string;
  message: string;
}

/** `error.code` for an `HTTPException` status (spec: error-handling, HTTPException mapping). */
const HTTP_STATUS_CODES: Partial<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
};

/** Fallback message for an `HTTPException` 4xx thrown without a message. */
const DEFAULT_CLIENT_ERROR_MESSAGE = 'Request could not be processed';

/** Production message for every 5xx response. */
const GENERIC_SERVER_ERROR_MESSAGE = 'Something went wrong';

/** Build the standard error envelope with `c.json` (keeps headers set on the context). */
function respond(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  requestId: string | undefined,
  details?: ErrorDetail[],
) {
  return c.json(
    {
      success: false,
      error: { code, message, ...(details ? { details } : {}), requestId },
    },
    status,
  );
}

/** Derive `error.code` from an `HTTPException` status. */
function httpExceptionCode(status: number): string {
  if (status >= 500) return 'INTERNAL_ERROR';
  return HTTP_STATUS_CODES[status] ?? 'BAD_REQUEST';
}

/**
 * Map a Postgres error to a client response using the SQLSTATE table, or return
 * `null` when the code is not mapped (the caller then answers 500).
 *
 * @param pgErr - The Postgres error found on the `cause` chain.
 * @param statementKind - Leading keyword of the failed statement, if known.
 */
function mapPostgresError(
  pgErr: PostgresErrorLike,
  statementKind: string | null,
): MappedError | null {
  const { code } = pgErr;
  if (code === '23505') {
    return { status: 409, code: 'CONFLICT', message: 'A record with this value already exists' };
  }
  if (code === '23503') {
    return statementKind === 'delete'
      ? {
          status: 409,
          code: 'CONFLICT',
          message: 'The record is still referenced by other records',
        }
      : { status: 400, code: 'VALIDATION_ERROR', message: 'A referenced record does not exist' };
  }
  if (code === '23502' || code === '23514' || code.startsWith('22')) {
    return { status: 400, code: 'VALIDATION_ERROR', message: 'A value is invalid for this field' };
  }
  if (code === '57014') {
    return {
      status: 503,
      code: 'QUERY_TIMEOUT',
      message: 'The query took too long. Try a more specific search.',
    };
  }
  return null;
}

/** `/^[A-Z][A-Z0-9_]*_NOT_FOUND$/` → `X y not found`. */
const NOT_FOUND_PATTERN = /^([A-Z][A-Z0-9_]*)_NOT_FOUND$/;
/** `ALREADY_*` or `*_ALREADY_EXISTS` → 409. */
const ALREADY_PATTERNS = [/^ALREADY_[A-Z0-9_]+$/, /^[A-Z0-9_]+_ALREADY_EXISTS$/];

/**
 * Humanize an `UPPER_SNAKE` subject: `COFFEE_VARIETY` → `Coffee variety`.
 *
 * @param subject - The part of the code before `_NOT_FOUND`.
 */
function humanize(subject: string): string {
  const words = subject.toLowerCase().replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Map a legacy string-coded domain error (`new Error('UPPER_SNAKE')`) that no
 * controller handled, or return `null` when the message follows no convention.
 *
 * @param message - The thrown error's message.
 */
function mapLegacyDomainError(message: string): (MappedError & { domainCode: string }) | null {
  if (message === 'FORBIDDEN') {
    return { status: 403, code: 'FORBIDDEN', message: 'Not authorized', domainCode: message };
  }
  const notFound = NOT_FOUND_PATTERN.exec(message);
  if (notFound) {
    return {
      status: 404,
      code: 'NOT_FOUND',
      message: `${humanize(notFound[1])} not found`,
      domainCode: message,
    };
  }
  if (ALREADY_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      status: 409,
      code: 'CONFLICT',
      message: 'A record with this value already exists',
      domainCode: message,
    };
  }
  if (message.startsWith('VALIDATION_ERROR')) {
    const colon = message.indexOf(':');
    const text = colon === -1 ? '' : message.slice(colon + 1).trim();
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: text || 'Validation failed',
      domainCode: 'VALIDATION_ERROR',
    };
  }
  return null;
}

/**
 * Global error handler: maps a thrown error to the standard JSON error envelope
 * (see the module docblock for the branch order and the SQLSTATE table).
 *
 * @param err - The error thrown by a route or middleware.
 * @param c - The Hono request context.
 * @returns The JSON error response (or an `HTTPException`'s custom response).
 */
export function errorHandler(err: Error, c: Context) {
  const requestId = c.get('requestId') as string | undefined;
  const method = c.req.method;
  const path = c.req.path;

  if (err instanceof HTTPException) {
    const status = err.status;
    if (status >= 500) {
      log.error({ err: toLoggableError(err), requestId, status, method, path }, 'HTTP exception');
    } else {
      log.warn({ requestId, status, method, path }, 'HTTP exception');
    }
    if (err.res) return err.getResponse();
    const message =
      status >= 500
        ? config.APP_ENV === 'production'
          ? GENERIC_SERVER_ERROR_MESSAGE
          : err.message || GENERIC_SERVER_ERROR_MESSAGE
        : err.message || DEFAULT_CLIENT_ERROR_MESSAGE;
    return respond(c, status, httpExceptionCode(status), message, requestId);
  }

  if (err instanceof AppError) {
    if (err.status >= 500) {
      log.error({ err: toLoggableError(err), requestId, code: err.code }, 'Unhandled error');
    } else {
      log.debug(
        { requestId, code: err.code, status: err.status, method, path },
        'Application error',
      );
    }
    return respond(c, err.status, err.code, err.message, requestId, err.details);
  }

  if (err instanceof Error && 'code' in err && err.code === 'EQUIPMENT_INCOMPATIBLE') {
    const rawDetails =
      'details' in err ? (err as Error & { details?: unknown }).details : undefined;
    const detailStrings = Array.isArray(rawDetails)
      ? rawDetails.filter((d): d is string => typeof d === 'string')
      : [];
    const details = detailStrings.map((d) => ({
      field: 'equipmentIds',
      message: d,
    }));
    return respond(
      c,
      422,
      'VALIDATION_ERROR',
      'Equipment is not compatible with the selected brew method',
      requestId,
      details,
    );
  }

  const pgErr = getPostgresError(err);
  if (pgErr) {
    const mapped = mapPostgresError(pgErr, postgresStatementKind(err));
    if (mapped) {
      log.warn(
        {
          requestId,
          pgCode: pgErr.code,
          constraint: pgErr.constraint_name,
          table: pgErr.table_name,
          method,
          path,
        },
        mapped.code === 'QUERY_TIMEOUT'
          ? 'Database statement timeout'
          : 'Database constraint violation',
      );
      return respond(c, mapped.status, mapped.code, mapped.message, requestId);
    }
  }

  if (err.name === 'ZodError') {
    const zodErr =
      err instanceof Error && 'issues' in err
        ? (err as Error & { issues?: Array<{ path: (string | number)[]; message: string }> })
        : null;
    const details =
      zodErr?.issues?.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })) || [];
    return respond(c, 400, 'VALIDATION_ERROR', 'Validation failed', requestId, details);
  }

  if (
    err.name === 'UnauthorizedError' ||
    (err instanceof Error &&
      (err.message === 'Invalid token' ||
        err.message === 'jwt expired' ||
        err.message === 'jwt malformed'))
  ) {
    return respond(c, 401, 'UNAUTHORIZED', 'Authentication required', requestId);
  }

  const legacy = pgErr ? null : mapLegacyDomainError(err.message);
  if (legacy) {
    log.warn(
      { requestId, domainCode: legacy.domainCode, method, path },
      'Unmapped domain error reached global handler',
    );
    return respond(c, legacy.status, legacy.code, legacy.message, requestId);
  }

  log.error({ err: toLoggableError(err), requestId }, 'Unhandled error');

  let message = GENERIC_SERVER_ERROR_MESSAGE;
  if (config.APP_ENV !== 'production') {
    // Drizzle's message embeds the query parameters, so it is never echoed.
    message = isDatabaseError(err) ? 'Database error' : err.message;
  }
  return respond(c, 500, 'INTERNAL_ERROR', message, requestId);
}
