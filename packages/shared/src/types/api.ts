/**
 * Generic API wrapper types used by all endpoints.
 *
 * Every response is either a successful `ApiResponse<T>` or an `ApiError`.
 * Paginated endpoints include `PaginationMeta` in the response
 * and accept `PaginationQuery` as query parameters.
 */

/**
 * Successful API response envelope.
 *
 * @typeParam T - The shape of the payload returned in `data`.
 */
export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: {
    /** Request ID for tracing (mirrors `X-Request-Id` header) */
    requestId?: string;
    /** Present on paginated list endpoints */
    pagination?: PaginationMeta;
  };
}

/** Standard error response envelope. */
export interface ApiError {
  success: false;
  error: {
    /** Machine-readable error code (e.g. `"VALIDATION_ERROR"`) */
    code: string;
    /** Human-readable error summary */
    message: string;
    /** Per-field validation errors, when applicable */
    details?: Array<{
      field: string;
      message: string;
    }>;
    /** Request ID for tracing */
    requestId?: string;
  };
}

/** Pagination metadata included in paginated list responses. */
export interface PaginationMeta {
  /** Current page number (1-based) */
  page: number;
  /** Items per page */
  perPage: number;
  /** Total number of items across all pages */
  total: number;
  /** Total number of pages */
  totalPages: number;
}

/** Pagination query parameters accepted by list endpoints. */
export interface PaginationQuery {
  /** Page number (1-based, defaults to 1) */
  page?: number;
  /** Items per page (defaults to server-side default, typically 20) */
  perPage?: number;
}
