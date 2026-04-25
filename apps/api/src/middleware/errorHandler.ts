import type { Context } from 'hono';
import { createLogger } from '../utils/logger/index.ts';
import { Prisma } from '@prisma/client';
import { config } from '../config/index.ts';

const log = createLogger('errorHandler');

export function errorHandler(err: Error, c: Context) {
  const requestId = c.get('requestId') as string | undefined;

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    log.error({ err, requestId, prismaCode: err.code }, 'Prisma error');

    if (err.code === 'P2002') {
      return c.json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'A record with this value already exists',
          requestId,
        },
      }, 409);
    }
    if (err.code === 'P2025') {
      return c.json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Record not found',
          requestId,
        },
      }, 404);
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    log.warn({ err, requestId }, 'Prisma validation error');
    return c.json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid data provided',
        requestId,
      },
    }, 400);
  }

  if (err.name === 'ZodError') {
    const zodErr = err as unknown as { errors?: Array<{ path: (string | number)[]; message: string }> };
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
    (err instanceof Error && (err.message === 'Invalid token' || err.message === 'jwt expired' || err.message === 'jwt malformed'))
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