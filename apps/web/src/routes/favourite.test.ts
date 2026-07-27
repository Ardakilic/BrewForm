import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFavourite } = vi.hoisted(() => ({ mockFavourite: vi.fn() }));

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
    favourite: mockFavourite,
  },
}));

import { favouriteAction } from './favourite.ts';

/** Cast a `params` bag into the `ActionFunctionArgs` shape the action destructures. */
function makeArgs(id: string | undefined) {
  return { params: { id } } as unknown as Parameters<typeof favouriteAction>[0];
}

describe('favouriteAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toggles the favourite state and returns { ok: true } on success', async () => {
    mockFavourite.mockResolvedValue({ favourited: true });

    const result = await favouriteAction(makeArgs('recipe-1'));

    expect(result).toEqual({ ok: true });
    expect(mockFavourite).toHaveBeenCalledWith('recipe-1');
  });

  it('returns { ok: false } when the id param is missing', async () => {
    const result = await favouriteAction(makeArgs(undefined));

    expect(result).toEqual({ ok: false, error: 'Missing route parameter: id' });
    expect(mockFavourite).not.toHaveBeenCalled();
  });

  it('returns { ok: false } when the id param is an empty string', async () => {
    const result = await favouriteAction(makeArgs(''));

    expect(result).toEqual({ ok: false, error: 'Missing route parameter: id' });
    expect(mockFavourite).not.toHaveBeenCalled();
  });

  it('returns the error message when the API call rejects with an Error', async () => {
    mockFavourite.mockRejectedValue(new Error('boom'));

    const result = await favouriteAction(makeArgs('recipe-1'));

    expect(result).toEqual({ ok: false, error: 'boom' });
  });

  it('returns a generic message when the API call rejects with a non-Error', async () => {
    mockFavourite.mockRejectedValue('string failure');

    const result = await favouriteAction(makeArgs('recipe-1'));

    expect(result).toEqual({ ok: false, error: 'Favourite failed' });
  });
});
