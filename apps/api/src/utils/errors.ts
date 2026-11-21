/**
 * Shared API error vocabulary and Postgres error helpers.
 *
 * - The typed {@link AppError} hierarchy is mapped to its declared status and
 *   envelope by the global error handler (`middleware/errorHandler.ts`), so
 *   services can throw expected client errors without per-route `try/catch`.
 * - The Postgres helpers detect postgres-js `PostgresError`s structurally along
 *   the `cause` chain. drizzle-orm 0.45 wraps every driver error in a
 *   `DrizzleQueryError` (name `Error`, original on `cause`), so neither the
 *   middleware nor services need to import `drizzle-orm` or `postgres`.
 * - {@link toLoggableError} builds a log-safe copy of an error: Drizzle embeds
 *   the query parameters (emails, usernames, bcrypt hashes) in its message and
 *   `params`, and postgres-js puts row values in `detail`.
 */
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** A field-level validation problem, as returned in `error.details`. */
export interface ErrorDetail {
  field: string;
  message: string;
}

/** Base class for expected, client-facing API errors. */
export class AppError extends Error {
  /** Machine-readable error code returned as `error.code`. */
  readonly code: string;
  /** HTTP status the global error handler responds with. */
  readonly status: ContentfulStatusCode;
  /** Optional field-level details returned as `error.details`. */
  readonly details?: ErrorDetail[];

  /**
   * @param code - Machine-readable error code (`error.code`).
   * @param status - HTTP status for the response.
   * @param message - Client-facing message (`error.message`).
   * @param details - Optional field-level details (`error.details`).
   * @param options - Optional `cause` for error chaining.
   */
  constructor(
    code: string,
    status: ContentfulStatusCode,
    message: string,
    details?: ErrorDetail[],
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** 404 `NOT_FOUND`: the requested resource does not exist (or is hidden from the caller). */
export class NotFoundError extends AppError {
  /**
   * @param resource - Human-readable resource name; the message becomes `<resource> not found`.
   * @param options - Optional `cause` for error chaining.
   */
  constructor(resource = 'Resource', options?: { cause?: unknown }) {
    super('NOT_FOUND', 404, `${resource} not found`, undefined, options);
    this.name = 'NotFoundError';
  }
}

/** 403 `FORBIDDEN`: the caller is authenticated but not allowed to perform the action. */
export class ForbiddenError extends AppError {
  /**
   * @param message - Client-facing message (defaults to `Not authorized`).
   * @param options - Optional `cause` for error chaining.
   */
  constructor(message = 'Not authorized', options?: { cause?: unknown }) {
    super('FORBIDDEN', 403, message, undefined, options);
    this.name = 'ForbiddenError';
  }
}

/** 409 conflict; the code defaults to `CONFLICT` and can be specific (e.g. `SLUG_CONFLICT`). */
export class ConflictError extends AppError {
  /**
   * @param code - Machine-readable conflict code (defaults to `CONFLICT`).
   * @param message - Client-facing message.
   * @param options - Optional `cause` for error chaining.
   */
  constructor(
    code = 'CONFLICT',
    message = 'A record with this value already exists',
    options?: { cause?: unknown },
  ) {
    super(code, 409, message, undefined, options);
    this.name = 'ConflictError';
  }
}

/** 400 `VALIDATION_ERROR` with optional field-level details. */
export class ValidationError extends AppError {
  /**
   * @param message - Client-facing message (defaults to `Validation failed`).
   * @param details - Optional field-level details.
   * @param options - Optional `cause` for error chaining.
   */
  constructor(
    message = 'Validation failed',
    details?: ErrorDetail[],
    options?: { cause?: unknown },
  ) {
    super('VALIDATION_ERROR', 400, message, details, options);
    this.name = 'ValidationError';
  }
}

/**
 * The structural subset of a postgres-js `PostgresError` the API relies on.
 * Field names follow postgres-js (snake_case, copied from the server response).
 */
export interface PostgresErrorLike {
  name: 'PostgresError';
  /** Five-character SQLSTATE, e.g. `23505`. */
  code: string;
  message: string;
  constraint_name?: string;
  table_name?: string;
  column_name?: string;
  schema_name?: string;
  /** Server detail text; may contain row values, so it is never logged. */
  detail?: string;
}

/** Maximum number of objects inspected along a `cause` chain (the error itself included). */
const MAX_CAUSE_DEPTH = 5;

/** True for a non-null object or function (anything that can carry properties). */
function isObjectLike(value: unknown): value is Record<string, unknown> {
  return (typeof value === 'object' || typeof value === 'function') && value !== null;
}

/** Iterate over `err` and its `cause` chain, at most {@link MAX_CAUSE_DEPTH} objects. */
function* causeChain(err: unknown): Generator<Record<string, unknown>> {
  let current: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && isObjectLike(current); depth++) {
    yield current;
    current = current.cause;
  }
}

/** True when `value` looks like a postgres-js `PostgresError`. */
function isPostgresErrorLike(value: Record<string, unknown>): boolean {
  return (
    value.name === 'PostgresError' && typeof value.code === 'string' && value.code.length === 5
  );
}

/**
 * Find the postgres-js `PostgresError` behind `err`, walking the `cause` chain
 * (at most 5 levels, starting with `err` itself). Detection is structural
 * (`name === 'PostgresError'` plus a 5-character `code`), so it handles bare,
 * Drizzle-wrapped and re-thrown errors without importing the driver.
 *
 * @param err - Any thrown value.
 * @returns The Postgres error, or `null` when there is none.
 */
export function getPostgresError(err: unknown): PostgresErrorLike | null {
  for (const link of causeChain(err)) {
    if (isPostgresErrorLike(link)) return link as unknown as PostgresErrorLike;
  }
  return null;
}

/**
 * True when `err` (or an error on its `cause` chain) is a Postgres unique
 * violation (`23505`), optionally on one specific constraint.
 *
 * @param err - Any thrown value.
 * @param constraint - When given, the violated constraint must have exactly this name.
 */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const pgErr = getPostgresError(err);
  if (pgErr?.code !== '23505') return false;
  return constraint === undefined || pgErr.constraint_name === constraint;
}

