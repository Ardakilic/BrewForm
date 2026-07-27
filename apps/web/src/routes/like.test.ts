import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLike } = vi.hoisted(() => ({ mockLike: vi.fn() }));

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
    like: mockLike,
  },
}));

import { likeAction } from './like.ts';

/** Cast a `params` bag into the `ActionFunctionArgs` shape the action destructures. */
function makeArgs(id: string | undefined) {
  return { params: { id } } as unknown as Parameters<typeof likeAction>[0];
}

describe('likeAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toggles the like state and returns { ok: true } on success', async () => {
    mockLike.mockResolvedValue({ liked: true });

    const result = await likeAction(makeArgs('recipe-1'));

    expect(result).toEqual({ ok: true });
    expect(mockLike).toHaveBeenCalledWith('recipe-1');
  });

  it('returns { ok: false } when the id param is missing', async () => {
    const result = await likeAction(makeArgs(undefined));

    expect(result).toEqual({ ok: false, error: 'Missing or invalid route parameter: id' });
    expect(mockLike).not.toHaveBeenCalled();
  });

  it('returns { ok: false } when the id param is an empty string', async () => {
    const result = await likeAction(makeArgs(''));

    expect(result).toEqual({ ok: false, error: 'Missing or invalid route parameter: id' });
    expect(mockLike).not.toHaveBeenCalled();
  });

  it('returns the error message when the API call rejects with an Error', async () => {
    mockLike.mockRejectedValue(new Error('boom'));

    const result = await likeAction(makeArgs('recipe-1'));

    expect(result).toEqual({ ok: false, error: 'boom' });
  });

  it('returns a generic message when the API call rejects with a non-Error', async () => {
    mockLike.mockRejectedValue({ weird: true });

    const result = await likeAction(makeArgs('recipe-1'));

    expect(result).toEqual({ ok: false, error: 'Like failed' });
  });
});
