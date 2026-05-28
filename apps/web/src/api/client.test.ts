import { describe, expect, it } from 'vitest';
import { ApiError } from './client.ts';

describe('ApiError', () => {
  it('should construct with structured error format', () => {
    const err = new ApiError(
      'VALIDATION_ERROR',
      'Validation failed',
      [{ field: 'name', message: 'Required' }],
      400,
    );
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Validation failed');
    expect(err.status).toBe(400);
    expect(err.details).toEqual([{ field: 'name', message: 'Required' }]);
  });

  it('should default status to 500 when not provided', () => {
    const err = new ApiError('ERROR', 'msg');
    expect(err.status).toBe(500);
  });

  it('should have undefined details when not provided', () => {
    const err = new ApiError('NOT_FOUND', 'Not found', undefined, 404);
    expect(err.details).toBeUndefined();
  });
});
