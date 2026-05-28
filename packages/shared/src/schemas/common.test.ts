import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { PaginationSchema, QrCodeFilenameSchema, SearchQuerySchema, SlugSchema } from './common.ts';

describe('QrCodeFilenameSchema', () => {
  it('should validate valid slug.png', () => {
    const result = QrCodeFilenameSchema.safeParse('my-brew.png');
    expect(result.success).toBe(true);
  });

  it('should validate valid slug.svg', () => {
    const result = QrCodeFilenameSchema.safeParse('my-brew.svg');
    expect(result.success).toBe(true);
  });

  it('should validate uppercase extension', () => {
    const result = QrCodeFilenameSchema.safeParse('my-brew.PNG');
    expect(result.success).toBe(true);
  });

  it('should validate simple slug without dash', () => {
    const result = QrCodeFilenameSchema.safeParse('brew.png');
    expect(result.success).toBe(true);
  });

  it('should reject no extension', () => {
    const result = QrCodeFilenameSchema.safeParse('my-brew');
    expect(result.success).toBe(false);
  });

  it('should reject invalid extension', () => {
    const result = QrCodeFilenameSchema.safeParse('my-brew.jpg');
    expect(result.success).toBe(false);
  });

  it('should reject filename starting with dash', () => {
    const result = QrCodeFilenameSchema.safeParse('-my-brew.png');
    expect(result.success).toBe(false);
  });

  it('should reject filename ending with dash', () => {
    const result = QrCodeFilenameSchema.safeParse('my-brew-.png');
    expect(result.success).toBe(false);
  });

  it('should accept uppercase slug letters (regex is case-insensitive)', () => {
    const result = QrCodeFilenameSchema.safeParse('My-Brew.png');
    expect(result.success).toBe(true);
  });

  it('should reject empty string', () => {
    const result = QrCodeFilenameSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});

describe('SearchQuerySchema', () => {
  it('should validate valid query', () => {
    const result = SearchQuerySchema.safeParse({ q: 'espresso recipe' });
    expect(result.success).toBe(true);
  });

  it('should validate minimum 2 char query', () => {
    const result = SearchQuerySchema.safeParse({ q: 'ab' });
    expect(result.success).toBe(true);
  });

  it('should reject less than 2 chars', () => {
    const result = SearchQuerySchema.safeParse({ q: 'a' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('q'))).toBe(true);
    }
  });

  it('should reject empty query string', () => {
    const result = SearchQuerySchema.safeParse({ q: '' });
    expect(result.success).toBe(false);
  });

  it('should validate query up to 200 chars', () => {
    const result = SearchQuerySchema.safeParse({ q: 'a'.repeat(200) });
    expect(result.success).toBe(true);
  });

  it('should reject query over 200 chars', () => {
    const result = SearchQuerySchema.safeParse({ q: 'a'.repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('q'))).toBe(true);
    }
  });

  it('should reject missing q field', () => {
    const result = SearchQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('PaginationSchema', () => {
  it('should apply defaults', () => {
    const result = PaginationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.perPage).toBe(20);
    }
  });

  it('should accept valid values', () => {
    const result = PaginationSchema.safeParse({ page: 3, perPage: 50 });
    expect(result.success).toBe(true);
  });
});

describe('SlugSchema', () => {
  it('should validate simple slug', () => {
    const result = SlugSchema.safeParse('my-brew');
    expect(result.success).toBe(true);
  });

  it('should reject slug with uppercase', () => {
    const result = SlugSchema.safeParse('My-Brew');
    expect(result.success).toBe(false);
  });

  it('should reject slug starting with dash', () => {
    const result = SlugSchema.safeParse('-brew');
    expect(result.success).toBe(false);
  });
});
