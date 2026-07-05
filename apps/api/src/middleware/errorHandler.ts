import type { Context } from 'hono';
import { createLogger } from '../utils/logger/index.ts';
import { config } from '../config/index.ts';

const log = createLogger('errorHandler');

/**
 * Global Hono error handler mapping known errors to JSON error envelopes:
 * equipment incompatibility -> 422, Postgres unique violation -> 409,
 * ZodError -> 400, auth/JWT failures -> 401, COFFEE_VARIETY_NOT_FOUND -> 404.
 * Everything else logs and returns 500, hiding the message in production.
 */
export function errorHandler(err: Error, c: Context) {
  const requestId = c.get('requestId') as string | undefined;

  if (err instanceof Error && 'code' in err && err.code === 'EQUIPMENT_INCOMPATIBLE') {
    const rawDetails = 'details' in err
      ? (err as Error & { details?: unknown }).details
      : undefined;
    const detailStrings = Array.isArray(rawDetails)
      ? rawDetails.filter((d): d is string => typeof d === 'string')
      : [];
    const details = detailStrings.map((d) => ({
      field: 'equipmentIds',
      message: d,
    }));
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Equipment is not compatible with the selected brew method',
          details,
          requestId,
        },
      },
      422,
    );
  }

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
    const zodErr = err instanceof Error && 'issues' in err
      ? (err as Error & { issues?: Array<{ path: (string | number)[]; message: string }> })
      : null;
    const details = zodErr?.issues?.map((e) => ({
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

  // Known not-found error message from service layer
  if (err instanceof Error && err.message === 'COFFEE_VARIETY_NOT_FOUND') {
    return c.json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Coffee variety not found',
        requestId,
      },
    }, 404);
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
