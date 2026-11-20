/**
 * Error thrown for failed API requests, carrying the server error `code`,
 * optional per-field validation `details`, and the HTTP `status`. A response whose
 * body is not the JSON error envelope (an HTML proxy page, an empty body) becomes
 * `ApiError('INVALID_RESPONSE', …, status)`.
 *
 * Lives outside `api/client.ts` so components can import it (for `instanceof` checks)
 * without importing the API client itself.
 */
export class ApiError extends Error {
  code: string;
  details?: Array<{ field: string; message: string }>;
  status: number;

  constructor(
    code: string,
    message: string,
    details?: Array<{ field: string; message: string }>,
    status: number = 500,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.status = status;
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
