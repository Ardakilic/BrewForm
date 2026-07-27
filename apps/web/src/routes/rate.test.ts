import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRate } = vi.hoisted(() => ({ mockRate: vi.fn() }));

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

vi.mock('../api/index.ts', () => ({
  recipeApi: {
    rate: mockRate,
  },
}));

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

  it('submits the rating and returns the API result on success', async () => {
    const apiResult = { rating: 8, avgRating: 7.5, ratingCount: 12 };
    mockRate.mockResolvedValue(apiResult);

    const result = await rateAction(makeArgs('recipe-1', makeRequest('8')));

    expect(result).toBe(apiResult);
    expect(mockRate).toHaveBeenCalledWith('recipe-1', 8);
  });

  it('throws a 400 Response when the id param is missing', async () => {
    await expect(rateAction(makeArgs(undefined, makeRequest('8')))).rejects.toMatchObject({
      status: 400,
    });
    expect(mockRate).not.toHaveBeenCalled();
  });

  it('throws a 400 Response when the id param is an empty string', async () => {
    await expect(rateAction(makeArgs('', makeRequest('8')))).rejects.toMatchObject({ status: 400 });
    expect(mockRate).not.toHaveBeenCalled();
  });

  it('throws a 400 Response when the rating is non-numeric', async () => {
    await expect(rateAction(makeArgs('recipe-1', makeRequest('not-a-number')))).rejects
      .toMatchObject({ status: 400 });
    expect(mockRate).not.toHaveBeenCalled();
  });

  it('propagates API errors thrown by recipeApi.rate', async () => {
    mockRate.mockRejectedValue(new Error('server error'));

    await expect(rateAction(makeArgs('recipe-1', makeRequest('5')))).rejects.toThrow(
      'server error',
    );
  });
});
