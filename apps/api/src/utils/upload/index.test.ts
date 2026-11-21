import '../../test-setup.ts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../config/index.ts';
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
  WEBP_LOSSY_1x1,
} from '../../test-fixtures/images.ts';
import type { StorageDriver } from '../storage/types.ts';
import { UploadValidationError } from './errors.ts';
import {
  deleteStoredFile,
  generateStorageKey,
  saveUploadedFile,
  storageDeps,
  thumbnailKey,
  validateImagePart,
} from './index.ts';
import { THUMBNAIL_MAX_SIZE_BYTES } from './limits.ts';

/** UUIDv4 (lower-case, as produced by `crypto.randomUUID()`). */
const UUID_V4 = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

/** A part whose declared size matches its bytes. */
function part(data: Uint8Array, declaredType = 'image/jpeg', size = data.byteLength) {
  return { declaredType, size, data };
}

/** Run `fn` and return the `UploadValidationError` it throws (fails the test otherwise). */
function rejection(fn: () => unknown): UploadValidationError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(UploadValidationError);
    return err as UploadValidationError;
  }
  throw new Error('expected an UploadValidationError');
}

describe('generateStorageKey', () => {
  it('returns { id, key } with key equal to "<id>.jpg" for image/jpeg', () => {
    const { id, key } = generateStorageKey('image/jpeg');
    expect(id).toMatch(new RegExp(`^${UUID_V4}$`));
    expect(key).toBe(`${id}.jpg`);
  });

  it('takes the extension from the fixed table for every supported type', () => {
    expect(generateStorageKey('image/png').key).toMatch(new RegExp(`^${UUID_V4}\\.png$`));
    expect(generateStorageKey('image/webp').key).toMatch(new RegExp(`^${UUID_V4}\\.webp$`));
  });

  it('produces 1,000 unique keys in 1,000 calls', () => {
    const keys = new Set(Array.from({ length: 1000 }, () => generateStorageKey('image/jpeg').key));
    expect(keys.size).toBe(1000);
  });
});

describe('thumbnailKey', () => {
  it('appends _medium and the thumbnail type extension to the id', () => {
    const id = crypto.randomUUID();
    expect(thumbnailKey(id, 'image/png')).toBe(`${id}_medium.png`);
    expect(thumbnailKey(id, 'image/jpeg')).toBe(`${id}_medium.jpg`);
  });
});

