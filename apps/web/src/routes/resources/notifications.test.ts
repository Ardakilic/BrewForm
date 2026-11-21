import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../api/index.ts', () => ({
  notificationApi: {
    unreadCount: vi.fn(),
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

import { ApiError } from '../../api/errors.ts';
import { notificationApi } from '../../api/index.ts';
import { NOTIFICATIONS_CHANGED_EVENT } from '../../utils/notification-events.ts';
import {
  markAllReadAction,
  markReadAction,
  markReadPath,
  notificationsPageLoader,
  shouldRevalidateNotifications,
  unreadCountLoader,
} from './notifications.ts';

const mockApi = vi.mocked(notificationApi);
const SIGNAL = { signal: expect.any(AbortSignal) };

/** Builds the loader/action arguments for `url` (POST when `method` is given). */
function args(url: string, params: Record<string, string> = {}, method?: string) {
  return {
    params,
    request: new Request(`http://localhost${url}`, method ? { method } : undefined),
    context: undefined,
  } as never;
}

/** Counts `brewform:notifications-changed` events dispatched while `fn` runs. */
async function countChangedEvents(fn: () => Promise<unknown>): Promise<number> {
  const listener = vi.fn();
  globalThis.addEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);
  try {
    await fn();
  } finally {
    globalThis.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);
  }
  return listener.mock.calls.length;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resources/notifications/unread-count loader', () => {
  it('returns { ok: true, count } and forwards the request signal', async () => {
    mockApi.unreadCount.mockResolvedValue({ count: 4 });
    const controller = new AbortController();

    const result = await unreadCountLoader({
      request: new Request('http://localhost/resources/notifications/unread-count', {
        signal: controller.signal,
      }),
    });

    expect(result).toEqual({ ok: true, count: 4 });
    expect(mockApi.unreadCount).toHaveBeenCalledWith(SIGNAL);
    const opts = mockApi.unreadCount.mock.calls[0][0];
    controller.abort();
    expect(opts?.signal?.aborted).toBe(true);
  });

  it('returns { ok: false } instead of throwing or redirecting on a 401', async () => {
    mockApi.unreadCount.mockRejectedValue(
      new ApiError('UNAUTHORIZED', 'no session', undefined, 401),
    );

    await expect(unreadCountLoader(args('/resources/notifications/unread-count'))).resolves.toEqual(
      { ok: false, error: 'no session', code: 'UNAUTHORIZED' },
    );
  });

  it('rethrows an aborted request', async () => {
    mockApi.unreadCount.mockRejectedValue(new DOMException('aborted', 'AbortError'));

    await expect(unreadCountLoader(args('/resources/notifications/unread-count'))).rejects.toThrow(
      'aborted',
    );
  });
});

describe('resources/notifications loader', () => {
  it('loads the requested page with the request signal', async () => {
    const page = { success: true, data: [], meta: { pagination: {} } } as never;
    mockApi.list.mockResolvedValue(page);

    await expect(notificationsPageLoader(args('/resources/notifications?page=2'))).resolves.toEqual(
      { ok: true, notifications: page },
    );
    expect(mockApi.list).toHaveBeenCalledWith(2, undefined, SIGNAL);
  });

  it('defaults to page 1 and returns { ok: false } when the list fails', async () => {
    mockApi.list.mockRejectedValue(new Error('down'));

    await expect(notificationsPageLoader(args('/resources/notifications'))).resolves.toEqual({
      ok: false,
      error: 'down',
    });
    expect(mockApi.list).toHaveBeenCalledWith(1, undefined, SIGNAL);
  });
});

describe('resources/notifications mark-read actions', () => {
  it('markRead returns { ok: true } and broadcasts the change', async () => {
    mockApi.markRead.mockResolvedValue({} as never);

    const events = await countChangedEvents(async () => {
      await expect(markReadAction(args(markReadPath('n1'), { id: 'n1' }, 'POST'))).resolves.toEqual(
        { ok: true },
      );
    });

    expect(mockApi.markRead).toHaveBeenCalledWith('n1', SIGNAL);
    expect(events).toBe(1);
  });

  it('markRead returns { ok: false } and does not broadcast on failure', async () => {
    mockApi.markRead.mockRejectedValue(new ApiError('NOT_FOUND', 'gone', undefined, 404));

    const events = await countChangedEvents(async () => {
      await expect(markReadAction(args(markReadPath('n1'), { id: 'n1' }, 'POST'))).resolves.toEqual(
        { ok: false, error: 'gone', code: 'NOT_FOUND' },
      );
    });

    expect(events).toBe(0);
  });

  it('markRead redirects a final 401 to the login page', async () => {
    mockApi.markRead.mockRejectedValue(new ApiError('UNAUTHORIZED', 'no session', undefined, 401));

    const thrown = await markReadAction(args(markReadPath('n1'), { id: 'n1' }, 'POST')).catch(
      (err: unknown) => err,
    );

    expect((thrown as Response).headers.get('Location')).toMatch(/^\/login\?next=/);
  });

  it('markAllRead returns { ok: true } and broadcasts the change', async () => {
    mockApi.markAllRead.mockResolvedValue({ message: 'ok' });

    const events = await countChangedEvents(async () => {
      await expect(
        markAllReadAction(args('/resources/notifications/read-all', {}, 'POST')),
      ).resolves.toEqual({ ok: true });
    });

    expect(mockApi.markAllRead).toHaveBeenCalledWith(SIGNAL);
    expect(events).toBe(1);
  });

  it('markAllRead returns { ok: false } on failure', async () => {
    mockApi.markAllRead.mockRejectedValue(new Error('down'));

    await expect(
      markAllReadAction(args('/resources/notifications/read-all', {}, 'POST')),
    ).resolves.toEqual({ ok: false, error: 'down' });
  });
});

describe('notification resource revalidation', () => {
  it('never revalidates after unrelated actions (components reload explicitly)', () => {
    expect(shouldRevalidateNotifications()).toBe(false);
  });
});
