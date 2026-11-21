import '../test-setup.ts';
import { DrizzleQueryError } from 'drizzle-orm';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { reloadConfig } from '../config/env.ts';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../utils/errors.ts';
import { errorHandler, log } from './errorHandler.ts';

/**
 * Unit tests for the global error handler.
 *
 * Every case calls `errorHandler` directly with a realistic error shape:
 * drizzle-orm 0.45's real `DrizzleQueryError` wrapping a postgres-js
 * `PostgresError`-shaped cause, Hono's `HTTPException`, the typed `AppError`
 * hierarchy and the legacy string-coded domain errors. Database cases also
 * prove that neither the response body nor any captured logger call contains
 * the query parameters (emails, usernames, bcrypt hashes).
 */

const REQUEST_ID = 'test-req-1';
const METHOD = 'POST';
const PATH = '/api/v1/test';

/** Parameter values that must never reach a response body or a log line. */
const SECRET_EMAIL = 'leak-check@example.com';
const SECRET_USERNAME = 'leaky-username';
const SECRET_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLM';
const SECRET_PARAMS = [SECRET_EMAIL, SECRET_USERNAME, SECRET_HASH];

/**
 * Build a minimal Hono context exposing what `errorHandler` reads: the
 * request id, the request method and path, and `c.json`.
 */
function createMockContext(): Context {
  return {
    get: (key: string) => (key === 'requestId' ? REQUEST_ID : undefined),
    req: { method: METHOD, path: PATH },
    json: (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  } as unknown as Context;
}

/**
 * Build a postgres-js `PostgresError`-shaped error. Like the real driver, the
 * query `parameters` are non-enumerable and `detail` echoes the conflicting
 * value, so a test can prove neither leaks.
 */
function pgError(code: string, extra: Record<string, unknown> = {}) {
  const err = new Error(`postgres error ${code}`) as Error & Record<string, unknown>;
  err.name = 'PostgresError';
  Object.assign(err, {
    code,
    severity: 'ERROR',
    detail: `Key (email)=(${SECRET_EMAIL}) already exists.`,
    ...extra,
  });
  Object.defineProperty(err, 'parameters', { value: SECRET_PARAMS, enumerable: false });
  return err;
}

/** Wrap a cause in drizzle-orm's real `DrizzleQueryError` with secret params. */
function wrapped(query: string, cause: Error) {
  return new DrizzleQueryError(query, SECRET_PARAMS, cause);
}

const INSERT_USER_SQL =
  'insert into "user" ("email", "username", "password_hash") values ($1, $2, $3)';
const DELETE_USER_SQL = 'delete from "user" where "user"."id" = $1';

/**
 * Flatten any value (including Error instances with non-enumerable
 * `message`/`stack`/`parameters`) into one searchable string.
 */
function deepText(value: unknown, seen = new Set<unknown>()): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object' && typeof value !== 'function') return String(value);
  if (seen.has(value)) return '';
  seen.add(value);
  const parts: string[] = [];
  for (const key of Object.getOwnPropertyNames(value)) {
    parts.push(key, deepText((value as Record<string, unknown>)[key], seen));
  }
  return parts.join(' ');
}

/** Read the JSON body of a handler response. */
async function readBody(res: Response) {
  return (await res.json()) as {
    success: boolean;
    error: {
      code: string;
      message: string;
      requestId?: string;
      details?: Array<{ field: string; message: string }>;
    };
  };
}

let spies: { debug: MockInstance; warn: MockInstance; error: MockInstance };

/** Every argument passed to any captured logger method, flattened to text. */
function capturedLogText() {
  return [spies.debug, spies.warn, spies.error]
    .flatMap((s) => s.mock.calls)
    .map((call) => deepText(call))
    .join('\n');
}

/** The message strings of every captured `log.error` call. */
function errorMessages() {
  return spies.error.mock.calls.map((call) => call[1]);
}

/** Assert neither the body nor any captured log line contains a parameter value. */
function expectNoParamLeak(bodyText: string) {
  const logText = capturedLogText();
  for (const secret of SECRET_PARAMS) {
    expect(bodyText).not.toContain(secret);
    expect(logText).not.toContain(secret);
  }
  expect(bodyText).not.toContain('params:');
  expect(logText).not.toContain('params:');
}

/** Run the handler and return the status, the parsed body and its raw text. */
async function run(err: Error) {
  const res = await errorHandler(err, createMockContext());
  const text = await res.clone().text();
  return { res, status: res.status, body: await readBody(res), text };
}

