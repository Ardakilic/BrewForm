/**
 * Read handler for local uploads (`GET`/`HEAD /uploads/:path{.+}`), mounted in `main.ts` only
 * when `STORAGE_DRIVER=local`, behind the `uploads` rate-limit policy.
 *
 * The file is streamed from disk (`Readable.toWeb(createReadStream(path))` with a one-chunk
 * queue), so one request holds about one 64 KiB read chunk plus one queued chunk whatever the
 * file size or the client's read speed. `@hono/node-server` pipes a `ReadableStream` body and
 * cancels it when the socket closes, which destroys the file stream and closes its descriptor; a
 * `Blob` body would be buffered whole, so it is never used. Every key is server-generated and
 * written exclusively, so a URL never changes content and a 200 is cacheable for a year.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import type { Context } from 'hono';
import { config } from '../../config/index.ts';
import type { AppEnv } from '../../types/hono.ts';
import { createLogger } from '../logger/index.ts';

const log = createLogger('uploads');

/** `Cache-Control` of a successful upload read: keys never change content, so cache for a year. */
export const UPLOADS_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Content types served by extension; anything else is `application/octet-stream`. */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Serve one file from `UPLOAD_DIR` for `GET` or `HEAD /uploads/:path{.+}`.
 *
 * - 400 when the path parameter is empty; 403 (one `warn` with the `requestId`) when the path is
 *   absolute, contains `..` or resolves outside `UPLOAD_DIR`.
 * - `stat` runs first: a missing file, a directory or other non-regular file, and a path that
 *   cannot be stat-ed (for example one with a null byte) answer 404.
 * - 200 carries the content type from the extension, `Content-Length` and
 *   {@link UPLOADS_CACHE_CONTROL} (`nosniff` comes from the global `secureHeaders`). `HEAD`
 *   returns these headers without opening the file: Hono runs the GET handler for HEAD and drops
 *   the body, so a stream opened for it would never be read or cancelled.
 * - The `GET` body is `Readable.toWeb(createReadStream(path), { strategy: { highWaterMark: 1 } })`:
 *   without the explicit strategy the web stream would queue up to the Node stream's
 *   `highWaterMark` (65,536) chunks for a slow reader, i.e. the whole file.
 *
 * `config.UPLOAD_DIR` is read per request (it is already absolute, resolved in `config/env.ts`).
 *
 * @param c - The request context; the file path is the `path` route parameter.
 * @returns The file response, or a 400/403/404 response.
 */
export async function serveLocalUpload(c: Context<AppEnv>): Promise<Response> {
  const userPath = c.req.param('path');
  if (!userPath) return c.text('Bad Request', 400);

  const uploadDir = config.UPLOAD_DIR;
  const filepath = path.resolve(uploadDir, userPath);
  if (
    path.isAbsolute(userPath) ||
    userPath.includes('..') ||
    !filepath.startsWith(uploadDir + path.sep)
  ) {
    log.warn(
      { requestId: c.get('requestId') },
      'serveLocalUpload refused a path outside UPLOAD_DIR',
    );
    return c.text('Forbidden', 403);
  }

  let size: number;
  try {
    const info = await stat(filepath);
    if (!info.isFile()) return c.notFound();
    size = info.size;
  } catch {
    return c.notFound();
  }

  const ext = path.extname(filepath).slice(1).toLowerCase();
  const headers = {
    'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
    'content-length': String(size),
    'cache-control': UPLOADS_CACHE_CONTROL,
  };
  if (c.req.method === 'HEAD') return new Response(null, { headers });

  // One queued chunk: a slow client never makes the web stream buffer the file.
  const body = Readable.toWeb(createReadStream(filepath), { strategy: { highWaterMark: 1 } });
  return new Response(body as unknown as ReadableStream<Uint8Array>, { headers });
}
