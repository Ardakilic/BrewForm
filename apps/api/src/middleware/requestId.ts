import { requestId } from 'hono/request-id';
import { createLogger } from '../utils/logger/index.ts';

/**
 * Request ID middleware.
 *
 * Attaches a unique request identifier to every incoming request, either from
 * the X-Request-ID header or generated as a UUID v4, so logs can be correlated
 * across the request lifecycle.
 */

// deno-lint-ignore no-unused-vars
const log = createLogger('request-id-middleware');

/** Request ID middleware. Attaches a unique request identifier (UUID v4) via hono/request-id. */
export const requestIdMiddleware = requestId({
  headerName: 'X-Request-ID',
});
