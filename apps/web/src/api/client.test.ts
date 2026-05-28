import { describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './client.ts';
import { sessionId } from '../utils/sessionId.ts';

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

describe('api client', () => {
  it('should send X-Request-ID header with sessionId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/test');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fetchArgs = fetchMock.mock.calls[0];
    const url = fetchArgs[0] as string;
    const init = fetchArgs[1] as RequestInit;
    expect(url).toContain('/test');
    expect((init.headers as Headers).get('X-Request-ID')).toBe(sessionId);

    vi.unstubAllGlobals();
  });
});
