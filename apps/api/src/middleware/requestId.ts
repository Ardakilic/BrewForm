/**
 * BrewForm Request ID Middleware
 * Adds unique request ID for tracing
 */

import { createMiddleware } from 'hono/factory';
import { nanoid } from 'nanoid';

/**
 * Request ID middleware
 * Generates a unique ID for each request for logging and tracing
 */
export const requestIdMiddleware = createMiddleware(async (c, next) => {
  const existingId = c.req.header('X-Request-ID');
  const requestId = existingId || nanoid(21);
  
  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);
  
  return next();
});

export default requestIdMiddleware;
