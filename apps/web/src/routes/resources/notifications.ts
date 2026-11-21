import type { NotificationOutput, PaginatedResponse } from '@brewform/shared/schemas';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { notificationApi } from '../../api/index.ts';
import { readPage } from '../../utils/list-params.ts';
import { notifyNotificationsChanged } from '../../utils/notification-events.ts';
import { type ActionFailure, toActionFailure } from '../action-result.ts';
import { requireAuth } from '../auth-guards.ts';
import { withDataLog } from '../data-logging.ts';

const log = createLogger('resources/notifications');

/** The resource-route path of {@link unreadCountLoader}. */
export const UNREAD_COUNT_PATH = '/resources/notifications/unread-count';

/** The resource-route path of {@link notificationsPageLoader} (append `?page=<n>`). */
export const NOTIFICATIONS_PAGE_PATH = '/resources/notifications';

/** The resource-route path of {@link markAllReadAction}. */
export const MARK_ALL_READ_PATH = '/resources/notifications/read-all';

/** The resource-route path of {@link markReadAction} for notification `id`. */
export function markReadPath(id: string): string {
  return `/resources/notifications/${id}/read`;
}

/** Result of {@link unreadCountLoader}. */
export type UnreadCountResult = { ok: true; count: number } | ActionFailure;

/** Result of {@link notificationsPageLoader}. */
export type NotificationsPageResult =
  | { ok: true; notifications: PaginatedResponse<NotificationOutput> }
  | ActionFailure;

/** Result of {@link markReadAction} and {@link markAllReadAction}. */
export type NotificationMutationResult = { ok: true } | ActionFailure;

/**
 * Never revalidate the notification resource loaders after unrelated actions (a like or a
 * comment must not refetch the bell badge); their components reload them explicitly with
 * `fetcher.load()` on mount, window focus and the `brewform:notifications-changed` event.
 */
export function shouldRevalidateNotifications(): boolean {
  return false;
}

/**
 * `resources/notifications/unread-count` loader for the navbar `NotificationBell` badge.
 * Returns `{ ok: true, count }`, or `{ ok: false, error }` (logged) instead of throwing, so a
 * failed or unauthorised count never replaces the page or redirects; an aborted request (a
 * newer `fetcher.load()`) rethrows.
 */
export async function unreadCountLoader({
  request,
}: Pick<LoaderFunctionArgs, 'request'>): Promise<UnreadCountResult> {
  try {
    const { count } = await withDataLog(log, 'unreadCount', {}, () =>
      notificationApi.unreadCount({ signal: request.signal }),
    );
    return { ok: true, count };
  } catch (err) {
    return toActionFailure(err, []);
  }
}

/**
 * `resources/notifications` loader for the navbar `NotificationDropdown`: the requested
 * `?page` (default 1) of the signed-in user's notifications. Returns
 * `{ ok: true, notifications }` or `{ ok: false, error }` (logged) instead of throwing, so the
 * dropdown shows its error state; an aborted request rethrows.
 */
export async function notificationsPageLoader({
  request,
}: Pick<LoaderFunctionArgs, 'request'>): Promise<NotificationsPageResult> {
  const page = readPage(new URL(request.url).searchParams);
  try {
    const notifications = await withDataLog(log, 'notificationsPage', { page }, () =>
      notificationApi.list(page, undefined, { signal: request.signal }),
    );
    return { ok: true, notifications };
  } catch (err) {
    return toActionFailure(err, []);
  }
}

/**
 * `resources/notifications/:id/read` action: marks one notification read through
 * `notificationApi.markRead`. On success it dispatches the `brewform:notifications-changed`
 * window event (so the bell badge reloads even when the submitting item has unmounted after
 * navigating) and returns `{ ok: true }`; otherwise `{ ok: false, error }`. A final 401
 * redirects through `requireAuth`.
 */
export const markReadAction = requireAuth(
  async ({ params, request }: ActionFunctionArgs): Promise<NotificationMutationResult> => {
    const notificationId = params.id ?? '';
    try {
      await withDataLog(log, 'markRead', { notificationId }, () =>
        notificationApi.markRead(notificationId, { signal: request.signal }),
      );
      notifyNotificationsChanged();
      return { ok: true };
    } catch (err) {
      return toActionFailure(err);
    }
  },
);

/**
 * `resources/notifications/read-all` action: marks every notification read through
 * `notificationApi.markAllRead`, dispatches `brewform:notifications-changed` on success and
 * returns `{ ok: true }`, or `{ ok: false, error }`. A final 401 redirects through
 * `requireAuth`.
 */
export const markAllReadAction = requireAuth(
  async ({ request }: ActionFunctionArgs): Promise<NotificationMutationResult> => {
    try {
      await withDataLog(log, 'markAllRead', {}, () =>
        notificationApi.markAllRead({ signal: request.signal }),
      );
      notifyNotificationsChanged();
      return { ok: true };
    } catch (err) {
      return toActionFailure(err);
    }
  },
);
