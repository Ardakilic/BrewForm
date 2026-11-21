import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockApi, mockLogger } = vi.hoisted(() => ({
  mockApi: vi.fn(),
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

vi.mock('../api/index.ts', () => ({
  recipeApi: {
    like: mockApi,
  },
}));

import { ApiError } from '../api/errors.ts';
import { likeAction } from './like.ts';

/** A form-carrying POST like `LikeButton` submits (`liked` is the requested state). */
function makeRequest(requested?: string): Request {
  const form = new FormData();
  if (requested !== undefined) form.set('liked', requested);
  return new Request('https://example.test/recipes/recipe-1/like', {
    method: 'POST',
    body: form,
  });
}

/** Cast `(id, request)` into the `ActionFunctionArgs` shape the action destructures. */
function makeArgs(id: string | undefined, request: Request = makeRequest('true')) {
  return { params: { id }, request } as unknown as Parameters<typeof likeAction>[0];
}

describe('likeAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { ok: true, liked } and passes the request signal', async () => {
    mockApi.mockResolvedValue({ liked: true });
    const request = makeRequest('true');

    const result = await likeAction(makeArgs('recipe-1', request));

    expect(result).toEqual({ ok: true, liked: true });
    expect(mockApi).toHaveBeenCalledWith('recipe-1', { signal: request.signal });
    expect(mockLogger.debug).toHaveBeenCalledWith({ id: 'recipe-1' }, 'likeAction started');
    expect(mockLogger.debug).toHaveBeenCalledWith({ id: 'recipe-1' }, 'likeAction completed');
  });

  it.each([undefined, ''])(
    'returns { ok: false } without calling the API for id %j',
    async (id) => {
      const result = await likeAction(makeArgs(id));

      expect(result).toEqual({ ok: false, error: 'Missing or invalid route parameter: id' });
      expect(mockApi).not.toHaveBeenCalled();
    },
  );

  it('a failed un-like (liked=false) returns the previous state (liked: true)', async () => {
    mockApi.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Internal server error', undefined, 500),
    );

    const result = await likeAction(makeArgs('recipe-1', makeRequest('false')));

    expect(result).toEqual({
      ok: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      liked: true,
    });
  });

  it('a failed like (liked=true) returns the previous state (liked: false)', async () => {
    mockApi.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await likeAction(makeArgs('recipe-1', makeRequest('true')));

    expect(result).toEqual({ ok: false, error: 'Failed to fetch', liked: false });
  });

  it('returns no previous state when the form has no liked field', async () => {
    mockApi.mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', undefined, 500));

    const result = await likeAction(makeArgs('recipe-1', makeRequest()));

    expect(result).toEqual({ ok: false, error: 'boom', code: 'INTERNAL_ERROR' });
  });

  it("returns code 'UNAUTHORIZED' for a final 401 (no redirect)", async () => {
    mockApi.mockRejectedValue(new ApiError('UNAUTHORIZED', 'no session', undefined, 401));

    const result = await likeAction(makeArgs('recipe-1', makeRequest('true')));

    expect(result).toEqual({
      ok: false,
      error: 'no session',
      code: 'UNAUTHORIZED',
      liked: false,
    });
  });

  it('rethrows an aborted request', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    mockApi.mockRejectedValue(abort);

    await expect(likeAction(makeArgs('recipe-1'))).rejects.toBe(abort);
  });

  it('logs the failure with { err, id }', async () => {
    const err = new ApiError('INTERNAL_ERROR', 'boom', undefined, 500);
    mockApi.mockRejectedValue(err);

    await likeAction(makeArgs('recipe-1'));

    expect(mockLogger.error).toHaveBeenCalledWith({ err, id: 'recipe-1' }, 'likeAction failed');
  });

  it("returns 'Request failed' for a non-Error rejection", async () => {
    mockApi.mockRejectedValue({ weird: true });

    const result = await likeAction(makeArgs('recipe-1', makeRequest('true')));

    expect(result).toEqual({ ok: false, error: 'Request failed', liked: false });
  });
});
