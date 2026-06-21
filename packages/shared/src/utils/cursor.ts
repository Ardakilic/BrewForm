/**
 * Cursor encoding/decoding utilities for cursor-based pagination.
 *
 * Cursors are opaque base64-encoded JSON payloads carrying the stable sort
 * key `{ createdAt, id }`. They are not authorization tokens — tampering can
 * only produce an invalid-cursor error or unexpected query results.
 */

/**
 * Stable sort key used as a pagination bookmark.
 */
export interface PaginationCursor {
  /** ISO 8601 timestamp of the bookmarked recipe. */
  createdAt: string;
  /** UUID of the bookmarked recipe (tiebreaker for equal timestamps). */
  id: string;
}

/**
 * Encode a pagination cursor to an opaque base64url string.
 *
 * Cursor-based pagination uses base64url encoding (RFC 4648 §5) so the
 * resulting string is safe to use in URL query parameters without extra
 * escaping — no `+`, `/`, or `=` characters.
 *
 * @param cursor - The cursor payload `{ createdAt, id }`.
 * @returns A base64url-encoded JSON string safe to expose in API responses and
 *          accept back as a query parameter.
 */
export function encodeCursor(cursor: PaginationCursor): string {
  return btoa(JSON.stringify(cursor))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/**
 * Decode an opaque base64 cursor string back to a {@link PaginationCursor}.
 *
 * @param cursor - Base64-encoded cursor string from a client request.
 * @returns The decoded cursor object.
 * @throws {Error} When the cursor is empty, malformed base64, invalid JSON,
 *                 or missing required `createdAt`/`id` fields.
 */
export function decodeCursor(cursor: string): PaginationCursor {
  if (!cursor || typeof cursor !== 'string') {
    throw new Error('Invalid cursor format');
  }

  let decoded: string;
  try {
    const base64 = cursor
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(cursor.length / 4) * 4, '=');
    decoded = atob(base64);
  } catch {
    throw new Error('Invalid cursor format');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error('Invalid cursor format');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('createdAt' in parsed) ||
    !('id' in parsed) ||
    typeof (parsed as Record<string, unknown>).createdAt !== 'string' ||
    typeof (parsed as Record<string, unknown>).id !== 'string'
  ) {
    throw new Error('Invalid cursor format');
  }

  return {
    createdAt: (parsed as Record<string, unknown>).createdAt as string,
    id: (parsed as Record<string, unknown>).id as string,
  };
}
