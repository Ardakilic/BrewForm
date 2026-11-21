import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFollow, mockUnfollow, mockLogger } = vi.hoisted(() => ({
  mockFollow: vi.fn(),
  mockUnfollow: vi.fn(),
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
  followApi: {
    follow: mockFollow,
    unfollow: mockUnfollow,
  },
}));

import { ApiError } from '../api/errors.ts';
import { followAction } from './follow.ts';

/** A form-carrying request like `FollowButton` submits (POST follows, DELETE unfollows). */
function makeRequest(method: 'POST' | 'DELETE' | 'PUT'): Request {
  return new Request('https://example.test/follow/user-1', {
    method,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ following: String(method === 'POST') }),
  });
}

/** Cast `(userId, request)` into the `ActionFunctionArgs` shape the action destructures. */
function makeArgs(userId: string | undefined, request: Request) {
  return { params: { userId }, request } as unknown as Parameters<typeof followAction>[0];
}

describe('followAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('follows on POST, passes the signal and returns { ok: true, following: true }', async () => {
    mockFollow.mockResolvedValue({});
    const request = makeRequest('POST');

    const result = await followAction(makeArgs('user-1', request));

    expect(result).toEqual({ ok: true, following: true });
    expect(mockFollow).toHaveBeenCalledWith('user-1', { signal: request.signal });
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { userId: 'user-1', method: 'POST' },
      'followAction started',
    );
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { userId: 'user-1', method: 'POST' },
      'followAction completed',
    );
  });

  it('unfollows on DELETE, passes the signal and returns { ok: true, following: false }', async () => {
    mockUnfollow.mockResolvedValue({});
    const request = makeRequest('DELETE');

    const result = await followAction(makeArgs('user-1', request));

    expect(result).toEqual({ ok: true, following: false });
    expect(mockUnfollow).toHaveBeenCalledWith('user-1', { signal: request.signal });
  });

  it('returns { ok: false } when the userId param is missing', async () => {
    const result = await followAction(makeArgs(undefined, makeRequest('POST')));

    expect(result).toEqual({ ok: false, error: 'Missing or invalid route parameter: userId' });
    expect(mockFollow).not.toHaveBeenCalled();
  });

  it('returns { ok: false } for an unsupported HTTP method', async () => {
    const result = await followAction(makeArgs('user-1', makeRequest('PUT')));

    expect(result).toEqual({ ok: false, error: 'Unsupported method' });
    expect(mockFollow).not.toHaveBeenCalled();
    expect(mockUnfollow).not.toHaveBeenCalled();
  });

  it('a 409 on follow (already following) is { ok: true, following: true }', async () => {
    mockFollow.mockRejectedValue(new ApiError('CONFLICT', 'Already following', undefined, 409));

    const result = await followAction(makeArgs('user-1', makeRequest('POST')));

    expect(result).toEqual({ ok: true, following: true });
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { userId: 'user-1', method: 'POST' },
      'followAction already in requested state',
    );
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('a 404 on unfollow (not following) is { ok: true, following: false }', async () => {
    mockUnfollow.mockRejectedValue(new ApiError('NOT_FOUND', 'Not following', undefined, 404));

    const result = await followAction(makeArgs('user-1', makeRequest('DELETE')));

    expect(result).toEqual({ ok: true, following: false });
  });

  it('a failed follow (500) returns the previous state following: false', async () => {
    mockFollow.mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', undefined, 500));

    const result = await followAction(makeArgs('user-1', makeRequest('POST')));

    expect(result).toEqual({ ok: false, error: 'boom', code: 'INTERNAL_ERROR', following: false });
  });

  it('a failed unfollow (500) returns the previous state following: true', async () => {
    mockUnfollow.mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', undefined, 500));

    const result = await followAction(makeArgs('user-1', makeRequest('DELETE')));

    expect(result).toEqual({ ok: false, error: 'boom', code: 'INTERNAL_ERROR', following: true });
  });

  it("returns code 'UNAUTHORIZED' for a final 401 (no redirect)", async () => {
    mockFollow.mockRejectedValue(new ApiError('UNAUTHORIZED', 'no session', undefined, 401));

    const result = await followAction(makeArgs('user-1', makeRequest('POST')));

    expect(result).toEqual({
      ok: false,
      error: 'no session',
      code: 'UNAUTHORIZED',
      following: false,
    });
  });

  it('rethrows an aborted request', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    mockFollow.mockRejectedValue(abort);

    await expect(followAction(makeArgs('user-1', makeRequest('POST')))).rejects.toBe(abort);
  });

  it('logs the failure with { err, userId, method }', async () => {
    const err = new ApiError('INTERNAL_ERROR', 'boom', undefined, 500);
    mockUnfollow.mockRejectedValue(err);

    await followAction(makeArgs('user-1', makeRequest('DELETE')));

    expect(mockLogger.error).toHaveBeenCalledWith(
      { err, userId: 'user-1', method: 'DELETE' },
      'followAction failed',
    );
  });

  it("returns 'Request failed' for a non-Error rejection", async () => {
    mockFollow.mockRejectedValue('nope');

    const result = await followAction(makeArgs('user-1', makeRequest('POST')));

    expect(result).toEqual({ ok: false, error: 'Request failed', following: false });
  });
});
