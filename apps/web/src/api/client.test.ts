import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

import { sessionId } from '../utils/sessionId.ts';
import { api } from './client.ts';
import { ApiError, isAbortError, isApiError } from './errors.ts';

/** Builds a JSON `Response`. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe('error helpers', () => {
  it('isApiError narrows ApiError instances only', () => {
    expect(isApiError(new ApiError('X', 'x'))).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
  });

  it('isAbortError recognises DOMException and plain AbortErrors', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(true);
    expect(isAbortError(new Error('boom'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});

describe('api client', () => {
  it('should send X-Request-ID header with sessionId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/test');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fetchArgs = fetchMock.mock.calls[0];
    const url = fetchArgs[0] as string;
    const init = fetchArgs[1] as RequestInit;
    expect(url).toContain('/test');
    expect((init.headers as Headers).get('X-Request-ID')).toBe(sessionId);
  });

  it('passes the caller signal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await api.get('/things', { signal: controller.signal });

    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
  });

  it('shares one POST /auth/refresh among three parallel 401s and retries each request once', async () => {
    const attempts = new Map<string, number>();
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith('/auth/refresh')) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return json({ data: { refreshed: true } });
      }
      const n = (attempts.get(input) ?? 0) + 1;
      attempts.set(input, n);
      if (n === 1) return json({ error: { code: 'UNAUTHORIZED', message: 'expired' } }, 401);
      return json({ data: { url: input, method: init?.method } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
    expect(refreshCalls[0][1]?.method).toBe('POST');
    expect([...attempts.values()]).toEqual([2, 2, 2]);
    expect(results.map((r) => (r as { url: string }).url.replace(/^.*\//, '/'))).toEqual([
      '/a',
      '/b',
      '/c',
    ]);
  });

  it('starts a new refresh for a later 401 once the previous refresh has settled', async () => {
    let refreshes = 0;
    const attempts = new Map<string, number>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (input.endsWith('/auth/refresh')) {
          refreshes++;
          return json({ data: {} });
        }
        const n = (attempts.get(input) ?? 0) + 1;
        attempts.set(input, n);
        return n === 1 ? json({ error: { code: 'UNAUTHORIZED' } }, 401) : json({ data: 'ok' });
      }),
    );

    await api.get('/first');
    await api.get('/second');

    expect(refreshes).toBe(2);
  });

  it('rejects an aborted request with AbortError and logs no error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'AbortError')),
            );
          }),
      ),
    );
    const controller = new AbortController();

    const pending = api.get('/slow', { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: '/slow' }),
      'API request aborted',
    );
  });

  it('throws ApiError with status 502 for an HTML proxy error page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html><body>502 Bad Gateway</body></html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );

    const error = await api.get('/recipes').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
    expect((error as ApiError).code).toBe('INVALID_RESPONSE');
  });

  it('throws ApiError INVALID_RESPONSE for an empty error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));

    const error = await api.get('/x').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(503);
  });
});

describe('rate-limited responses', () => {
  /** A 429 envelope response with an optional `Retry-After` header. */
  function tooMany(retryAfter?: string): Response {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (retryAfter !== undefined) headers['Retry-After'] = retryAfter;
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many login attempts', requestId: 'r1' },
      }),
      { status: 429, headers },
    );
  }

  it('exposes Retry-After (delta-seconds) as retryAfterSeconds on a 429 ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(tooMany('120')));

    const error = await api.post('/auth/login', {}).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('RATE_LIMITED');
    expect((error as ApiError).status).toBe(429);
    expect((error as ApiError).retryAfterSeconds).toBe(120);
  });

  it('leaves retryAfterSeconds undefined when Retry-After is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(tooMany()));

    const error = await api.post('/auth/login', {}).catch((err: unknown) => err);

    expect((error as ApiError).code).toBe('RATE_LIMITED');
    expect((error as ApiError).retryAfterSeconds).toBeUndefined();
  });

  it('leaves retryAfterSeconds undefined for an invalid or HTTP-date Retry-After', async () => {
    for (const value of ['soon', '-5', '1.5', 'Wed, 21 Oct 2026 07:28:00 GMT']) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(tooMany(value)));
      const error = await api.post('/auth/login', {}).catch((err: unknown) => err);
      expect((error as ApiError).retryAfterSeconds).toBeUndefined();
    }
  });
});
