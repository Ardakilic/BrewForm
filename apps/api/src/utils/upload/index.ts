/**
 * Upload helpers for recipe photos (ADR-019): server-generated storage keys,
 * content-based validation of each multipart part, and thin wrappers over the
 * configured storage driver that always pass an explicit content type.
 *
 * The client filename is never an input to anything here.
 */
import { config } from '../../config/index.ts';
import { createStorageDriver, type StorageDriver } from '../storage/index.ts';
import { type UploadPartField, UploadValidationError } from './errors.ts';
import {
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE_PX,
  THUMBNAIL_MAX_SIDE_PX,
  THUMBNAIL_MAX_SIZE_BYTES,
} from './limits.ts';
import { MIME_TO_EXT, type SupportedImageMime } from './mime.ts';
import { type DetectedImage, detectImage, matchImageSignature } from './sniff.ts';

export type { DetectedImage } from './sniff.ts';

/** Mutable storage dependencies (module `deps` pattern): tests swap `driver` for a fake. */
export const storageDeps: { driver: StorageDriver } = { driver: createStorageDriver() };

/** One uploaded multipart part, as the controller passes it (no filename). */
export interface UploadPart {
  /** The client-declared Content-Type: an untrusted hint only. */
  declaredType: string;
  /** Size in bytes. */
  size: number;
  /** The part's bytes. */
  data: Uint8Array;
}

/** Resize options for a thumbnail variant; height defaults to width for a square crop. */
export interface ThumbnailOptions {
  width: number;
  height?: number;
  quality?: number;
}

const THUMBNAIL_SIZES: Record<string, ThumbnailOptions> = {
  small: { width: 200, height: 200, quality: 80 },
  medium: { width: 600, height: 600, quality: 85 },
  large: { width: 1200, height: 1200, quality: 90 },
};

/**
 * Generate a fresh storage key for an original photo: `<uuidv4>.<ext>`, with
 * the extension looked up in the fixed {@link MIME_TO_EXT} table.
 *
 * @param mime - The server-detected image type.
 * @returns The UUID (`id`, reused by {@link thumbnailKey}) and the object key.
 */
export function generateStorageKey(mime: SupportedImageMime): { id: string; key: string } {
  const id = crypto.randomUUID();
  return { id, key: `${id}.${MIME_TO_EXT[mime]}` };
}

/**
 * Derive the thumbnail key for an original's id: `<id>_medium.<ext>`, where
 * the extension comes from the thumbnail's own detected type.
 *
 * @param id - The UUID returned by {@link generateStorageKey}.
 * @param mime - The thumbnail's server-detected image type.
 */
export function thumbnailKey(id: string, mime: SupportedImageMime): string {
  return `${id}_medium.${MIME_TO_EXT[mime]}`;
}

/**
 * Normalise a declared Content-Type for comparison: drop parameters, trim and
 * lower-case (`'IMAGE/JPEG; x=y'` → `'image/jpeg'`).
 */
function normaliseDeclaredType(declaredType: string): string {
  return (declaredType.split(';')[0] ?? '').trim().toLowerCase();
}

/**
 * Validate one uploaded image part and return what its bytes really are.
 *
 * Checks, in order: (1) the part's size cap (`UPLOAD_MAX_SIZE_BYTES` for the
 * original, {@link THUMBNAIL_MAX_SIZE_BYTES} for the thumbnail); (2) the
 * declared type, an advisory hint that is rejected only when it is non-empty,
 * not `application/octet-stream` and not allowed; (3) magic-byte detection;
 * (4) the allowlist (detected type ∩ `UPLOAD_ALLOWED_TYPES`); (5) the
 * dimension limits (non-zero; originals at most {@link MAX_IMAGE_SIDE_PX} per
 * side and {@link MAX_IMAGE_PIXELS} in total; thumbnails at most
 * {@link THUMBNAIL_MAX_SIDE_PX} per side).
 *
 * @param part - The part's declared type, size and bytes.
 * @param kind - Which part this is; reported as the error `field`.
 * @returns The detected image (its type decides the key extension and stored Content-Type).
 * @throws {UploadValidationError} `FILE_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE` or
 *   `INVALID_IMAGE`, with a fixed message that never echoes client input.
 */
