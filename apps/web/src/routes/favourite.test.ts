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
    favourite: mockApi,
  },
}));

import { ApiError } from '../api/errors.ts';
import { favouriteAction } from './favourite.ts';

/** A form-carrying POST like `FavouriteButton` submits (`favourited` is the requested state). */
function makeRequest(requested?: string): Request {
  const form = new FormData();
  if (requested !== undefined) form.set('favourited', requested);
  return new Request('https://example.test/recipes/recipe-1/favourite', {
    method: 'POST',
    body: form,
  });
}

/** Cast `(id, request)` into the `ActionFunctionArgs` shape the action destructures. */
function makeArgs(id: string | undefined, request: Request = makeRequest('true')) {
  return { params: { id }, request } as unknown as Parameters<typeof favouriteAction>[0];
}

describe('favouriteAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { ok: true, favourited } and passes the request signal', async () => {
    mockApi.mockResolvedValue({ favourited: true });
    const request = makeRequest('true');

    const result = await favouriteAction(makeArgs('recipe-1', request));

    expect(result).toEqual({ ok: true, favourited: true });
    expect(mockApi).toHaveBeenCalledWith('recipe-1', { signal: request.signal });
    expect(mockLogger.debug).toHaveBeenCalledWith({ id: 'recipe-1' }, 'favouriteAction started');
    expect(mockLogger.debug).toHaveBeenCalledWith({ id: 'recipe-1' }, 'favouriteAction completed');
  });

  it.each([undefined, ''])(
    'returns { ok: false } without calling the API for id %j',
    async (id) => {
      const result = await favouriteAction(makeArgs(id));

      expect(result).toEqual({ ok: false, error: 'Missing or invalid route parameter: id' });
      expect(mockApi).not.toHaveBeenCalled();
    },
  );

  it('a failed un-favourite (favourited=false) returns the previous state (favourited: true)', async () => {
    mockApi.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Internal server error', undefined, 500),
    );

    const result = await favouriteAction(makeArgs('recipe-1', makeRequest('false')));

    expect(result).toEqual({
      ok: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      favourited: true,
    });
  });

  it('a failed favourite (favourited=true) returns the previous state (favourited: false)', async () => {
    mockApi.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await favouriteAction(makeArgs('recipe-1', makeRequest('true')));

    expect(result).toEqual({ ok: false, error: 'Failed to fetch', favourited: false });
  });

  it('returns no previous state when the form has no favourited field', async () => {
    mockApi.mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', undefined, 500));

    const result = await favouriteAction(makeArgs('recipe-1', makeRequest()));

    expect(result).toEqual({ ok: false, error: 'boom', code: 'INTERNAL_ERROR' });
  });

  it("returns code 'UNAUTHORIZED' for a final 401 (no redirect)", async () => {
    mockApi.mockRejectedValue(new ApiError('UNAUTHORIZED', 'no session', undefined, 401));

    const result = await favouriteAction(makeArgs('recipe-1', makeRequest('true')));

    expect(result).toEqual({
      ok: false,
      error: 'no session',
      code: 'UNAUTHORIZED',
      favourited: false,
    });
  });

  it('rethrows an aborted request', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    mockApi.mockRejectedValue(abort);

    await expect(favouriteAction(makeArgs('recipe-1'))).rejects.toBe(abort);
  });

  it('logs the failure with { err, id }', async () => {
    const err = new ApiError('INTERNAL_ERROR', 'boom', undefined, 500);
    mockApi.mockRejectedValue(err);

    await favouriteAction(makeArgs('recipe-1'));

    expect(mockLogger.error).toHaveBeenCalledWith(
      { err, id: 'recipe-1' },
      'favouriteAction failed',
    );
  });

  it("returns 'Request failed' for a non-Error rejection", async () => {
    mockApi.mockRejectedValue({ weird: true });

    const result = await favouriteAction(makeArgs('recipe-1', makeRequest('true')));

    expect(result).toEqual({ ok: false, error: 'Request failed', favourited: false });
  });
});
