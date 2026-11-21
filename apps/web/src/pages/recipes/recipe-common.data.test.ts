import type { RecipeDetailOutput } from '@brewform/shared/schemas';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/index.ts', () => ({
  recipeApi: { get: vi.fn() },
}));

import { ApiError } from '../../api/errors.ts';
import { recipeApi } from '../../api/index.ts';
import { getRecipeOr404, toRecipeFormFailure } from './recipe-common.data.ts';

const mockGet = vi.mocked(recipeApi.get);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getRecipeOr404', () => {
  it('returns the recipe and forwards the request options', async () => {
    const recipe = { id: 'r1' } as RecipeDetailOutput;
    mockGet.mockResolvedValue(recipe);
    const signal = new AbortController().signal;

    await expect(getRecipeOr404('slug', { signal })).resolves.toBe(recipe);
    expect(mockGet).toHaveBeenCalledWith('slug', { signal });
  });

  it('throws a 404 Response for an API 404', async () => {
    mockGet.mockRejectedValue(new ApiError('NOT_FOUND', 'missing', undefined, 404));

    const thrown = await getRecipeOr404('gone', {}).catch((err: unknown) => err);

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
  });

  it('rethrows any other error unchanged', async () => {
    const err = new ApiError('INTERNAL_ERROR', 'boom', undefined, 500);
    mockGet.mockRejectedValue(err);

    await expect(getRecipeOr404('slug', {})).rejects.toBe(err);
  });
});

describe('toRecipeFormFailure', () => {
  it('keeps the field details of an API validation error', () => {
    const details = [{ field: 'title', message: 'Required' }];
    expect(toRecipeFormFailure(new ApiError('VALIDATION_ERROR', 'Invalid', details, 400))).toEqual({
      ok: false,
      error: 'Invalid',
      code: 'VALIDATION_ERROR',
      details,
    });
  });

  it('returns the message of a plain error and an empty message for a non-Error', () => {
    expect(toRecipeFormFailure(new Error('down'))).toEqual({ ok: false, error: 'down' });
    expect(toRecipeFormFailure('nope')).toEqual({ ok: false, error: '' });
  });

  it('rethrows aborts and 401s for the router and requireAuth', () => {
    const abort = new DOMException('aborted', 'AbortError');
    const unauthorized = new ApiError('UNAUTHORIZED', 'no', undefined, 401);
    expect(() => toRecipeFormFailure(abort)).toThrow(abort);
    expect(() => toRecipeFormFailure(unauthorized)).toThrow(unauthorized);
  });
});
