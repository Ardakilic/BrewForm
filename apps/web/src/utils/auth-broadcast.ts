import { createLogger } from '@/utils/logger.ts';

const log = createLogger('auth-broadcast');

/** `localStorage` key whose changes tell the other tabs that this tab signed in or out. */
export const AUTH_CHANGE_KEY = 'brewform-auth-change';

/** A session change one tab announces to the others. */
export type AuthChange = 'login' | 'logout';

/** The marker value: the change and the time it was written (no user id, no PII). */
const AUTH_CHANGE_VALUE = /^(login|logout):\d+$/;

/**
 * Announces a sign-in or sign-out to the other open tabs by writing `<change>:<Date.now()>` under
 * {@link AUTH_CHANGE_KEY} (a new value every time, so the `storage` event always fires in the
 * other tabs and never in this one). Best-effort: a throwing `setItem` (private mode, quota) is
 * logged at debug and ignored, so the local sign-in or sign-out still completes.
 */
export function broadcastAuthChange(change: AuthChange): void {
  try {
    localStorage.setItem(AUTH_CHANGE_KEY, `${change}:${Date.now()}`);
  } catch (err) {
    log.debug({ err, change }, 'broadcastAuthChange skipped: localStorage unavailable');
  }
}

/**
 * The change a `storage` event carries, or `null` for another key, a removal or `clear()`
 * (`newValue` or `key` is `null`) and a malformed value.
 */
export function readAuthChange(e: StorageEvent): AuthChange | null {
  if (e.key !== AUTH_CHANGE_KEY || !e.newValue) return null;
  const match = AUTH_CHANGE_VALUE.exec(e.newValue);
  return match ? (match[1] as AuthChange) : null;
}
