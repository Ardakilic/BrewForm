import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRate, mockLogger } = vi.hoisted(() => ({
  mockRate: vi.fn(),
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
    rate: mockRate,
  },
}));

import { ApiError } from '../api/errors.ts';
import { rateAction } from './rate.ts';

/** Build a POST `Request` carrying a `rating` form field. */
function makeRequest(rating: string): Request {
  const form = new FormData();
  form.set('rating', rating);
  return new Request('https://example.test/recipes/recipe-1/rate', { method: 'POST', body: form });
}

/** Cast `(id, request)` into the `ActionFunctionArgs` shape the action destructures. */
function makeArgs(id: string | undefined, request: Request) {
  return { params: { id }, request } as unknown as Parameters<typeof rateAction>[0];
}

describe('rateAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { ok: true, rating, avgRating, ratingCount } and passes the request signal', async () => {
    mockRate.mockResolvedValue({ rating: 8, avgRating: 7.5, ratingCount: 12 });
    const request = makeRequest('8');

    const result = await rateAction(makeArgs('recipe-1', request));

    expect(result).toEqual({ ok: true, rating: 8, avgRating: 7.5, ratingCount: 12 });
    expect(mockRate).toHaveBeenCalledWith('recipe-1', 8, { signal: request.signal });
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { id: 'recipe-1', rating: 8 },
      'rateAction started',
    );
  });

  it.each([
    ['a missing id', undefined, '8'],
    ['an empty id', '', '8'],
    ['a non-numeric rating', 'recipe-1', 'abc'],
    ['a rating below 1', 'recipe-1', '0'],
    ['a rating above 10', 'recipe-1', '11'],
  ])('returns VALIDATION_ERROR for %s without calling the API', async (_case, id, rating) => {
    const result = await rateAction(makeArgs(id, makeRequest(rating)));

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    expect(mockRate).not.toHaveBeenCalled();
  });

  it.each([
    [500, 'INTERNAL_ERROR'],
    [401, 'UNAUTHORIZED'],
  ])('returns { ok: false, code } for an ApiError %i instead of throwing', async (status, code) => {
    mockRate.mockRejectedValue(new ApiError(code, 'nope', undefined, status));

    const result = await rateAction(makeArgs('recipe-1', makeRequest('5')));

    expect(result).toEqual({ ok: false, error: 'nope', code });
  });

  it('keeps retryAfterSeconds for a 429', async () => {
    mockRate.mockRejectedValue(new ApiError('RATE_LIMITED', 'slow down', undefined, 429, 30));

    const result = await rateAction(makeArgs('recipe-1', makeRequest('5')));

    expect(result).toEqual({
      ok: false,
      error: 'slow down',
      code: 'RATE_LIMITED',
      retryAfterSeconds: 30,
    });
  });

  it('returns the message of a network failure', async () => {
    mockRate.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await rateAction(makeArgs('recipe-1', makeRequest('5')));

    expect(result).toEqual({ ok: false, error: 'Failed to fetch' });
  });

  it('rethrows an aborted request', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    mockRate.mockRejectedValue(abort);

    await expect(rateAction(makeArgs('recipe-1', makeRequest('5')))).rejects.toBe(abort);
  });

  it('logs the failure with { err, id, rating }', async () => {
    const err = new ApiError('INTERNAL_ERROR', 'boom', undefined, 500);
    mockRate.mockRejectedValue(err);

    await rateAction(makeArgs('recipe-1', makeRequest('6')));

    expect(mockLogger.error).toHaveBeenCalledWith(
      { err, id: 'recipe-1', rating: 6 },
      'rateAction failed',
    );
  });
});
