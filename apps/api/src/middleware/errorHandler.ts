/**
 * BrewForm Error Handler Middleware
 * Catches and formats all errors
 */

import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { getLogger } from '../utils/logger/index.js';
import { getConfig } from '../config/index.js';

// ============================================
// Custom Error Types
// ============================================

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class ValidationError extends AppError {
  constructor(errors: Array<{ field: string; message: string }>) {
    super('Validation failed', 422, 'VALIDATION_ERROR', { errors });
  }
}

// ============================================
// Error Handler
// ============================================

/**
 * Format Zod validation errors
 */
function formatZodErrors(error: ZodError): Array<{ field: string; message: string }> {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
}

/**
 * Global error handler
 */
export function errorHandler(err: Error, c: Context) {
  const logger = getLogger();
  const config = getConfig();
  const requestId = c.get('requestId');

  // Log the error
  logger.error({
    type: 'error',
    requestId,
    error: {
      name: err.name,
      message: err.message,
      stack: config.nodeEnv === 'development' ? err.stack : undefined,
    },
  });

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          errors: formatZodErrors(err),
        },
      },
      422
    );
  }

  // Handle custom AppError
  if (err instanceof AppError) {
    return c.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          ...(err.details && { details: err.details }),
        },
      },
      err.statusCode as 400 | 401 | 403 | 404 | 409 | 422 | 500
    );
  }

  // Handle Hono HTTPException
  if (err instanceof HTTPException) {
    return c.json(
      {
        success: false,
        error: {
          code: 'HTTP_ERROR',
          message: err.message,
        },
      },
      err.status
    );
  }

  // Handle unknown errors
  const message =
    config.nodeEnv === 'production'
      ? 'An unexpected error occurred'
      : err.message;

  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message,
        ...(config.nodeEnv === 'development' && { stack: err.stack }),
      },
    },
    500
  );
}

export default errorHandler;
