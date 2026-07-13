/**
 * Lightweight cross-component signal for notification read-state changes.
 *
 * Any component that marks notifications read (dropdown, list page, item)
 * dispatches the event via {@link notifyNotificationsChanged}; listeners
 * (e.g. the navbar {@link NotificationBell} unread badge) refetch on it.
 * No polling, no shared store — just a window-level `Event`.
 */

/** Window event dispatched whenever notification read-state changes. */
export const NOTIFICATIONS_CHANGED_EVENT = 'brewform:notifications-changed';

/** Dispatch the notifications-changed window event to refresh listeners (e.g. the bell badge). */
export function notifyNotificationsChanged(): void {
  globalThis.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
