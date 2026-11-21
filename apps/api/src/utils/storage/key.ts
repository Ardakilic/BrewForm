/**
 * Storage key guard shared by every storage driver (defence in depth, ADR-019).
 *
 * Keys are generated on the server (`<uuid>.<ext>`, `<uuid>_medium.<ext>`), but
 * each driver re-checks them before any filesystem or network I/O, so a future
 * caller bug cannot turn a key into a path, a query string or a bucket
 * subresource. Legacy keys (`<13-digit timestamp>-<8 hex>.<ext>`) also pass.
 */

/**
 * A single flat object name: starts with an ASCII letter or digit, then up to
 * 127 letters, digits, `_` or `-`, then an optional `.` plus a 1-8 character
 * alphanumeric extension. No `/`, `\`, `..`, `%`, `?`, `#`, whitespace or
 * leading `.` can match.
 */
export const SAFE_STORAGE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}(\.[A-Za-z0-9]{1,8})?$/;

/**
 * Throw unless `key` matches {@link SAFE_STORAGE_KEY_RE}.
 *
 * @param key - The object key a driver is about to read, write or delete.
 * @throws {Error} `Invalid storage key` (the key itself is never echoed).
 */
export function assertSafeStorageKey(key: string): void {
  if (typeof key !== 'string' || !SAFE_STORAGE_KEY_RE.test(key)) {
    throw new Error('Invalid storage key');
  }
}
