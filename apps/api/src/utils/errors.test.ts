import { DrizzleQueryError } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  getPostgresError,
  isDatabaseError,
  isStatementTimeout,
  isUniqueViolation,
  NotFoundError,
  postgresStatementKind,
  toLoggableError,
  ValidationError,
} from './errors.ts';

/**
 * Unit tests for the shared API error vocabulary and Postgres helpers.
 *
 * Inputs cover the shapes the API meets in practice: drizzle-orm 0.45's real
 * `DrizzleQueryError` wrapping a postgres-js `PostgresError`-shaped cause, a
 * bare `PostgresError`, an error re-thrown with the original nested deeper on
 * the `cause` chain, and non-Postgres errors.
 */

const SECRET_EMAIL = 'leak-check@example.com';
const SECRET_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLM';
const INSERT_SQL = 'insert into "user" ("email", "password_hash") values ($1, $2)';

/** Build a postgres-js `PostgresError`-shaped error with non-enumerable parameters. */
function pgError(code: string, extra: Record<string, unknown> = {}) {
  const err = new Error(`postgres error ${code}`) as Error & Record<string, unknown>;
  err.name = 'PostgresError';
  Object.assign(err, { code, detail: `Key (email)=(${SECRET_EMAIL}) already exists.`, ...extra });
  Object.defineProperty(err, 'parameters', {
    value: [SECRET_EMAIL, SECRET_HASH],
    enumerable: false,
  });
  return err;
}

/** Wrap a cause in drizzle-orm's real `DrizzleQueryError`. */
function wrapped(cause: Error, query = INSERT_SQL) {
  return new DrizzleQueryError(query, [SECRET_EMAIL, SECRET_HASH], cause);
}

/** Nest `err` under `levels` plain re-throw wrappers. */
function nest(err: unknown, levels: number): unknown {
  let current = err;
  for (let i = 0; i < levels; i++) current = new Error(`rethrow ${i}`, { cause: current });
  return current;
}

