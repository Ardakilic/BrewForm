/**
 * Image byte fixtures for upload-validation tests.
 *
 * The "valid" samples are the smallest byte sequences whose headers a real
 * decoder (and `utils/upload/sniff.ts`) accepts; the hostile samples cover the
 * shapes the upload path must reject. Nothing here touches the filesystem.
 */

/** Build a byte array from a list of byte values and nested arrays. */
function bytes(...parts: Array<number | ArrayLike<number>>): Uint8Array {
  const flat: number[] = [];
  for (const part of parts) {
    if (typeof part === 'number') flat.push(part);
    else for (let i = 0; i < part.length; i++) flat.push(part[i]);
  }
  return Uint8Array.from(flat);
}

/** Decode a base64 string into a fresh `Uint8Array`. */
function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'base64'));
}

/** Big-endian 16-bit integer as two bytes. */
function u16be(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

/** Big-endian 32-bit integer as four bytes. */
function u32be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/** ASCII text as bytes. */
function ascii(text: string): number[] {
  return Array.from(text, (ch) => ch.charCodeAt(0));
}

/** CRC-32 (IEEE 802.3, as used by PNG chunks) of `data`. */
function crc32(data: ArrayLike<number>): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** A PNG chunk: length, type, data and the CRC over type + data. */
function pngChunk(type: string, data: ArrayLike<number>): Uint8Array {
  const typeAndData = bytes(ascii(type), data);
  return bytes(u32be(data.length), typeAndData, u32be(crc32(typeAndData)));
}

/** The 8-byte PNG signature. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** JPEG SOI marker. */
const JPEG_SOI = [0xff, 0xd8];

/** JPEG EOI marker. */
const JPEG_EOI = [0xff, 0xd9];

/** JPEG APP0 (JFIF 1.1, no density, no embedded thumbnail). */
const JPEG_APP0 = [
  0xff,
  0xe0,
  ...u16be(16),
  ...ascii('JFIF'),
  0x00,
  0x01,
  0x01,
  0x00,
  ...u16be(1),
  ...u16be(1),
  0x00,
  0x00,
];

/** JPEG SOS for one component, followed by two bytes of entropy-coded data. */
const JPEG_SOS = [0xff, 0xda, ...u16be(8), 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34];

/** Options for {@link makeJpeg}. */
export interface MakeJpegOptions {
  /** Frame marker byte (default `0xc0`, baseline SOF0; `0xc2` is progressive SOF2). */
  sofMarker?: number;
  /** Payload bytes of an APP1 segment inserted before the frame header (default none). */
  app1Bytes?: number;
}

/** Build a JPEG header (SOI, APP0, optional APP1, SOFn, SOS, EOI) declaring `width` × `height`. */
export function makeJpeg(width: number, height: number, options: MakeJpegOptions = {}): Uint8Array {
  const { sofMarker = 0xc0, app1Bytes = 0 } = options;
  const app1 =
    app1Bytes > 0 ? [0xff, 0xe1, ...u16be(app1Bytes + 2), ...new Array(app1Bytes).fill(0)] : [];
  const sof = [
    0xff,
    sofMarker,
    ...u16be(11),
    0x08,
    ...u16be(height),
    ...u16be(width),
    0x01,
    0x01,
    0x11,
    0x00,
  ];
  return bytes(JPEG_SOI, JPEG_APP0, app1, sof, JPEG_SOS, JPEG_EOI);
}

/** Build a PNG (signature, IHDR with valid CRC, empty IDAT, IEND) declaring `width` × `height`. */
export function makePng(width: number, height: number): Uint8Array {
  const ihdr = [...u32be(width), ...u32be(height), 0x08, 0x06, 0x00, 0x00, 0x00];
  return bytes(PNG_SIGNATURE, pngChunk('IHDR', ihdr), pngChunk('IDAT', []), pngChunk('IEND', []));
}

/** A 1×1 baseline JPEG header (SOI + APP0 + SOF0 + SOS + EOI). */
export const JPEG_1x1: Uint8Array = makeJpeg(1, 1);

/** A complete, decodable 1×1 RGBA PNG (signature + IHDR + IDAT + IEND). */
export const PNG_1x1: Uint8Array = fromBase64(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
);

/** A complete 1×1 lossy WebP (`VP8 ` chunk). */
export const WEBP_LOSSY_1x1: Uint8Array = fromBase64(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
);

/** A complete 1×1 lossless WebP (`VP8L` chunk). */
export const WEBP_LOSSLESS_1x1: Uint8Array = fromBase64(
  'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==',
);

/** A complete 1×1 extended WebP with alpha (`VP8X` + `ALPH` + `VP8 ` chunks). */
export const WEBP_VP8X_1x1: Uint8Array = fromBase64(
  'UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAwAAAARBxAR/Q9ERP8DAABWUDggGAAAABQBAJ0BKgEAAQAAAP4AAA3AAP7mtQAAAA==',
);

/** An HTML document with a script tag (the classic "image" upload disguise). */
export const HTML_BYTES: Uint8Array = new TextEncoder().encode(
  '<html><script>alert(1)</script></html>',
);

/** An SVG image (scriptable, never allowed). */
export const SVG_BYTES: Uint8Array = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><script>alert(1)</script></svg>',
);

/** A complete 1×1 GIF89a (a real image in a format outside the allowlist). */
export const GIF89A_1x1: Uint8Array = fromBase64(
  'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
);

/** A PNG whose IHDR declares 65535 × 65535 pixels (decompression-bomb header). */
export const PNG_BOMB_HEADER: Uint8Array = makePng(65535, 65535);

/** A JPEG that reaches SOS without any SOFn frame header (SOI + APP0 + SOS). */
export const JPEG_NO_SOF: Uint8Array = bytes(JPEG_SOI, JPEG_APP0, JPEG_SOS);
