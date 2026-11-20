/**
 * Return-path (`?next=`) helpers for the login and registration flow. A `next` value is
 * only followed when it is a same-origin relative path, which prevents open redirects.
 */

/**
 * True when `value` is a safe same-origin return path: it starts with a single `/`, does not
 * start with `//` or `/\` (protocol-relative URLs), contains no scheme (`:` before the first
 * `/`, `?` or `#`, or an embedded `scheme://`), and has no whitespace or control characters.
 */
export function isSafeNextPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//') || value.startsWith('/\\')) return false;
  // Whitespace and control characters can be stripped by browsers, turning `/\t/evil` into `//evil`.
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x20 || code === 0x7f) return false;
  }
  if (value.includes('\\')) return false;
  if (/^[^?#]*:\/\//.test(value)) return false;
  return true;
}

/** Reads `next` from search params and returns it when {@link isSafeNextPath}, else `null`. */
export function getSafeNext(searchParams: URLSearchParams): string | null {
  const next = searchParams.get('next');
  return isSafeNextPath(next) ? next : null;
}

/** Builds `/login?next=<encoded pathname+search>` for a guarded location. */
export function loginPathFor(pathname: string, search: string): string {
  return `/login?next=${encodeURIComponent(`${pathname}${search}`)}`;
}
