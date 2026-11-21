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

import { ApiError } from '../api/errors.ts';
import { requireAdmin, requireAuth } from './auth-guards.ts';

/** Minimal loader/action args for a request to `url`. */
function args(url: string) {
  return { request: new Request(url), params: {}, context: undefined } as never;
}

/** Runs `fn` and returns what it threw (or `undefined`). */
async function thrownBy(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return undefined;
  } catch (err) {
    return err;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireAuth', () => {
  it('returns the wrapped loader result when it succeeds', async () => {
    const loader = requireAuth(async () => ({ ok: true }));
    await expect(loader(args('http://localhost/settings'))).resolves.toEqual({ ok: true });
  });

  it('turns a final 401 into a redirect to /login with the encoded path and search', async () => {
    const loader = requireAuth(() =>
      Promise.reject(new ApiError('UNAUTHORIZED', 'no session', undefined, 401)),
    );

    const thrown = await thrownBy(() => loader(args('http://localhost/collections?page=2')));

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
    expect((thrown as Response).headers.get('Location')).toBe(
      '/login?next=%2Fcollections%3Fpage%3D2',
    );
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401 }),
      expect.stringContaining('redirect'),
    );
  });

  it('rethrows non-401 errors unchanged (including a 403)', async () => {
    const forbidden = new ApiError('FORBIDDEN', 'nope', undefined, 403);
    const boom = new Error('boom');
    await expect(
      requireAuth(() => Promise.reject(forbidden))(args('http://localhost/x')),
    ).rejects.toBe(forbidden);
    await expect(requireAuth(() => Promise.reject(boom))(args('http://localhost/x'))).rejects.toBe(
      boom,
    );
  });

  it('rethrows a Response thrown by the wrapped loader (e.g. a 404 or a redirect)', async () => {
    const notFound = new Response('Not Found', { status: 404 });
    await expect(
      requireAuth(() => Promise.reject(notFound))(args('http://localhost/x')),
    ).rejects.toBe(notFound);
  });
});

describe('requireAdmin', () => {
  it('redirects a 401 to /login with the return path', async () => {
    const loader = requireAdmin(() =>
      Promise.reject(new ApiError('UNAUTHORIZED', 'no session', undefined, 401)),
    );

    const thrown = await thrownBy(() => loader(args('http://localhost/admin/audit-log?page=2')));

    expect((thrown as Response).headers.get('Location')).toBe(
      '/login?next=%2Fadmin%2Faudit-log%3Fpage%3D2',
    );
  });

  it('redirects a 403 to /', async () => {
    const loader = requireAdmin(() =>
      Promise.reject(new ApiError('FORBIDDEN', 'not an admin', undefined, 403)),
    );

    const thrown = await thrownBy(() => loader(args('http://localhost/admin/audit-log')));

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get('Location')).toBe('/');
  });

  it('rethrows other errors', async () => {
    const boom = new ApiError('INTERNAL', 'boom', undefined, 500);
    await expect(
      requireAdmin(() => Promise.reject(boom))(args('http://localhost/admin')),
    ).rejects.toBe(boom);
  });
});
