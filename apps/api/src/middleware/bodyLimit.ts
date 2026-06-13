import { bodyLimit } from 'hono/body-limit';
import type { MiddlewareHandler } from 'hono';
import { error } from '../utils/response/index.ts';
import type { AppEnv } from '../types/hono.ts';

/**
 * Transport-level request body size limit (1 MB).
 *
 * Applied to all routes EXCEPT /api/v1/photos because photo uploads
 * accept files up to UPLOAD_MAX_SIZE_BYTES (default 10 MB) and
 * enforce their own application-level cap via validateImageUpload().
 *
 * Depends on requestIdMiddleware running first so that the onError
 * callback can include the requestId in the error envelope.
 */
const jsonBodyLimit = bodyLimit({
  maxSize: 1024 * 1024, // 1 MB
  onError: (c) => error(c, 'PAYLOAD_TOO_LARGE', 'Request body too large', 413),
});

/**
 * Hono middleware that applies a 1 MB body size limit to all routes
 * except photo upload routes.
 *
 * @param c - The Hono request context.
 * @param next - The next middleware/handler in the stack.
 * @returns The result of either the next middleware (for photo routes)
 *          or the bodyLimit middleware (for all other routes).
 */
export const bodyLimitMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.path.startsWith('/api/v1/photos')) {
    return next();
  }
  return jsonBodyLimit(c, next);
};