beforeEach(() => {
  spies = {
    debug: vi.spyOn(log, 'debug'),
    warn: vi.spyOn(log, 'warn'),
    error: vi.spyOn(log, 'error'),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('errorHandler — Postgres errors wrapped in DrizzleQueryError', () => {
  it('should map a wrapped 23505 unique violation to 409 CONFLICT', async () => {
    const err = wrapped(
      INSERT_USER_SQL,
      pgError('23505', { constraint_name: 'user_email_unique', table_name: 'user' }),
    );
    const { status, body, text } = await run(err);
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toBe('A record with this value already exists');
    expect(body.error.requestId).toBe(REQUEST_ID);
    expect(text).not.toContain('insert into');
    expect(text).not.toContain('user_email_unique');
    expectNoParamLeak(text);
    expect(spies.warn).toHaveBeenCalledWith(
      {
        requestId: REQUEST_ID,
        pgCode: '23505',
        constraint: 'user_email_unique',
        table: 'user',
        method: METHOD,
        path: PATH,
      },
      'Database constraint violation',
    );
    expect(errorMessages()).not.toContain('Unhandled error');
  });

  it('should map a wrapped 23503 on an insert to 400 VALIDATION_ERROR', async () => {
    const err = wrapped(
      'insert into "recipe" ("vendor_id") values ($1)',
      pgError('23503', { constraint_name: 'recipe_vendor_id_vendor_id_fk', table_name: 'recipe' }),
    );
    const { status, body, text } = await run(err);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('A referenced record does not exist');
    expect(body.error.requestId).toBe(REQUEST_ID);
    expectNoParamLeak(text);
  });

  it('should map a wrapped 23503 on a delete to 409 CONFLICT', async () => {
    const err = wrapped(
      DELETE_USER_SQL,
      pgError('23503', { constraint_name: 'recipe_author_id_user_id_fk', table_name: 'recipe' }),
    );
    const { status, body, text } = await run(err);
    expect(status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toBe('The record is still referenced by other records');
    expect(body.error.requestId).toBe(REQUEST_ID);
    expectNoParamLeak(text);
  });

  it('should map a wrapped 23514 check violation to 400 VALIDATION_ERROR', async () => {
    const err = wrapped(
      'insert into "user_recipe_rating" ("rating") values ($1)',
      pgError('23514', { constraint_name: 'user_recipe_rating_rating_check' }),
    );
    const { status, body, text } = await run(err);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('A value is invalid for this field');
    expect(body.error.requestId).toBe(REQUEST_ID);
    expectNoParamLeak(text);
  });

  it('should map a wrapped 22P02 invalid text representation to 400 VALIDATION_ERROR', async () => {
    const err = wrapped('select * from "recipe" where "id" = $1', pgError('22P02'));
    const { status, body, text } = await run(err);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('A value is invalid for this field');
    expect(body.error.requestId).toBe(REQUEST_ID);
    expectNoParamLeak(text);
  });

  it('should map a wrapped 23502 not-null violation to 400 VALIDATION_ERROR', async () => {
    const err = wrapped(INSERT_USER_SQL, pgError('23502', { column_name: 'email' }));
    const { status, body } = await run(err);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('A value is invalid for this field');
  });

  it('should map a wrapped 57014 statement timeout to 503 QUERY_TIMEOUT', async () => {
    const err = wrapped('select * from "recipe" where "title" ilike $1', pgError('57014'));
    const { status, body, text } = await run(err);
    expect(status).toBe(503);
    expect(body.error.code).toBe('QUERY_TIMEOUT');
    expect(body.error.message).toBe('The query took too long. Try a more specific search.');
    expect(body.error.requestId).toBe(REQUEST_ID);
    expectNoParamLeak(text);
    expect(errorMessages()).not.toContain('Unhandled error');
  });

  it('should log a wrapped 57014 with the SQLSTATE only (no SQL text or message)', async () => {
    const err = wrapped('select * from "recipe" where "title" ilike $1', pgError('57014'));
    await run(err);
    expect(spies.warn).toHaveBeenCalledWith(
      { requestId: REQUEST_ID, pgCode: '57014', method: METHOD, path: PATH },
      'Database statement timeout',
    );
    const logText = capturedLogText();
    expect(logText).not.toContain('ilike');
    expect(logText).not.toContain('postgres error 57014');
  });

  it('should map an unknown SQLSTATE to 500 with a sanitized error log', async () => {
    const err = wrapped(INSERT_USER_SQL, pgError('42P01', { table_name: 'user' }));
    const { status, body, text } = await run(err);
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Database error');
    expect(body.error.requestId).toBe(REQUEST_ID);
    expectNoParamLeak(text);
    expect(errorMessages()).toContain('Unhandled error');
    // The sanitized log keeps the SQL text (placeholders only) and the SQLSTATE.
    const logText = capturedLogText();
    expect(logText).toContain(INSERT_USER_SQL);
    expect(logText).toContain('42P01');
  });

  it('should use the 400 row for 23503 when no query text is available', async () => {
    const { status, body } = await run(pgError('23503'));
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should keep a DrizzleQueryError with a non-Postgres cause at 500', async () => {
    const cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
      code: 'ECONNREFUSED',
    });
    const { status, body, text } = await run(wrapped(INSERT_USER_SQL, cause));
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Database error');
    expectNoParamLeak(text);
    expect(errorMessages()).toContain('Unhandled error');
  });
});

describe('errorHandler — statement timeout (QUERY_TIMEOUT)', () => {
  /** Assert the exact 503 QUERY_TIMEOUT envelope. */
  async function expectQueryTimeout(err: Error) {
    const { status, body, text } = await run(err);
    expect(status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('QUERY_TIMEOUT');
    expect(body.error.message).toBe('The query took too long. Try a more specific search.');
    expect(body.error.requestId).toBe(REQUEST_ID);
    expect(errorMessages()).not.toContain('Unhandled error');
    return text;
  }

  it('should map the sanitized QUERY_TIMEOUT domain error to 503', async () => {
    await expectQueryTimeout(new Error('QUERY_TIMEOUT'));
    expect(spies.warn).toHaveBeenCalledWith(
      { requestId: REQUEST_ID, pgCode: '57014', method: METHOD, path: PATH },
      'Database statement timeout',
    );
  });

  it('should map a plain error whose own code is 57014 to 503', async () => {
    const err = Object.assign(new Error('canceling statement due to statement timeout'), {
      code: '57014',
    });
    await expectQueryTimeout(err);
    expect(capturedLogText()).not.toContain('canceling statement');
  });

  it('should map an error whose cause carries code 57014 to 503 without leaking params', async () => {
    const err = Object.assign(new Error(`Failed query: select ... params: ${SECRET_EMAIL}`), {
      cause: { code: '57014', message: 'canceling statement due to statement timeout' },
    });
    const text = await expectQueryTimeout(err);
    expectNoParamLeak(text);
  });
});

describe('errorHandler — bare PostgresError', () => {
  it('should map an unwrapped PostgresError 23505 to 409 CONFLICT', async () => {
    const { status, body, text } = await run(
      pgError('23505', { constraint_name: 'user_follow_follower_id_following_id_unique' }),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toBe('A record with this value already exists');
    expect(body.error.requestId).toBe(REQUEST_ID);
    expectNoParamLeak(text);
  });
});

describe('errorHandler — production responses', () => {
  let originalAppEnv: string | undefined;

  beforeEach(() => {
    originalAppEnv = process.env.APP_ENV;
    process.env.APP_ENV = 'production';
    reloadConfig();
  });

  afterEach(() => {
    if (originalAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = originalAppEnv;
    reloadConfig();
  });

  it('should hide unmapped database errors behind a generic message', async () => {
    const { status, body, text } = await run(wrapped(INSERT_USER_SQL, pgError('42P01')));
    expect(status).toBe(500);
    expect(body.error.message).toBe('Something went wrong');
    expectNoParamLeak(text);
  });

  it('should hide arbitrary error messages', async () => {
    const { status, body } = await run(new Error('boom'));
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Something went wrong');
  });
});

describe('errorHandler — HTTPException', () => {
  it('should map a malformed-JSON HTTPException to 400 BAD_REQUEST', async () => {
    const err = new HTTPException(400, { message: 'Malformed JSON in request body' });
    const { status, body } = await run(err);
    expect(status).toBe(400);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message).toBe('Malformed JSON in request body');
    expect(body.error.requestId).toBe(REQUEST_ID);
    expect(spies.warn).toHaveBeenCalledWith(
      { requestId: REQUEST_ID, status: 400, method: METHOD, path: PATH },
      'HTTP exception',
    );
    expect(spies.error).not.toHaveBeenCalled();
  });

  it('should preserve a 429 status as RATE_LIMITED', async () => {
    const err = new HTTPException(429, { message: 'Too many requests' });
    const { status, body } = await run(err);
    expect(status).toBe(429);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.message).toBe('Too many requests');
    expect(body.error.requestId).toBe(REQUEST_ID);
  });

  it('should honour a custom response', async () => {
    const err = new HTTPException(401, { res: new Response('nope', { status: 401 }) });
    const res = await errorHandler(err, createMockContext());
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('nope');
  });

  it('should map a 5xx HTTPException to INTERNAL_ERROR and log it as an error', async () => {
    const err = new HTTPException(502, { message: 'upstream exploded' });
    const { status, body } = await run(err);
    expect(status).toBe(502);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(spies.error).toHaveBeenCalled();
  });
});

describe('errorHandler — AppError hierarchy', () => {
  it('should map NotFoundError to 404 NOT_FOUND', async () => {
    const { status, body } = await run(new NotFoundError('Recipe'));
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Recipe not found');
    expect(body.error.requestId).toBe(REQUEST_ID);
    expect(spies.debug).toHaveBeenCalled();
    expect(spies.error).not.toHaveBeenCalled();
  });

  it('should map ForbiddenError to 403 FORBIDDEN', async () => {
    const { status, body } = await run(new ForbiddenError());
    expect(status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toBe('Not authorized');
    expect(body.error.requestId).toBe(REQUEST_ID);
  });

  it('should map ConflictError to 409 with its own code', async () => {
    const err = new ConflictError('SLUG_CONFLICT', 'Could not allocate a unique recipe slug');
    const { status, body } = await run(err);
    expect(status).toBe(409);
    expect(body.error.code).toBe('SLUG_CONFLICT');
    expect(body.error.message).toBe('Could not allocate a unique recipe slug');
    expect(body.error.requestId).toBe(REQUEST_ID);
  });

  it('should map ValidationError to 400 with details', async () => {
    const err = new ValidationError('Title cannot be empty', [
      { field: 'title', message: 'Title cannot be empty' },
    ]);
    const { status, body } = await run(err);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Title cannot be empty');
    expect(body.error.details?.[0].field).toBe('title');
    expect(body.error.requestId).toBe(REQUEST_ID);
  });

  it('should map a base AppError to its declared status and code', async () => {
    const { status, body } = await run(new AppError('GONE', 410, 'Recipe was removed'));
    expect(status).toBe(410);
    expect(body.error.code).toBe('GONE');
    expect(body.error.message).toBe('Recipe was removed');
    expect(body.error.requestId).toBe(REQUEST_ID);
    expect(body.error.details).toBeUndefined();
  });
});

describe('errorHandler — legacy string-coded domain errors', () => {
  const cases: Array<{ message: string; status: number; code: string; text: string }> = [
    { message: 'FORBIDDEN', status: 403, code: 'FORBIDDEN', text: 'Not authorized' },
    { message: 'RECIPE_NOT_FOUND', status: 404, code: 'NOT_FOUND', text: 'Recipe not found' },
    {
      message: 'COFFEE_VARIETY_NOT_FOUND',
      status: 404,
      code: 'NOT_FOUND',
      text: 'Coffee variety not found',
    },
    {
      message: 'ALREADY_FOLLOWING',
      status: 409,
      code: 'CONFLICT',
      text: 'A record with this value already exists',
    },
    {
      message: 'EMAIL_ALREADY_EXISTS',
      status: 409,
      code: 'CONFLICT',
      text: 'A record with this value already exists',
    },
    {
      message: 'VALIDATION_ERROR: Title cannot be empty',
      status: 400,
      code: 'VALIDATION_ERROR',
      text: 'Title cannot be empty',
    },
    {
      message: 'VALIDATION_ERROR',
      status: 400,
      code: 'VALIDATION_ERROR',
      text: 'Validation failed',
    },
  ];

  for (const testCase of cases) {
    it(`should map ${testCase.message} to ${testCase.status} ${testCase.code}`, async () => {
      const { status, body } = await run(new Error(testCase.message));
      expect(status).toBe(testCase.status);
      expect(body.error.code).toBe(testCase.code);
      expect(body.error.message).toBe(testCase.text);
      expect(body.error.requestId).toBe(REQUEST_ID);
      expect(spies.warn).toHaveBeenCalledWith(
        {
          requestId: REQUEST_ID,
          domainCode: testCase.message.split(':')[0],
          method: METHOD,
          path: PATH,
        },
        'Unmapped domain error reached global handler',
      );
      expect(errorMessages()).not.toContain('Unhandled error');
    });
  }

  it('should keep an arbitrary error at 500 INTERNAL_ERROR', async () => {
    const { status, body } = await run(new Error('boom'));
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('boom');
    expect(body.error.requestId).toBe(REQUEST_ID);
    expect(errorMessages()).toContain('Unhandled error');
  });
});

describe('errorHandler — pre-existing mappings', () => {
  it('should map a ZodError to 400 VALIDATION_ERROR with details', async () => {
    const err = Object.assign(new Error('Validation failed'), {
      name: 'ZodError',
      issues: [{ path: ['title'], message: 'Required' }],
    });
    const { status, body } = await run(err);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.[0]).toEqual({ field: 'title', message: 'Required' });
  });

  it('should map JWT failures to 401 UNAUTHORIZED', async () => {
    for (const message of ['jwt expired', 'jwt malformed', 'Invalid token']) {
      const { status, body } = await run(new Error(message));
      expect(status).toBe(401);
      expect(body.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('should map EQUIPMENT_INCOMPATIBLE to 422 with field details', async () => {
    const err = Object.assign(new Error('incompatible'), {
      code: 'EQUIPMENT_INCOMPATIBLE',
      details: ['Grinder X is not allowed'],
    });
    const { status, body } = await run(err);
    expect(status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.[0]).toEqual({
      field: 'equipmentIds',
      message: 'Grinder X is not allowed',
    });
  });
});
