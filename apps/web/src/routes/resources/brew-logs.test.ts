import type { BrewLogListItemOutput, PaginatedResponse } from '@brewform/shared/schemas';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../api/index.ts', () => ({
  brewLogApi: { listForRecipe: vi.fn(), getRecipeStats: vi.fn() },
}));

import { ApiError } from '../../api/errors.ts';
import { brewLogApi } from '../../api/index.ts';
import {
  recipeBrewLogsLoader,
  recipeBrewLogsPath,
  recipeBrewStatsLoader,
  recipeBrewStatsPath,
  shouldRevalidateBrewLogs,
} from './brew-logs.ts';

const mockApi = vi.mocked(brewLogApi);

/** Builds loader arguments for `recipeId`. */
function args(recipeId: string) {
  const request = new Request(`http://localhost/resources/brew-logs/recipe/${recipeId}`);
  return { request, params: { recipeId }, context: undefined } as never;
}

/** The paginated envelope `GET /brew-logs/recipe/:id` returns. */
function envelope(data: BrewLogListItemOutput[]): PaginatedResponse<BrewLogListItemOutput> {
  return {
    success: true,
    data,
    meta: { requestId: 't', pagination: { page: 1, perPage: 5, total: 0, totalPages: 0 } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resources/brew-logs', () => {
  it('builds the resource paths', () => {
    expect(recipeBrewLogsPath('r1')).toBe('/resources/brew-logs/recipe/r1');
    expect(recipeBrewStatsPath('r1')).toBe('/resources/brew-logs/stats/r1');
  });

  it('recipe history: first page of five logs, forwarding request.signal', async () => {
    const log = { id: 'bl1' } as BrewLogListItemOutput;
    mockApi.listForRecipe.mockResolvedValue(envelope([log]));
    const a = args('r1') as { request: Request };

    await expect(recipeBrewLogsLoader(a as never)).resolves.toEqual({ ok: true, logs: [log] });
    expect(mockApi.listForRecipe).toHaveBeenCalledWith(
      'r1',
      { page: 1, perPage: 5 },
      { signal: a.request.signal },
    );
  });

  it('recipe history: a failure (even a 401) returns { ok: false } instead of throwing', async () => {
    mockApi.listForRecipe.mockRejectedValue(new ApiError('UNAUTHORIZED', 'no', undefined, 401));
    await expect(recipeBrewLogsLoader(args('r1'))).resolves.toEqual({
      ok: false,
      error: 'no',
      code: 'UNAUTHORIZED',
    });
  });

  it('recipe stats: forwards request.signal and returns the stats', async () => {
    const stats = { recipeId: 'r1', brewCount: 3, avgBrewRating: 7.5 };
    mockApi.getRecipeStats.mockResolvedValue(stats);
    const a = args('r1') as { request: Request };

    await expect(recipeBrewStatsLoader(a as never)).resolves.toEqual({ ok: true, stats });
    expect(mockApi.getRecipeStats).toHaveBeenCalledWith('r1', { signal: a.request.signal });
  });

  it('recipe stats: a failure is logged and returned as { ok: false }', async () => {
    const err = new Error('down');
    mockApi.getRecipeStats.mockRejectedValue(err);
    await expect(recipeBrewStatsLoader(args('r1'))).resolves.toEqual({
      ok: false,
      error: 'down',
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err, recipeId: 'r1' },
      'recipeBrewStats failed',
    );
  });

  it('an abort is rethrown for the router', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    mockApi.getRecipeStats.mockRejectedValue(abort);
    await expect(recipeBrewStatsLoader(args('r1'))).rejects.toBe(abort);
  });

  it('revalidates only after a brew-log mutation', () => {
    const base = {
      currentUrl: new URL('http://localhost/recipes/x'),
      nextUrl: new URL('http://localhost/recipes/x'),
      defaultShouldRevalidate: true,
    } as Parameters<typeof shouldRevalidateBrewLogs>[0];
    expect(shouldRevalidateBrewLogs({ ...base, formAction: '/recipes/r1/like' })).toBe(false);
    expect(shouldRevalidateBrewLogs({ ...base, formAction: undefined })).toBe(false);
    expect(shouldRevalidateBrewLogs({ ...base, formAction: '/brew-logs/new' })).toBe(true);
  });
});
