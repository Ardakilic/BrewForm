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
  qrcodeApi: { recipeSvg: vi.fn() },
}));

import { ApiError } from '../../api/errors.ts';
import { qrcodeApi } from '../../api/index.ts';
import { recipeQrLoader, recipeQrPath, shouldRevalidateRecipeQr } from './qrcode.ts';

const mockRecipeSvg = vi.mocked(qrcodeApi.recipeSvg);

/** Runs the loader for `slug`, optionally with an abort signal. */
function runLoader(slug: string, signal?: AbortSignal) {
  return recipeQrLoader({
    params: { slug },
    request: new Request(`http://localhost${recipeQrPath(slug)}`, signal ? { signal } : undefined),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resources/qrcode/recipe/:slug loader', () => {
  it('returns { ok: true, svg } and forwards the request signal', async () => {
    mockRecipeSvg.mockResolvedValue('<svg/>');
    const controller = new AbortController();

    await expect(runLoader('cold-brew', controller.signal)).resolves.toEqual({
      ok: true,
      svg: '<svg/>',
    });
    expect(mockRecipeSvg).toHaveBeenCalledWith('cold-brew', { signal: expect.any(AbortSignal) });
    const opts = mockRecipeSvg.mock.calls[0][1];
    controller.abort();
    expect(opts?.signal?.aborted).toBe(true);
  });

  it('logs entry and exit with the slug only', async () => {
    mockRecipeSvg.mockResolvedValue('<svg/>');

    await runLoader('cold-brew');

    expect(mockLogger.debug).toHaveBeenCalledWith({ slug: 'cold-brew' }, 'recipeQr started');
    expect(mockLogger.debug).toHaveBeenCalledWith({ slug: 'cold-brew' }, 'recipeQr completed');
  });

  it('returns { ok: false, error } and logs the failure when the request fails', async () => {
    const err = new ApiError('NOT_FOUND', 'Recipe not found', undefined, 404);
    mockRecipeSvg.mockRejectedValue(err);

    await expect(runLoader('missing')).resolves.toEqual({
      ok: false,
      error: 'Recipe not found',
      code: 'NOT_FOUND',
    });
    expect(mockLogger.error).toHaveBeenCalledWith({ err, slug: 'missing' }, 'recipeQr failed');
  });

  it('rethrows an aborted request', async () => {
    mockRecipeSvg.mockRejectedValue(new DOMException('aborted', 'AbortError'));

    await expect(runLoader('cold-brew')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('builds an encoded resource path and never revalidates after actions', () => {
    expect(recipeQrPath('a b')).toBe('/resources/qrcode/recipe/a%20b');
    expect(shouldRevalidateRecipeQr()).toBe(false);
  });
});
