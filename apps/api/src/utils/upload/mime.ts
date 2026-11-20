/**
 * The image types the upload path can detect and store, and the fixed
 * MIME-to-extension table used to build storage keys.
 *
 * This module has no imports so that `config/env.ts` can validate
 * `UPLOAD_ALLOWED_TYPES` against it without an import cycle.
 */

/** Image MIME types the built-in detector (`sniff.ts`) recognises; the upper bound for `UPLOAD_ALLOWED_TYPES`. */
export const SUPPORTED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** One of {@link SUPPORTED_IMAGE_MIME_TYPES}. */
export type SupportedImageMime = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

/** Storage key extension for each supported type (the only source of key extensions). */
export const MIME_TO_EXT: Readonly<Record<SupportedImageMime, 'jpg' | 'png' | 'webp'>> =
  Object.freeze({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  });

/**
 * Type guard: is `value` exactly one of {@link SUPPORTED_IMAGE_MIME_TYPES}?
 *
 * @param value - A MIME type string (compared case-sensitively; normalise first).
 */
export function isSupportedImageMime(value: string): value is SupportedImageMime {
  return (SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}
