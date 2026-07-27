import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFollow, mockUnfollow } = vi.hoisted(() => ({
  mockFollow: vi.fn(),
  mockUnfollow: vi.fn(),
}));

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
  followApi: {
    follow: mockFollow,
    unfollow: mockUnfollow,
  },
}));

import { followAction } from './follow.ts';

/** Build a `Request` with the given HTTP method for the action to inspect. */
function makeRequest(method: string): Request {
  return new Request('https://example.test/follow/user-1', { method });
}

/** Cast `(userId, request)` into the `ActionFunctionArgs` shape the action destructures. */
function makeArgs(userId: string | undefined, request: Request) {
  return { params: { userId }, request } as unknown as Parameters<typeof followAction>[0];
}

describe('followAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('follows on POST and returns { ok: true }', async () => {
    mockFollow.mockResolvedValue({ id: 'f1' });

    const result = await followAction(makeArgs('user-1', makeRequest('POST')));

    expect(result).toEqual({ ok: true });
    expect(mockFollow).toHaveBeenCalledWith('user-1');
    expect(mockUnfollow).not.toHaveBeenCalled();
  });

  it('unfollows on DELETE and returns { ok: true }', async () => {
    mockUnfollow.mockResolvedValue({ message: 'ok' });

    const result = await followAction(makeArgs('user-1', makeRequest('DELETE')));

    expect(result).toEqual({ ok: true });
    expect(mockUnfollow).toHaveBeenCalledWith('user-1');
    expect(mockFollow).not.toHaveBeenCalled();
  });

  it('returns { ok: false } when the userId param is missing', async () => {
    const result = await followAction(makeArgs(undefined, makeRequest('POST')));

    expect(result).toEqual({ ok: false, error: 'Missing or invalid userId' });
    expect(mockFollow).not.toHaveBeenCalled();
    expect(mockUnfollow).not.toHaveBeenCalled();
  });

  it('returns { ok: false } for an unsupported HTTP method', async () => {
    const result = await followAction(makeArgs('user-1', makeRequest('GET')));

    expect(result).toEqual({ ok: false, error: 'Unsupported method' });
    expect(mockFollow).not.toHaveBeenCalled();
    expect(mockUnfollow).not.toHaveBeenCalled();
  });

  it('returns the error message when the API call rejects with an Error', async () => {
    mockFollow.mockRejectedValue(new Error('network down'));

    const result = await followAction(makeArgs('user-1', makeRequest('POST')));

    expect(result).toEqual({ ok: false, error: 'network down' });
  });

  it('returns a generic message when the API call rejects with a non-Error', async () => {
    mockUnfollow.mockRejectedValue(42);

    const result = await followAction(makeArgs('user-1', makeRequest('DELETE')));

    expect(result).toEqual({ ok: false, error: 'Follow action failed' });
  });
});
