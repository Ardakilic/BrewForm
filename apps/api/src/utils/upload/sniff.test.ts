import { describe, expect, it } from 'vitest';
import {
  GIF89A_1x1,
  HTML_BYTES,
  JPEG_1x1,
  JPEG_NO_SOF,
  makeJpeg,
  makePng,
  PNG_1x1,
  PNG_BOMB_HEADER,
  SVG_BYTES,
  WEBP_LOSSLESS_1x1,
  WEBP_LOSSY_1x1,
  WEBP_VP8X_1x1,
} from '../../test-fixtures/images.ts';
import { detectImage, matchImageSignature } from './sniff.ts';

describe('detectImage', () => {
  it.each([
    ['JPEG_1x1', JPEG_1x1, { mime: 'image/jpeg', ext: 'jpg', width: 1, height: 1 }],
    ['PNG_1x1', PNG_1x1, { mime: 'image/png', ext: 'png', width: 1, height: 1 }],
    ['WEBP_LOSSY_1x1', WEBP_LOSSY_1x1, { mime: 'image/webp', ext: 'webp', width: 1, height: 1 }],
    [
      'WEBP_LOSSLESS_1x1',
      WEBP_LOSSLESS_1x1,
      { mime: 'image/webp', ext: 'webp', width: 1, height: 1 },
    ],
    ['WEBP_VP8X_1x1', WEBP_VP8X_1x1, { mime: 'image/webp', ext: 'webp', width: 1, height: 1 }],
    [
      'PNG_BOMB_HEADER',
      PNG_BOMB_HEADER,
      { mime: 'image/png', ext: 'png', width: 65535, height: 65535 },
    ],
  ])('detects %s', (_name, bytes, expected) => {
    expect(detectImage(bytes)).toEqual(expected);
  });

  it('reads the dimensions of a 6016 × 6016 camera-sized JPEG header', () => {
    expect(detectImage(makeJpeg(6016, 6016))).toEqual({
      mime: 'image/jpeg',
      ext: 'jpg',
      width: 6016,
      height: 6016,
    });
  });

  it('reads width and height separately (non-square JPEG and PNG)', () => {
    expect(detectImage(makeJpeg(640, 480))).toMatchObject({ width: 640, height: 480 });
    expect(detectImage(makePng(1920, 1080))).toMatchObject({ width: 1920, height: 1080 });
  });

  it('skips a 60 KB APP1 segment before SOF0', () => {
    expect(detectImage(makeJpeg(800, 600, { app1Bytes: 60 * 1024 }))).toEqual({
      mime: 'image/jpeg',
      ext: 'jpg',
      width: 800,
      height: 600,
    });
  });

  it('accepts a progressive (SOF2) JPEG', () => {
    expect(detectImage(makeJpeg(320, 200, { sofMarker: 0xc2 }))).toMatchObject({
      mime: 'image/jpeg',
      width: 320,
      height: 200,
    });
  });

  it('skips 0xFF fill bytes and standalone markers before the frame header', () => {
    const base = makeJpeg(10, 20);
    // SOI, then fill bytes, an RST0 standalone marker and a TEM marker, then the rest.
    const padded = Uint8Array.from([
      ...base.subarray(0, 2),
      0xff,
      0xff,
      0xd0,
      0xff,
      0x01,
      ...base.subarray(2),
    ]);
    expect(detectImage(padded)).toMatchObject({ width: 10, height: 20 });
  });

  it('does not treat DHT (C4), JPG (C8) or DAC (CC) as frame headers', () => {
    for (const marker of [0xc4, 0xc8, 0xcc]) {
      expect(detectImage(makeJpeg(10, 10, { sofMarker: marker }))).toBeNull();
    }
  });

  it.each([
    ['HTML', HTML_BYTES],
    ['SVG', SVG_BYTES],
    ['GIF', GIF89A_1x1],
    ['JPEG without SOF', JPEG_NO_SOF],
    ['truncated PNG header', PNG_1x1.subarray(0, 20)],
    ['PNG signature without IHDR', Uint8Array.from([...PNG_1x1.subarray(0, 12), 0, 0, 0, 0])],
    ['truncated lossy WebP header', WEBP_LOSSY_1x1.subarray(0, 26)],
    ['truncated lossless WebP header', WEBP_LOSSLESS_1x1.subarray(0, 22)],
    ['truncated VP8X WebP header', WEBP_VP8X_1x1.subarray(0, 27)],
    ['truncated JPEG frame header', makeJpeg(10, 10).subarray(0, 24)],
    ['empty array', new Uint8Array(0)],
    ['3-byte array', Uint8Array.from([0xff, 0xd8, 0xff])],
  ])('returns null for %s', (_name, bytes) => {
    expect(detectImage(bytes)).toBeNull();
  });

  it('returns null when a segment length points past the end of the data', () => {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x00]);
    expect(detectImage(bytes)).toBeNull();
  });
});

describe('matchImageSignature', () => {
  it('recognises the signature of each supported format, even when the header is broken', () => {
    expect(matchImageSignature(JPEG_NO_SOF)).toBe('image/jpeg');
    expect(matchImageSignature(PNG_1x1.subarray(0, 8))).toBe('image/png');
    expect(matchImageSignature(WEBP_LOSSY_1x1.subarray(0, 12))).toBe('image/webp');
  });

  it('returns null for other content', () => {
    expect(matchImageSignature(HTML_BYTES)).toBeNull();
    expect(matchImageSignature(GIF89A_1x1)).toBeNull();
    expect(matchImageSignature(new Uint8Array(0))).toBeNull();
  });
});
