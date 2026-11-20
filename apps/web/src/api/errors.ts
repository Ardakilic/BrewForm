/**
 * Error thrown for failed API requests, carrying the server error `code`,
 * optional per-field validation `details`, and the HTTP `status`. A response whose
 * body is not the JSON error envelope (an HTML proxy page, an empty body) becomes
 * `ApiError('INVALID_RESPONSE', …, status)`. A rate-limited response (`429`,
 * code `RATE_LIMITED`) also carries `retryAfterSeconds` from its `Retry-After`
 * header when that header is a valid delta-seconds value.
 *
 * Lives outside `api/client.ts` so components can import it (for `instanceof` checks)
 * without importing the API client itself.
 */
export class ApiError extends Error {
  code: string;
  details?: Array<{ field: string; message: string }>;
  status: number;
  /** Seconds until the request may be retried (from `Retry-After`), when known. */
  retryAfterSeconds?: number;

  /**
   * @param code - Server error code (e.g. `RATE_LIMITED`).
   * @param message - Server error message.
   * @param details - Optional per-field validation details.
   * @param status - HTTP status (default 500).
   * @param retryAfterSeconds - Parsed `Retry-After` delta-seconds, when present.
   */
  constructor(
    code: string,
    message: string,
    details?: Array<{ field: string; message: string }>,
    status: number = 500,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Type guard: true when `err` is an {@link ApiError}. */
export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/**
 * True when `err` is the rejection of an aborted request (`fetch` rejects with a
 * `DOMException` named `AbortError`; some runtimes use a plain `Error` with that name).
 */
export function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'
  );
}
