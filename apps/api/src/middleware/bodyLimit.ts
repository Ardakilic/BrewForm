import { bodyLimit } from 'hono/body-limit';
import type { MiddlewareHandler } from 'hono';
import { error } from '../utils/response/index.ts';
import { createLogger } from '../utils/logger/index.ts';
import type { AppEnv } from '../types/hono.ts';

const log = createLogger('bodyLimit');

/**
 * Route-boundary regex that matches the `/api/v1/photos` collection
 * root and any of its subpaths (e.g. `/api/v1/photos/recipe/:id`,
 * `/api/v1/photos/:id`), but rejects lookalike routes such as
 * `/api/v1/photoshop`.
 */
const PHOTOS_ROUTE_RE = /^\/api\/v1\/photos(?:\/|$)/;

/**
 * Transport-level request body size limit (1 MB).
 *
 * Applied to all routes EXCEPT `/api/v1/photos` (and its subpaths)
 * because photo uploads accept files up to UPLOAD_MAX_SIZE_BYTES
 * (default 10 MB) and enforce their own application-level cap via
 * `validateImageUpload()`.
 *
 * Depends on `requestIdMiddleware` running first so that the
 * `onError` callback can include the requestId in both the
 * structured log and the error envelope.
 */
const jsonBodyLimit = bodyLimit({
  maxSize: 1024 * 1024, // 1 MB
  onError: (c) => {
    log.warn({
      event: 'payload_too_large',
      status: 413,
      requestId: c.get('requestId'),
      path: c.req.path,
      method: c.req.method,
      contentLength: c.req.header('content-length'),
    }, 'Request body exceeds 1 MB limit');
    return error(c, 'PAYLOAD_TOO_LARGE', 'Request body too large', 413);
  },
});

/**
 * Hono middleware that applies a 1 MB body size limit to all routes
 * except the photo upload routes mounted at `/api/v1/photos`.
 *
 * Photo routes (root + subpaths) bypass this middleware because they
 * accept multipart uploads governed by `validateImageUpload()`; all
 * other routes are funneled through the JSON body limit and a 413
 * `PAYLOAD_TOO_LARGE` response is returned on overflow.
 *
 * @param c - The Hono request context.
 * @param next - The next middleware/handler in the stack.
 * @returns The result of either `next()` (for photo routes) or the
 *          `jsonBodyLimit` middleware (for all other routes).
 */
export const bodyLimitMiddleware: MiddlewareHandler<AppEnv> = (c, next) => {
  if (PHOTOS_ROUTE_RE.test(c.req.path)) {
    return next();
  }
  return jsonBodyLimit(c, next);
};
