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
  coffeeVarietyApi: { search: vi.fn() },
}));

import { ApiError } from '../../api/errors.ts';
import { coffeeVarietyApi } from '../../api/index.ts';
import {
  coffeeVarietySearchHref,
  coffeeVarietySearchLoader,
  shouldRevalidateCoffeeVarietySearch,
} from './coffee-varieties.ts';

const mockSearch = vi.mocked(coffeeVarietyApi.search);

/** Runs the loader for `href` with an optional abort signal. */
function run(href: string, signal?: AbortSignal) {
  return coffeeVarietySearchLoader({ request: new Request(`http://localhost${href}`, { signal }) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resources/coffee-varieties/search loader', () => {
  it('builds an encoded search href', () => {
    expect(coffeeVarietySearchHref('ge sha')).toBe('/resources/coffee-varieties/search?q=ge+sha');
  });

  it('returns the matches and forwards request.signal', async () => {
    mockSearch.mockResolvedValue([{ id: 'v1', name: 'Gesha', category: 'variety' }]);

    await expect(run(coffeeVarietySearchHref('gesha'))).resolves.toEqual({
      ok: true,
      query: 'gesha',
      results: [{ id: 'v1', name: 'Gesha', category: 'variety' }],
    });
    expect(mockSearch).toHaveBeenCalledWith('gesha', { signal: expect.any(AbortSignal) });
  });

  it('returns no results without a request for a query shorter than two characters', async () => {
    await expect(run(coffeeVarietySearchHref(' g '))).resolves.toEqual({
      ok: true,
      query: 'g',
      results: [],
    });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('returns { ok: false } and logs the failure instead of throwing', async () => {
    const err = new ApiError('SERVER_ERROR', 'boom', undefined, 500);
    mockSearch.mockRejectedValue(err);

    await expect(run(coffeeVarietySearchHref('gesha'))).resolves.toMatchObject({
      ok: false,
      query: 'gesha',
      error: 'boom',
      code: 'SERVER_ERROR',
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err }),
      'coffeeVarietySearch failed',
    );
  });

  it('rethrows an aborted request', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    mockSearch.mockRejectedValue(abort);

    await expect(run(coffeeVarietySearchHref('gesha'))).rejects.toBe(abort);
  });

  it('never re-runs the last search after an action elsewhere', () => {
    expect(shouldRevalidateCoffeeVarietySearch()).toBe(false);
  });
});
