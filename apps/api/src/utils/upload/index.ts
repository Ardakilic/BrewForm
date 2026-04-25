import { config } from '../../config/index.ts';

const ALLOWED_TYPES = config.UPLOAD_ALLOWED_TYPES.split(',');
const MAX_SIZE = config.UPLOAD_MAX_SIZE_BYTES;

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

export function generateThumbnailFilename(originalFilename: string, size: string = 'medium'): string {
  const ext = originalFilename.split('.').pop() || 'jpg';
  const baseName = originalFilename.replace(`.${ext}`, '');
  return `${baseName}_${size}.${ext}`;
}

export function getPublicUrl(filename: string): string {
  return `/uploads/${filename}`;
}

export async function ensureUploadDir(): Promise<void> {
  try {
    await Deno.mkdir(config.UPLOAD_DIR, { recursive: true });
  } catch {
    // Directory already exists
  }
}

export async function saveUploadedFile(data: Uint8Array, filename: string): Promise<string> {
  await ensureUploadDir();
  const filepath = `${config.UPLOAD_DIR}/${filename}`;
  await Deno.writeFile(filepath, data);
  return filepath;
}

export function getThumbnailSizes(): Record<string, ThumbnailOptions> {
  return { ...THUMBNAIL_SIZES };
}

export function generateThumbnail(
  _sourcePath: string,
  _destPath: string,
  _options: ThumbnailOptions,
): Promise<void> {
  // Thumbnail generation requires image processing library (e.g., sharp).
  // This is a placeholder that copies the source file as-is.
  // When a suitable Deno-compatible image processing library is available,
  // replace this with actual resize logic:
  //   const image = await processImage(sourcePath, options);
  //   await Deno.writeFile(destPath, image);
  //
  // For now, thumbnail generation is deferred to a future phase
  // where a proper image processing pipeline will be implemented.
  // Phase 9 (Frontend Features) will add client-side resize before upload.
  throw new Error('Thumbnail generation not yet implemented. Use client-side resize or a future server-side implementation.');
}