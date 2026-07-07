import { requestId } from 'hono/request-id';

/**
 * Request ID middleware.
 *
 * Attaches a unique request identifier to every incoming request, either from
 * the X-Request-ID header or generated as a UUID v4, so logs can be correlated
 * across the request lifecycle.
 */

/** Request ID middleware. Attaches a unique request identifier (UUID v4) via hono/request-id. */
export const requestIdMiddleware = requestId({
  headerName: 'X-Request-ID',
});
