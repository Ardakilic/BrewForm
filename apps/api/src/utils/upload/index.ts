import { config } from '../../config/index.ts';
import { createStorageDriver } from '../storage/index.ts';

const ALLOWED_TYPES = config.UPLOAD_ALLOWED_TYPES.split(',');
const MAX_SIZE = config.UPLOAD_MAX_SIZE_BYTES;

const driver = createStorageDriver();

export interface UploadedFile {
  filename: string;
  path: string;
  url: string;
  size: number;
  mimeType: string;
}

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
 * Validates that an uploaded image file's type and size are within allowed limits.
 *
 * Returns `null` if the file passes validation, or an error message string
 * describing why validation failed (unsupported type or file too large).
 *
 * `ALLOWED_TYPES` and `MAX_SIZE` are read from config at module load time.
 *
 * @param file - An object with `type` (MIME type string) and `size` (bytes).
 * @returns A human-readable error string on failure, or `null` on success.
 */
export function validateImageUpload(file: { type: string; size: number }): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `Unsupported file type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(', ')}`;
  }
  if (file.size > MAX_SIZE) {
    return `File too large. Maximum size: ${MAX_SIZE / (1024 * 1024)}MB`;
  }
  return null;
}

export function generateFilename(originalName: string): string {
  const ext = originalName.split('.').pop() || 'jpg';
  const uniqueId = crypto.randomUUID().slice(0, 8);
  const timestamp = Date.now();
  return `${timestamp}-${uniqueId}.${ext}`;
}

export function generateThumbnailFilename(
  originalFilename: string,
  size: string = 'medium',
): string {
  const ext = originalFilename.split('.').pop() || 'jpg';
  const baseName = originalFilename.replace(`.${ext}`, '');
  return `${baseName}_${size}.${ext}`;
}

export function getPublicUrl(filename: string): string {
  if (config.STORAGE_DRIVER === 'local') {
    return `/uploads/${filename}`;
  }
  return `${config.S3_PUBLIC_URL}/${filename}`;
}

export async function saveUploadedFile(data: Uint8Array, filename: string): Promise<string> {
  return driver.save(data, filename);
}

export function getThumbnailSizes(): Record<string, ThumbnailOptions> {
  return { ...THUMBNAIL_SIZES };
}

/**
 * Persists pre-resized thumbnail bytes to disk and returns the public URL.
 *
 * Thumbnails are produced client-side via `<canvas>` in PhotoUpload before
 * upload (see apps/web/src/components/photos/PhotoUpload.tsx). The server
 * only stores them. If no thumbnail bytes are provided the original file's
 * URL is returned so callers can always populate `Photo.thumbnailUrl`.
 */
export async function saveThumbnail(
  thumbnailBytes: Uint8Array | null,
  originalFilename: string,
  fallbackUrl: string,
  size: string = 'medium',
): Promise<string> {
  if (!thumbnailBytes || thumbnailBytes.length === 0) {
    return fallbackUrl;
  }
  const filename = generateThumbnailFilename(originalFilename, size);
  await driver.save(thumbnailBytes, filename);
  return getPublicUrl(filename);
}
