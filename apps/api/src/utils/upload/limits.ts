/**
 * Upload size and dimension limits (ADR-019).
 *
 * This module imports only `config`, so `middleware/bodyLimit.ts` can read
 * {@link PHOTO_BODY_MAX_BYTES} without loading `utils/upload/index.ts`, which
 * constructs the storage driver at import time.
 */
import { config } from '../../config/index.ts';

/** Maximum width or height of an original photo, in pixels. */
export const MAX_IMAGE_SIDE_PX = 16_384;

/** Maximum total pixels (width × height) of an original photo: accepts 48-50 MP phone photos. */
export const MAX_IMAGE_PIXELS = 50_000_000;

/** Maximum width or height of a thumbnail, in pixels. */
export const THUMBNAIL_MAX_SIDE_PX = 1_200;

/** Maximum thumbnail part size: 1 MiB, or `UPLOAD_MAX_SIZE_BYTES` when that is smaller. */
export const THUMBNAIL_MAX_SIZE_BYTES = Math.min(1024 * 1024, config.UPLOAD_MAX_SIZE_BYTES);

/**
 * Request body cap for `/api/v1/photos` routes: one original, one thumbnail and
 * 64 KiB of multipart overhead (about 11.06 MiB with the default 10 MiB limit).
 */
export const PHOTO_BODY_MAX_BYTES =
  config.UPLOAD_MAX_SIZE_BYTES + THUMBNAIL_MAX_SIZE_BYTES + 64 * 1024;