export function validateImagePart(part: UploadPart, kind: UploadPartField): DetectedImage {
  const allowed: readonly string[] = config.UPLOAD_ALLOWED_TYPES;
  const maxBytes = kind === 'file' ? config.UPLOAD_MAX_SIZE_BYTES : THUMBNAIL_MAX_SIZE_BYTES;

  if (part.size > maxBytes || part.data.byteLength > maxBytes) {
    throw new UploadValidationError('FILE_TOO_LARGE', kind);
  }

  const declared = normaliseDeclaredType(part.declaredType);
  if (declared !== '' && declared !== 'application/octet-stream' && !allowed.includes(declared)) {
    throw new UploadValidationError('UNSUPPORTED_MEDIA_TYPE', kind);
  }

  const image = detectImage(part.data);
  if (!image) {
    // An allowed format's signature with an unreadable header is a broken
    // image; anything else is content of an unsupported type.
    const signature = matchImageSignature(part.data);
    const malformed = signature !== null && allowed.includes(signature);
    throw new UploadValidationError(malformed ? 'INVALID_IMAGE' : 'UNSUPPORTED_MEDIA_TYPE', kind);
  }

  if (!allowed.includes(image.mime)) {
    throw new UploadValidationError('UNSUPPORTED_MEDIA_TYPE', kind);
  }

  const { width, height } = image;
  const maxSide = kind === 'file' ? MAX_IMAGE_SIDE_PX : THUMBNAIL_MAX_SIDE_PX;
  if (
    width <= 0 ||
    height <= 0 ||
    width > maxSide ||
    height > maxSide ||
    (kind === 'file' && width * height > MAX_IMAGE_PIXELS)
  ) {
    throw new UploadValidationError('INVALID_IMAGE', kind);
  }

  return image;
}

/**
 * Build the public URL for a stored file: `/uploads/<key>` for the local
 * driver, otherwise `<S3_PUBLIC_URL>/<key>`.
 */
export function getPublicUrl(filename: string): string {
  if (config.STORAGE_DRIVER === 'local') {
    return `/uploads/${filename}`;
  }
  return `${config.S3_PUBLIC_URL}/${filename}`;
}

/**
 * Persist an original photo through {@link storageDeps}' driver.
 *
 * @param data - The validated bytes.
 * @param key - A key from {@link generateStorageKey} in the same request.
 * @param contentType - The server-detected MIME type (never the client's).
 * @returns The driver's public URL or path for the object.
 */
export function saveUploadedFile(
  data: Uint8Array,
  key: string,
  contentType: SupportedImageMime,
): Promise<string> {
  return storageDeps.driver.save(data, key, { contentType });
}

/**
 * Persist a client-produced thumbnail and return its public URL.
 *
 * Thumbnails are produced client-side via `<canvas>` in PhotoUpload before
 * upload (see apps/web/src/components/photos/PhotoUpload.tsx) and validated
 * by {@link validateImagePart} like the original; the server only stores them.
 *
 * @param data - The validated thumbnail bytes.
 * @param key - A key from {@link thumbnailKey} for the same upload.
 * @param contentType - The thumbnail's server-detected MIME type.
 * @returns The public URL from {@link getPublicUrl}.
 */
export async function saveThumbnail(
  data: Uint8Array,
  key: string,
  contentType: SupportedImageMime,
): Promise<string> {
  await storageDeps.driver.save(data, key, { contentType });
  return getPublicUrl(key);
}

/**
 * Delete a stored object through {@link storageDeps}' driver (used to clean up
 * the objects of an upload that failed part-way).
 *
 * @param key - A key written earlier in the same request.
 */
export function deleteStoredFile(key: string): Promise<void> {
  return storageDeps.driver.delete(key);
}

/** Return a shallow copy of the preset thumbnail size definitions (small/medium/large). */
export function getThumbnailSizes(): Record<string, ThumbnailOptions> {
  return { ...THUMBNAIL_SIZES };
}