describe('AppError hierarchy', () => {
  it('should carry code, status, message and details on AppError', () => {
    const cause = new Error('root');
    const err = new AppError('GONE', 410, 'Recipe was removed', [{ field: 'id', message: 'x' }], {
      cause,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AppError');
    expect(err.code).toBe('GONE');
    expect(err.status).toBe(410);
    expect(err.message).toBe('Recipe was removed');
    expect(err.details).toEqual([{ field: 'id', message: 'x' }]);
    expect(err.cause).toBe(cause);
  });

  it('should build NotFoundError as 404 NOT_FOUND with a resource message', () => {
    const err = new NotFoundError('Recipe');
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe('NotFoundError');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Recipe not found');
    expect(new NotFoundError().message).toBe('Resource not found');
  });

  it('should build ForbiddenError as 403 FORBIDDEN', () => {
    const err = new ForbiddenError();
    expect(err.name).toBe('ForbiddenError');
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('Not authorized');
  });

  it('should build ConflictError as 409 with a default or specific code', () => {
    const generic = new ConflictError();
    expect(generic.name).toBe('ConflictError');
    expect(generic.status).toBe(409);
    expect(generic.code).toBe('CONFLICT');
    const slug = new ConflictError('SLUG_CONFLICT', 'Could not allocate a unique recipe slug');
    expect(slug.code).toBe('SLUG_CONFLICT');
    expect(slug.message).toBe('Could not allocate a unique recipe slug');
  });

  it('should build ValidationError as 400 VALIDATION_ERROR with details', () => {
    const err = new ValidationError('Title cannot be empty', [
      { field: 'title', message: 'Title cannot be empty' },
    ]);
    expect(err.name).toBe('ValidationError');
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details?.[0].field).toBe('title');
    expect(new ValidationError().message).toBe('Validation failed');
  });
});

describe('getPostgresError', () => {
  it('should find the PostgresError behind a DrizzleQueryError', () => {
    const cause = pgError('23505', { constraint_name: 'user_email_unique' });
    expect(getPostgresError(wrapped(cause))).toBe(cause);
  });

  it('should return a bare PostgresError itself', () => {
    const err = pgError('23503');
    expect(getPostgresError(err)).toBe(err);
  });

  it('should accept a plain object with the PostgresError shape', () => {
    const err = { name: 'PostgresError', code: '23505', message: 'dup' };
    expect(getPostgresError({ cause: err })).toBe(err);
  });

  it('should find a PostgresError nested up to the fifth level', () => {
    const cause = pgError('23505');
    // The error itself plus four causes = five inspected objects.
    expect(getPostgresError(nest(cause, 4))).toBe(cause);
  });

  it('should stop walking after five levels', () => {
    expect(getPostgresError(nest(pgError('23505'), 5))).toBeNull();
  });

  it('should require a five-character code', () => {
    expect(getPostgresError({ name: 'PostgresError', code: '235' })).toBeNull();
    expect(getPostgresError({ name: 'PostgresError' })).toBeNull();
  });

  it('should return null for non-Postgres inputs', () => {
    expect(getPostgresError(new Error('boom'))).toBeNull();
    const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    expect(getPostgresError(wrapped(refused))).toBeNull();
    expect(getPostgresError('a string')).toBeNull();
    expect(getPostgresError(null)).toBeNull();
    expect(getPostgresError(undefined)).toBeNull();
  });

  it('should survive a cyclic cause chain', () => {
    const a = new Error('a') as Error & { cause?: unknown };
    const b = new Error('b', { cause: a });
    a.cause = b;
    expect(getPostgresError(a)).toBeNull();
  });
});

describe('isUniqueViolation', () => {
  const dup = wrapped(
    pgError('23505', { constraint_name: 'collection_item_collection_id_recipe_id_unique' }),
  );

  it('should detect a wrapped unique violation', () => {
    expect(isUniqueViolation(dup)).toBe(true);
  });

  it('should match the named constraint only', () => {
    expect(isUniqueViolation(dup, 'collection_item_collection_id_recipe_id_unique')).toBe(true);
    expect(isUniqueViolation(dup, 'user_email_unique')).toBe(false);
  });

  it('should detect a bare and a nested unique violation', () => {
    expect(isUniqueViolation(pgError('23505'))).toBe(true);
    expect(isUniqueViolation(nest(pgError('23505'), 2))).toBe(true);
  });

  it('should reject other SQLSTATEs and non-Postgres errors', () => {
    expect(isUniqueViolation(wrapped(pgError('23503')))).toBe(false);
    expect(isUniqueViolation(new Error('duplicate key value violates unique constraint'))).toBe(
      false,
    );
  });
});

describe('isStatementTimeout', () => {
  it('should detect 57014 on a Drizzle wrapper, bare and nested', () => {
    expect(isStatementTimeout(wrapped(pgError('57014')))).toBe(true);
    expect(isStatementTimeout(pgError('57014'))).toBe(true);
    expect(isStatementTimeout(nest(pgError('57014'), 2))).toBe(true);
  });

  it('should detect a plain error carrying code 57014 directly or on its cause', () => {
    expect(isStatementTimeout(Object.assign(new Error('x'), { code: '57014' }))).toBe(true);
    expect(isStatementTimeout(new Error('x', { cause: { code: '57014' } }))).toBe(true);
  });

  it('should reject other SQLSTATEs and non-errors', () => {
    expect(isStatementTimeout(wrapped(pgError('23505')))).toBe(false);
    expect(isStatementTimeout(new Error('QUERY_TIMEOUT'))).toBe(false);
    expect(isStatementTimeout(null)).toBe(false);
    expect(isStatementTimeout('57014')).toBe(false);
  });
});

describe('postgresStatementKind', () => {
  it('should read the leading keyword of the wrapper query', () => {
    expect(postgresStatementKind(wrapped(pgError('23503')))).toBe('insert');
    expect(
      postgresStatementKind(wrapped(pgError('23503'), '  DELETE from "user" where id = $1')),
    ).toBe('delete');
    expect(postgresStatementKind(wrapped(pgError('23503'), 'update "user" set "email" = $1'))).toBe(
      'update',
    );
  });

  it('should find the query on a nested wrapper', () => {
    expect(postgresStatementKind(nest(wrapped(pgError('23503')), 2))).toBe('insert');
  });

  it('should return null without query text', () => {
    expect(postgresStatementKind(pgError('23503'))).toBeNull();
    expect(postgresStatementKind(new Error('boom'))).toBeNull();
    expect(postgresStatementKind(undefined)).toBeNull();
  });
});

describe('isDatabaseError', () => {
  it('should flag Postgres errors and Drizzle wrappers', () => {
    expect(isDatabaseError(pgError('42P01'))).toBe(true);
    expect(isDatabaseError(wrapped(pgError('42P01')))).toBe(true);
    expect(isDatabaseError(wrapped(new Error('connect ECONNREFUSED')))).toBe(true);
  });

  it('should not flag other errors', () => {
    expect(isDatabaseError(new Error('boom'))).toBe(false);
    expect(isDatabaseError('boom')).toBe(false);
  });
});

describe('toLoggableError', () => {
  it('should drop parameters, detail and the params tail from a wrapped error', () => {
    const err = wrapped(
      pgError('23505', { constraint_name: 'user_email_unique', table_name: 'user' }),
    );
    const loggable = toLoggableError(err);
    const text = JSON.stringify(loggable);
    expect(text).not.toContain(SECRET_EMAIL);
    expect(text).not.toContain(SECRET_HASH);
    expect(text).not.toContain('params:');
    expect(loggable).not.toHaveProperty('params');
    expect(loggable.message).toBe(`Failed query: ${INSERT_SQL}`);
    expect(loggable.query).toBe(INSERT_SQL);
    expect(loggable.cause?.type).toBe('PostgresError');
    expect(loggable.cause?.code).toBe('23505');
    expect(loggable.cause?.constraint).toBe('user_email_unique');
    expect(loggable.cause?.table).toBe('user');
    expect(loggable.cause).not.toHaveProperty('detail');
    expect(loggable.cause).not.toHaveProperty('parameters');
  });

  it('should keep stack frames without the parameter-bearing message lines', () => {
    const loggable = toLoggableError(wrapped(pgError('23505')));
    expect(loggable.stack).toBeDefined();
    expect(loggable.stack?.split('\n')[0]).toBe(`Error: Failed query: ${INSERT_SQL}`);
    expect(loggable.stack).toMatch(/\n\s+at\s/);
    expect(loggable.stack).not.toContain(SECRET_EMAIL);
  });

  it('should keep a bare PostgresError code without its detail', () => {
    const loggable = toLoggableError(pgError('42P01', { table_name: 'missing' }));
    expect(loggable).toMatchObject({ type: 'PostgresError', code: '42P01', table: 'missing' });
    expect(JSON.stringify(loggable)).not.toContain(SECRET_EMAIL);
  });

  it('should keep the name and message of a non-Postgres error', () => {
    const loggable = toLoggableError(new TypeError('boom'));
    expect(loggable.type).toBe('TypeError');
    expect(loggable.message).toBe('boom');
    expect(loggable.stack?.startsWith('TypeError: boom')).toBe(true);
  });

  it('should describe a thrown non-object', () => {
    expect(toLoggableError('oops')).toEqual({ type: 'string', message: 'oops' });
  });
});
