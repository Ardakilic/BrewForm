/**
 * Transport-level request body caps.
 *
 * Every route gets a 1 MB limit, except the photo routes under
 * `/api/v1/photos`, which get the larger photo upload cap
 * (`PHOTO_BODY_MAX_BYTES`: `UPLOAD_MAX_SIZE_BYTES` + the thumbnail cap + 64 KiB
 * of multipart overhead). Both caps answer 413 `PAYLOAD_TOO_LARGE` before the
 * body is buffered by a handler: Hono's `bodyLimit` trusts a `Content-Length`
 * without reading the body and otherwise stops the stream once it exceeds the
 * cap. Per-part limits inside the photo body are enforced later by
 * `validateImagePart()` (400 `FILE_TOO_LARGE`).
 */
import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppEnv } from '../types/hono.ts';
import { createLogger } from '../utils/logger/index.ts';
import { error } from '../utils/response/index.ts';
// limits.ts imports only config; utils/upload/index.ts would construct the storage driver.
import { PHOTO_BODY_MAX_BYTES } from '../utils/upload/limits.ts';

const log = createLogger('bodyLimit');

/** The 1 MB limit applied to every non-photo route. */
const JSON_BODY_MAX_BYTES = 1024 * 1024;

/**
 * Route-boundary regex that matches the `/api/v1/photos` collection
 * root and any of its subpaths (e.g. `/api/v1/photos/recipe/:id`,
 * `/api/v1/photos/:id`), but rejects lookalike routes such as
 * `/api/v1/photoshop`.
 */
const PHOTOS_ROUTE_RE = /^\/api\/v1\/photos(?:\/|$)/;

/**
 * Build the `onError` callback of a body limit: log a `warn` with the limit and
 * request identifiers, then answer 413 `PAYLOAD_TOO_LARGE`.
 *
 * @param limit - The cap in bytes, recorded in the log entry.
 * @param logMessage - The log message.
 */
function payloadTooLarge(limit: number, logMessage: string) {
  return (c: Context) => {
    log.warn(
      {
        event: 'payload_too_large',
        status: 413,
        limit,
        requestId: c.get('requestId'),
        path: c.req.path,
        method: c.req.method,
        contentLength: c.req.header('content-length'),
      },
      logMessage,
    );
    return error(c, 'PAYLOAD_TOO_LARGE', 'Request body too large', 413);
  };
}

/**
 * Request body size limit (1 MB) for every route except `/api/v1/photos`.
 *
 * Depends on `requestIdMiddleware` running first so that the
 * `onError` callback can include the requestId in both the
 * structured log and the error envelope.
 */
const jsonBodyLimit = bodyLimit({
  maxSize: JSON_BODY_MAX_BYTES,
  onError: payloadTooLarge(JSON_BODY_MAX_BYTES, 'Request body exceeds 1 MB limit'),
});

/**
 * Request body size limit for `/api/v1/photos` and its subpaths:
 * {@link PHOTO_BODY_MAX_BYTES} (about 11.06 MiB with the default
 * `UPLOAD_MAX_SIZE_BYTES`), large enough for one original and one thumbnail.
 */
export const photoBodyLimit = bodyLimit({
  maxSize: PHOTO_BODY_MAX_BYTES,
  onError: payloadTooLarge(PHOTO_BODY_MAX_BYTES, 'Request body exceeds the photo upload cap'),
});

/**
 * Hono middleware that applies the photo upload cap ({@link photoBodyLimit})
 * to the routes mounted at `/api/v1/photos` and the 1 MB limit
 * ({@link jsonBodyLimit}) to every other route. Either cap returns a 413
 * `PAYLOAD_TOO_LARGE` envelope (with `requestId`) on overflow, without
 * invoking the route handler.
 *
 * @param c - The Hono request context.
 * @param next - The next middleware/handler in the stack.
 * @returns The result of the selected body-limit middleware.
 */
export const bodyLimitMiddleware: MiddlewareHandler<AppEnv> = (c, next) => {
  if (PHOTOS_ROUTE_RE.test(c.req.path)) {
    return photoBodyLimit(c, next);
  }
  return jsonBodyLimit(c, next);
};
