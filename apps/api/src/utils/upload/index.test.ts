import '../../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  generateFilename,
  generateThumbnailFilename,
  getPublicUrl,
  getThumbnailSizes,
  validateImageUpload,
} from './index.ts';

describe('generateFilename', () => {
  it('should return a string matching <timestamp>-<8hex>.<ext>', () => {
    const result = generateFilename('photo.jpg');
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^\d+-[a-f0-9]{8}\.jpg$/);
  });

  it('should preserve the original extension', () => {
    const result = generateFilename('avatar.png');
    expect(result).toMatch(/\.png$/);
  });

  it('should use the trailing segment as extension when no dot is present', () => {
    // `'noextension'.split('.').pop()` returns 'noextension' (not undefined),
    // so the filename becomes `<ts>-<hex>.noextension`. The `|| 'jpg'` fallback
    // only fires when split returns an empty array (i.e. empty input).
    const result = generateFilename('noextension');
    expect(result).toMatch(/\.noextension$/);
  });

  it('should produce unique names on repeated calls', () => {
    const a = generateFilename('photo.jpg');
    const b = generateFilename('photo.jpg');
    expect(a).not.toBe(b);
  });
});

describe('generateThumbnailFilename', () => {
  it('should append _medium to the base name by default', () => {
    const result = generateThumbnailFilename('photo.jpg');
    expect(result).toBe('photo_medium.jpg');
  });

  it('should append _small when size=small is passed', () => {
    const result = generateThumbnailFilename('photo.jpg', 'small');
    expect(result).toBe('photo_small.jpg');
  });

  it('should append _large when size=large is passed', () => {
    const result = generateThumbnailFilename('photo.jpg', 'large');
    expect(result).toBe('photo_large.jpg');
  });

  it('should preserve the extension', () => {
    const result = generateThumbnailFilename('avatar.png', 'small');
    expect(result).toBe('avatar_small.png');
  });

  it('should handle filenames with multiple dots', () => {
    const result = generateThumbnailFilename('my.photo.file.jpg', 'small');
    expect(result).toBe('my.photo.file_small.jpg');
  });
});

describe('getPublicUrl', () => {
  it('should return a URL containing the filename', () => {
    const result = getPublicUrl('test.jpg');
    expect(typeof result).toBe('string');
    expect(result).toContain('test.jpg');
  });

  it('should return /uploads/<name> for the local driver (default config)', () => {
    const result = getPublicUrl('test.jpg');
    expect(result).toBe('/uploads/test.jpg');
  });
});

describe('getThumbnailSizes', () => {
  it('should return an object with small, medium, large keys', () => {
    const sizes = getThumbnailSizes();
    expect(sizes).toBeDefined();
    expect(sizes.small).toBeDefined();
    expect(sizes.medium).toBeDefined();
    expect(sizes.large).toBeDefined();
  });

  it('each size should have a width number', () => {
    const sizes = getThumbnailSizes();
    expect(typeof sizes.small.width).toBe('number');
    expect(typeof sizes.medium.width).toBe('number');
    expect(typeof sizes.large.width).toBe('number');
  });

  it('each size should have optional height and quality when defined', () => {
    const sizes = getThumbnailSizes();
    expect(sizes.small.height).toBeDefined();
    expect(sizes.small.quality).toBeDefined();
    expect(typeof sizes.small.height).toBe('number');
    expect(typeof sizes.small.quality).toBe('number');
  });

  it('should return a fresh top-level object each call (top-level keys do not leak)', () => {
    // getThumbnailSizes spreads THUMBNAIL_SIZES into a new top-level object, so
    // adding/removing a top-level key on one returned object does not affect
    // the next. (Nested size objects are shared by reference — shallow copy.)
    const a = getThumbnailSizes();
    a.extra = { width: 1 };
    const b = getThumbnailSizes();
    expect(b.extra).toBeUndefined();
  });
});

describe('validateImageUpload', () => {
  it('should return null for a valid JPEG under the size limit', () => {
    expect(validateImageUpload({ type: 'image/jpeg', size: 1000 })).toBeNull();
  });

  it('should return null for a valid PNG under the size limit', () => {
    expect(validateImageUpload({ type: 'image/png', size: 1000 })).toBeNull();
  });

  it('should return null for a valid WebP under the size limit', () => {
    expect(validateImageUpload({ type: 'image/webp', size: 1000 })).toBeNull();
  });

  it('should return an error string for an unsupported type', () => {
    const result = validateImageUpload({ type: 'text/plain', size: 1000 });
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect(result).toContain('Unsupported file type');
  });

  it('should return an error string when the file exceeds the max size', () => {
    const result = validateImageUpload({ type: 'image/jpeg', size: 11 * 1024 * 1024 });
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect(result).toContain('File too large');
  });

  it('should accept a file one byte under the default 10MB boundary', () => {
    expect(validateImageUpload({ type: 'image/jpeg', size: 10 * 1024 * 1024 - 1 })).toBeNull();
  });
});
