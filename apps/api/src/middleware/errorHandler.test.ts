/**
 * Error Handler Middleware Tests
 */

import { beforeEach, describe, it } from '@std/testing';
import { expect } from '@std/expect';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  AppError,
  BadRequestError,
  ConflictError,
  errorHandler,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from './_impl/errorHandler.ts';
import * as configMock from '../test/mocks/config.ts';

describe('Error Handler Middleware', () => {
  beforeEach(() => {
    configMock.resetConfig();
  });

  describe('Error Classes', () => {
    it('should create AppError with correct properties', () => {
      const error = new AppError('Test error', 500, 'TEST_ERROR', {
        foo: 'bar',
      });

      expect(error.name).toBe('AppError');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.details).toEqual({ foo: 'bar' });
    });

    it('should create NotFoundError with correct defaults', () => {
      const error = new NotFoundError('User');

      expect(error.name).toBe('AppError');
      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
    });

    it('should create UnauthorizedError with correct defaults', () => {
      const error = new UnauthorizedError();

      expect(error.message).toBe('Unauthorized');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
    });

    it('should create ForbiddenError with correct defaults', () => {
      const error = new ForbiddenError('No access');

      expect(error.message).toBe('No access');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
    });

    it('should create BadRequestError with details', () => {
      const error = new BadRequestError('Invalid input', { field: 'email' });

      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.details).toEqual({ field: 'email' });
    });

    it('should create ConflictError with correct defaults', () => {
      const error = new ConflictError('Email already exists');

      expect(error.message).toBe('Email already exists');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
    });

    it('should create ValidationError with errors array', () => {
      const errors = [
        { field: 'email', message: 'Invalid email' },
        { field: 'password', message: 'Too short' },
      ];
      const error = new ValidationError(errors);

      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toEqual({ errors });
    });
  });

  describe('errorHandler', () => {
    it('should handle ZodError and return 422', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('requestId', 'test-request-id');
        await next();
      });
      app.get('/test', () => {
        const schema = z.object({ email: z.string().email() });
        schema.parse({ email: 'invalid' });
        throw new Error('Should not reach here');
      });
      app.onError(errorHandler);

      const response = await app.request('/test');
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Validation failed');
      expect(Array.isArray(body.error.errors)).toBe(true);
      expect(body.error.errors.length).toBeGreaterThan(0);
    });

    it('should handle AppError and return correct status', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('requestId', 'test-request-id');
        await next();
      });
      app.get('/test', () => {
        throw new NotFoundError('Recipe');
      });
      app.onError(errorHandler);

      const response = await app.request('/test');
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Recipe not found');
    });

    it('should handle HTTPException and return correct status', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('requestId', 'test-request-id');
        await next();
      });
      app.get('/test', () => {
        throw new HTTPException(418, { message: "I'm a teapot" });
      });
      app.onError(errorHandler);

      const response = await app.request('/test');
      const body = await response.json();

      expect(response.status).toBe(418);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('HTTP_ERROR');
      expect(body.error.message).toBe("I'm a teapot");
    });

    it('should handle unknown error in development mode with stack', async () => {
      configMock.setConfig({ nodeEnv: 'development' });

      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('requestId', 'test-request-id');
        await next();
      });
      app.get('/test', () => {
        throw new Error('Something went wrong');
      });
      app.onError(errorHandler);

      const response = await app.request('/test');
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('Something went wrong');
      expect(body.error.stack).toBeDefined();
    });

    it('should handle unknown error in production mode with generic message', async () => {
      configMock.setConfig({ nodeEnv: 'production' });

      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('requestId', 'test-request-id');
        await next();
      });
      app.get('/test', () => {
        throw new Error('Internal database error');
      });
      app.onError(errorHandler);

      const response = await app.request('/test');
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('An unexpected error occurred');
      expect(body.error.stack).toBeUndefined();
    });

    it('should include details in AppError response', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('requestId', 'test-request-id');
        await next();
      });
      app.get('/test', () => {
        throw new BadRequestError('Invalid data', {
          field: 'username',
          reason: 'too_short',
        });
      });
      app.onError(errorHandler);

      const response = await app.request('/test');
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.details).toEqual({
        field: 'username',
        reason: 'too_short',
      });
    });
  });
});