/**
 * True when `err` is a statement cancelled by the server's `statement_timeout`:
 * SQLSTATE `57014` (`query_canceled`) on the error itself or on its `cause` chain
 * (drizzle-orm wraps the postgres-js error in `DrizzleQueryError`). Used by the
 * recipe listing to log a sanitized line and by the error handler to answer 503
 * `QUERY_TIMEOUT`.
 *
 * @param err - Any thrown value.
 */
export function isStatementTimeout(err: unknown): boolean {
  for (const link of causeChain(err)) {
    if (link.code === '57014') return true;
  }
  return false;
}

/**
 * The lower-cased leading SQL keyword (`insert`, `update`, `delete`, `select`, …)
 * of the failed statement, read from the first `query` string on the `cause`
 * chain (Drizzle's wrapper carries it as `query`).
 *
 * @param err - Any thrown value.
 * @returns The keyword, or `null` when no query text is available.
 */
export function postgresStatementKind(err: unknown): string | null {
  for (const link of causeChain(err)) {
    if (typeof link.query === 'string') {
      const match = /^\s*([a-z]+)/i.exec(link.query);
      return match ? match[1].toLowerCase() : null;
    }
  }
  return null;
}

/**
 * True when `err` came from the database layer: a Postgres error anywhere on
 * its `cause` chain, or a Drizzle query wrapper (a `query` string plus a
 * `params` array). Such messages embed SQL parameters and must never be echoed.
 *
 * @param err - Any thrown value.
 */
export function isDatabaseError(err: unknown): boolean {
  if (getPostgresError(err)) return true;
  for (const link of causeChain(err)) {
    if (typeof link.query === 'string' && Array.isArray(link.params)) return true;
  }
  return false;
}

/** A log-safe, plain-object copy of an error produced by {@link toLoggableError}. */
export interface LoggableError {
  type: string;
  message: string;
  stack?: string;
  code?: string;
  constraint?: string;
  table?: string;
  query?: string;
  cause?: LoggableError;
}

/** Remove Drizzle's `\nparams: …` tail (everything from the first `params:` line on). */
function stripParams(message: string): string {
  const index = message.search(/(^|\n)params:/);
  return index === -1 ? message : message.slice(0, index);
}

/** Rebuild a stack trace from its frames only, so a parameter-bearing message cannot leak. */
function sanitizeStack(stack: unknown, header: string): string | undefined {
  if (typeof stack !== 'string') return undefined;
  const frames = stack.split('\n').filter((line) => /^\s+at\s/.test(line));
  return [header, ...frames].join('\n');
}

/** Build the loggable copy of one link of a cause chain. */
function toLoggableLink(link: Record<string, unknown>, depth: number): LoggableError {
  const type = typeof link.name === 'string' ? link.name : 'Error';
  const message = typeof link.message === 'string' ? stripParams(link.message) : '';
  const result: LoggableError = { type, message };
  const stack = sanitizeStack(link.stack, `${type}: ${message}`);
  if (stack !== undefined) result.stack = stack;
  if (typeof link.code === 'string') result.code = link.code;
  if (typeof link.constraint_name === 'string') result.constraint = link.constraint_name;
  if (typeof link.table_name === 'string') result.table = link.table_name;
  if (typeof link.query === 'string') result.query = link.query;
  if (depth + 1 < MAX_CAUSE_DEPTH && isObjectLike(link.cause)) {
    result.cause = toLoggableLink(link.cause, depth + 1);
  }
  return result;
}

/**
 * Build a log-safe copy of `err` for `log.error({ err: toLoggableError(err) })`.
 *
 * Keeps the error name (`type`), the message without Drizzle's `params:` tail,
 * the stack frames, the SQLSTATE (`code`), the constraint and table names, the
 * SQL text (placeholders only) and the same view of each `cause`. Drops
 * `params`, `parameters`, `detail` and every other property.
 *
 * @param err - Any thrown value.
 */
export function toLoggableError(err: unknown): LoggableError {
  if (!isObjectLike(err)) return { type: typeof err, message: String(err) };
  return toLoggableLink(err, 0);
}