describe('validateImagePart', () => {
  let originalAllowed: typeof config.UPLOAD_ALLOWED_TYPES;

  beforeEach(() => {
    originalAllowed = config.UPLOAD_ALLOWED_TYPES;
  });

  afterEach(() => {
    // Restore the shared config singleton after allowlist mutations.
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).UPLOAD_ALLOWED_TYPES = originalAllowed;
  });

  it('returns the detected image for a valid part', () => {
    expect(validateImagePart(part(JPEG_1x1), 'file')).toEqual({
      mime: 'image/jpeg',
      ext: 'jpg',
      width: 1,
      height: 1,
    });
    expect(validateImagePart(part(WEBP_LOSSY_1x1, 'image/webp'), 'file').mime).toBe('image/webp');
  });

  it('accepts a 6016 × 6016 camera-sized JPEG', () => {
    expect(validateImagePart(part(makeJpeg(6016, 6016)), 'file')).toMatchObject({
      width: 6016,
      height: 6016,
    });
  });

  it('lets the detected type win over an allowed but different declared type', () => {
    expect(validateImagePart(part(PNG_1x1, 'image/jpeg'), 'file').mime).toBe('image/png');
  });

  it.each(['', 'application/octet-stream', 'IMAGE/JPEG', 'image/jpeg; charset=binary'])(
    'treats declared type %j as an acceptable hint',
    (declaredType) => {
      expect(validateImagePart(part(JPEG_1x1, declaredType), 'file').mime).toBe('image/jpeg');
    },
  );

  it('rejects a file over UPLOAD_MAX_SIZE_BYTES with FILE_TOO_LARGE before reading the bytes', () => {
    const err = rejection(() =>
      validateImagePart(part(HTML_BYTES, 'text/html', config.UPLOAD_MAX_SIZE_BYTES + 1), 'file'),
    );
    expect(err).toMatchObject({ code: 'FILE_TOO_LARGE', status: 400, field: 'file' });
  });

  it('accepts a file of exactly UPLOAD_MAX_SIZE_BYTES', () => {
    expect(
      validateImagePart(part(JPEG_1x1, 'image/jpeg', config.UPLOAD_MAX_SIZE_BYTES), 'file').mime,
    ).toBe('image/jpeg');
  });

  it('rejects a thumbnail over the thumbnail cap with FILE_TOO_LARGE', () => {
    const err = rejection(() =>
      validateImagePart(part(JPEG_1x1, 'image/jpeg', THUMBNAIL_MAX_SIZE_BYTES + 1), 'thumbnail'),
    );
    expect(err).toMatchObject({ code: 'FILE_TOO_LARGE', status: 400, field: 'thumbnail' });
  });

  it('rejects a disallowed declared type even with valid image bytes', () => {
    const err = rejection(() => validateImagePart(part(JPEG_1x1, 'text/html'), 'file'));
    expect(err).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE', status: 415, field: 'file' });
  });

  it('never echoes the declared type in the rejection message', () => {
    const err = rejection(() => validateImagePart(part(JPEG_1x1, 'x-evil/<script>'), 'file'));
    expect(err.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(err.message).not.toContain('x-evil');
    expect(err.message).not.toContain('<script>');
  });

  it.each([
    ['HTML declared as image/jpeg', HTML_BYTES, 'image/jpeg'],
    ['HTML declared as octet-stream', HTML_BYTES, 'application/octet-stream'],
    ['SVG declared as image/png', SVG_BYTES, 'image/png'],
    ['GIF declared as image/png', GIF89A_1x1, 'image/png'],
  ])('rejects unknown bytes (%s) with UNSUPPORTED_MEDIA_TYPE', (_name, data, declaredType) => {
    const err = rejection(() => validateImagePart(part(data, declaredType), 'file'));
    expect(err).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE', status: 415 });
  });

  it('rejects a detected type outside an operator-narrowed allowlist', () => {
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).UPLOAD_ALLOWED_TYPES = ['image/jpeg', 'image/png'];
    const err = rejection(() => validateImagePart(part(WEBP_LOSSY_1x1, ''), 'file'));
    expect(err).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE', status: 415 });
  });

  it('rejects a JPEG without a frame header with INVALID_IMAGE', () => {
    const err = rejection(() => validateImagePart(part(JPEG_NO_SOF), 'file'));
    expect(err).toMatchObject({ code: 'INVALID_IMAGE', status: 400, field: 'file' });
  });

  it.each([
    ['zero width', makePng(0, 10)],
    ['zero height', makeJpeg(10, 0)],
    ['a side over 16,384 px', makePng(16_385, 1)],
    ['more than 50 MP', makeJpeg(10_000, 10_000)],
    ['a 65535 × 65535 PNG bomb header', PNG_BOMB_HEADER],
  ])('rejects an original with %s as INVALID_IMAGE', (_name, data) => {
    const err = rejection(() => validateImagePart(part(data, ''), 'file'));
    expect(err).toMatchObject({ code: 'INVALID_IMAGE', field: 'file' });
  });

  it('rejects a thumbnail wider than 1,200 px as INVALID_IMAGE', () => {
    const err = rejection(() => validateImagePart(part(makeJpeg(1201, 100)), 'thumbnail'));
    expect(err).toMatchObject({ code: 'INVALID_IMAGE', field: 'thumbnail' });
    expect(rejection(() => validateImagePart(part(makeJpeg(2000, 2000)), 'thumbnail')).code).toBe(
      'INVALID_IMAGE',
    );
  });

  it('accepts a 1,200 × 1,200 thumbnail', () => {
    expect(validateImagePart(part(makeJpeg(1200, 1200)), 'thumbnail').width).toBe(1200);
  });
});

describe('storage helpers (saveUploadedFile, deleteStoredFile)', () => {
  let originalDriver: StorageDriver;
  let calls: Array<{ op: 'save' | 'delete'; key: string; contentType?: string; size?: number }>;

  beforeEach(() => {
    originalDriver = storageDeps.driver;
    calls = [];
    storageDeps.driver = {
      save: (data, key, options) => {
        calls.push({ op: 'save', key, contentType: options.contentType, size: data.byteLength });
        return Promise.resolve(`driver://${key}`);
      },
      delete: (key) => {
        calls.push({ op: 'delete', key });
        return Promise.resolve();
      },
    };
  });

  afterEach(() => {
    storageDeps.driver = originalDriver;
  });

  it('saveUploadedFile passes the key and the explicit content type to the driver', async () => {
    const url = await saveUploadedFile(JPEG_1x1, 'abc.jpg', 'image/jpeg');
    expect(url).toBe('driver://abc.jpg');
    expect(calls).toEqual([
      { op: 'save', key: 'abc.jpg', contentType: 'image/jpeg', size: JPEG_1x1.byteLength },
    ]);
  });

  it('deleteStoredFile deletes the key through the driver', async () => {
    await deleteStoredFile('abc.jpg');
    expect(calls).toEqual([{ op: 'delete', key: 'abc.jpg' }]);
  });
});
