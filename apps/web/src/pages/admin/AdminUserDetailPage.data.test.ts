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
  adminApi: {
    getUserDetail: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    deleteUser: vi.fn(),
  },
}));

import { ApiError } from '../../api/errors.ts';
import { adminApi } from '../../api/index.ts';
import { action, loader } from './AdminUserDetailPage.data.ts';

const mockApi = vi.mocked(adminApi);

/** Runs the action for user `u1` with the given form fields. */
function runAction(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return action({
    params: { id: 'u1' },
    request: new Request('http://localhost/admin/users/u1', { method: 'POST', body: form }),
    context: undefined,
  } as never);
}

/** Runs the loader for user `id` and returns its result or what it threw. */
function runLoader(id = 'u1') {
  return loader({
    params: { id },
    request: new Request(`http://localhost/admin/users/${id}`),
    context: undefined,
  } as never).catch((err: unknown) => err);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/admin/users/:id action', () => {
  it('ban calls adminApi.banUser(id, reason, { signal }) and returns { ok: true }', async () => {
    mockApi.banUser.mockResolvedValue({} as never);

    await expect(runAction({ intent: 'ban', reason: 'Spam' })).resolves.toEqual({
      ok: true,
      intent: 'ban',
    });
    expect(mockApi.banUser).toHaveBeenCalledWith('u1', 'Spam', {
      signal: expect.any(AbortSignal),
    });
  });

  it('unban calls adminApi.unbanUser(id, { signal })', async () => {
    mockApi.unbanUser.mockResolvedValue({} as never);

    await expect(runAction({ intent: 'unban' })).resolves.toEqual({ ok: true, intent: 'unban' });
    expect(mockApi.unbanUser).toHaveBeenCalledWith('u1', { signal: expect.any(AbortSignal) });
  });

  it('delete calls adminApi.deleteUser(id, { signal })', async () => {
    mockApi.deleteUser.mockResolvedValue({ message: 'ok' });

    await expect(runAction({ intent: 'delete' })).resolves.toEqual({ ok: true, intent: 'delete' });
    expect(mockApi.deleteUser).toHaveBeenCalledWith('u1', { signal: expect.any(AbortSignal) });
  });

  it('a rejected call returns { ok: false, error } and logs ids only (no reason text)', async () => {
    mockApi.banUser.mockRejectedValue(new ApiError('INTERNAL', 'boom', undefined, 500));

    await expect(runAction({ intent: 'ban', reason: 'secret reason' })).resolves.toEqual({
      ok: false,
      intent: 'ban',
      error: 'boom',
      code: 'INTERNAL',
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(ApiError), userId: 'u1' },
      'AdminUserDetailPage banUser failed',
    );
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain('secret reason');
  });

  it('a 403 redirects home through requireAdmin', async () => {
    mockApi.unbanUser.mockRejectedValue(new ApiError('FORBIDDEN', 'no', undefined, 403));

    const thrown = await runAction({ intent: 'unban' }).catch((err: unknown) => err);

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get('Location')).toBe('/');
  });

  it('an unknown intent returns { ok: false }', async () => {
    await expect(runAction({ intent: 'bogus' })).resolves.toMatchObject({
      ok: false,
      intent: 'bogus',
    });
  });
});

describe('/admin/users/:id loader', () => {
  it('returns the user and passes the request signal', async () => {
    const user = { id: 'u1', username: 'alice' };
    mockApi.getUserDetail.mockResolvedValue(user as never);

    await expect(runLoader()).resolves.toEqual({ user });
    expect(mockApi.getUserDetail).toHaveBeenCalledWith('u1', {
      signal: expect.any(AbortSignal),
    });
  });

  it('a 404 throws a 404 Response (not-found page) without an error log', async () => {
    mockApi.getUserDetail.mockRejectedValue(new ApiError('NOT_FOUND', 'missing', undefined, 404));

    const thrown = await runLoader('missing');

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("logs 'AdminUserDetailPage loadData failed' and rethrows other errors", async () => {
    const err = new ApiError('INTERNAL', 'boom', undefined, 500);
    mockApi.getUserDetail.mockRejectedValue(err);

    await expect(runLoader()).resolves.toBe(err);
    expect(mockLogger.error).toHaveBeenCalledWith({ err }, 'AdminUserDetailPage loadData failed');
  });
});
