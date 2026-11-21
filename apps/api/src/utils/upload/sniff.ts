/**
 * Built-in magic-byte image detector (ADR-019).
 *
 * Identifies JPEG, PNG and WebP from their leading bytes and reads the pixel
 * dimensions from the format header, without decoding pixel data. It is pure,
 * has no dependencies, and bounds-checks every read, so hostile input can only
 * make it return `null`.
 */
import { MIME_TO_EXT, type SupportedImageMime } from './mime.ts';

/** An image recognised by {@link detectImage}: its real type, key extension and header dimensions. */
export interface DetectedImage {
  mime: SupportedImageMime;
  ext: (typeof MIME_TO_EXT)[SupportedImageMime];
  width: number;
  height: number;
}

/** The 8-byte PNG signature. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** Do `bytes` contain the ASCII text `text` at `offset`? (Out-of-range reads compare false.) */
function hasAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/** Big-endian unsigned 16-bit read; the caller guarantees `offset + 2 <= length`. */
function u16be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

/** Big-endian unsigned 32-bit read; the caller guarantees `offset + 4 <= length`. */
function u32be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

/** Little-endian unsigned 16-bit read; the caller guarantees `offset + 2 <= length`. */
function u16le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

/** Little-endian unsigned 24-bit read; the caller guarantees `offset + 3 <= length`. */
function u24le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

/** Build a {@link DetectedImage} for `mime`. */
function detected(mime: SupportedImageMime, width: number, height: number): DetectedImage {
  return { mime, ext: MIME_TO_EXT[mime], width, height };
}

/** Is `bytes` prefixed by the JPEG SOI marker plus the start of the next marker (`FF D8 FF`)? */
function isJpegSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Is `bytes` prefixed by the 8-byte PNG signature? */
function isPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((value, i) => bytes[i] === value);
}

/** Does `bytes` start with a `RIFF` container whose form type is `WEBP`? */
function isWebpSignature(bytes: Uint8Array): boolean {
  return hasAscii(bytes, 0, 'RIFF') && hasAscii(bytes, 8, 'WEBP');
}

/** Is `marker` a JPEG start-of-frame (SOF0–SOF15) marker, excluding DHT (C4), JPG (C8) and DAC (CC)? */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * Walk the JPEG marker segments to the first SOFn header and read its
 * dimensions. Returns `null` on SOS/EOI before any SOFn, on a malformed
 * marker, or on any read past the end of the data.
 */
function detectJpeg(bytes: Uint8Array): DetectedImage | null {
  if (!isJpegSignature(bytes)) return null;
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    // Any number of 0xFF fill bytes may precede a marker code.
    while (i < bytes.length && bytes[i] === 0xff) i++;
    if (i >= bytes.length) return null;
    const marker = bytes[i];
    i++;
    // Standalone markers (RST0–RST7, TEM) carry no length field.
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    // SOS or EOI before any frame header, a stuffed zero or a second SOI: not a usable header.
    if (marker === 0xda || marker === 0xd9 || marker === 0x00 || marker === 0xd8) return null;
    if (i + 2 > bytes.length) return null;
    const segmentLength = u16be(bytes, i);
    if (segmentLength < 2) return null;
    if (isStartOfFrame(marker)) {
      // Segment layout: length (2), sample precision (1), height (2), width (2), …
      if (segmentLength < 7 || i + 7 > bytes.length) return null;
      return detected('image/jpeg', u16be(bytes, i + 5), u16be(bytes, i + 3));
    }
    i += segmentLength;
  }
  return null;
}

/** Read the PNG `IHDR` dimensions (big-endian u32 width/height at offsets 16 and 20). */
function detectPng(bytes: Uint8Array): DetectedImage | null {
  if (!isPngSignature(bytes)) return null;
  if (bytes.length < 24 || !hasAscii(bytes, 12, 'IHDR')) return null;
  return detected('image/png', u32be(bytes, 16), u32be(bytes, 20));
}

/** Read the canvas dimensions from the first WebP chunk (`VP8 `, `VP8L` or `VP8X`). */
function detectWebp(bytes: Uint8Array): DetectedImage | null {
  if (!isWebpSignature(bytes)) return null;
  // The first chunk header starts at offset 12; its payload at offset 20.
  if (hasAscii(bytes, 12, 'VP8 ')) {
    // Frame tag (3 bytes), start code 9D 01 2A, then 14-bit little-endian width and height.
    if (bytes.length < 30) return null;
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return detected('image/webp', u16le(bytes, 26) & 0x3fff, u16le(bytes, 28) & 0x3fff);
  }
  if (hasAscii(bytes, 12, 'VP8L')) {
    // Signature 0x2F, then 14 bits of (width - 1) and 14 bits of (height - 1), little-endian.
    if (bytes.length < 25 || bytes[20] !== 0x2f) return null;
    const width = 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]);
    const height = 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6));
    return detected('image/webp', width, height);
  }
  if (hasAscii(bytes, 12, 'VP8X')) {
    // Flags (1), reserved (3), then 24-bit little-endian (canvas width - 1) and (height - 1).
    if (bytes.length < 30) return null;
    return detected('image/webp', 1 + u24le(bytes, 24), 1 + u24le(bytes, 27));
  }
  return null;
}

/**
 * Identify a JPEG, PNG or WebP image from its bytes and read its header dimensions.
 *
 * @param bytes - The complete (or leading) bytes of an uploaded part.
 * @returns The detected type, key extension and dimensions, or `null` when the
 *   bytes are not a supported image or the header is truncated or malformed.
 */
export function detectImage(bytes: Uint8Array): DetectedImage | null {
  return detectJpeg(bytes) ?? detectPng(bytes) ?? detectWebp(bytes);
}

/**
 * Report which supported format's signature `bytes` start with, without
 * parsing the header. Used to tell a malformed image (`INVALID_IMAGE`) from
 * content of an unsupported type (`UNSUPPORTED_MEDIA_TYPE`).
 *
 * @param bytes - The leading bytes of an uploaded part.
 * @returns The format whose signature matches, or `null`.
 */
export function matchImageSignature(bytes: Uint8Array): SupportedImageMime | null {
  if (isJpegSignature(bytes)) return 'image/jpeg';
  if (isPngSignature(bytes)) return 'image/png';
  if (isWebpSignature(bytes)) return 'image/webp';
  return null;
}
