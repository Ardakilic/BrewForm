import type { Context } from 'hono';
import { createLogger } from '../utils/logger/index.ts';
import { config } from '../config/index.ts';

const log = createLogger('errorHandler');

export function errorHandler(err: Error, c: Context) {
  const requestId = c.get('requestId') as string | undefined;

  if (err.name === 'PostgresError') {
    const pgErr = err as { code?: string };
    log.error({ err, requestId, pgCode: pgErr.code }, 'Database error');

    if (pgErr.code === '23505') {
      return c.json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'A record with this value already exists',
          requestId,
        },
      }, 409);
    }
  }

  if (err.name === 'ZodError') {
    const zodErr = err as unknown as {
      errors?: Array<{ path: (string | number)[]; message: string }>;
    };
    const details = zodErr.errors?.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    })) || [];
    return c.json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details,
        requestId,
      },
    }, 400);
  }

  if (
    err.name === 'UnauthorizedError' ||
    (err instanceof Error &&
      (err.message === 'Invalid token' || err.message === 'jwt expired' ||
        err.message === 'jwt malformed'))
  ) {
    return c.json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        requestId,
      },
    }, 401);
  }

  log.error({ err, requestId }, 'Unhandled error');

  return c.json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: config.APP_ENV === 'production' ? 'Something went wrong' : err.message,
      requestId,
    },
  }, 500);
}
