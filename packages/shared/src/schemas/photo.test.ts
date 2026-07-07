import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { PhotoUploadSchema } from './photo.ts';

describe('PhotoUploadSchema', () => {
  it('should parse a valid input with only required fields (sortOrder defaults to 0)', () => {
    const result = PhotoUploadSchema.safeParse({ recipeId: crypto.randomUUID() });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBe(0);
    }
  });

  it('should parse a valid input with all fields', () => {
    const result = PhotoUploadSchema.safeParse({
      recipeId: crypto.randomUUID(),
      alt: 'A poured latte',
      sortOrder: 3,
    });
    expect(result.success).toBe(true);
  });

  it('should fail when required recipeId is missing', () => {
    const result = PhotoUploadSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('recipeId'))).toBe(true);
    }
  });

  it('should fail when recipeId is not a string', () => {
    const result = PhotoUploadSchema.safeParse({ recipeId: 123 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('recipeId'))).toBe(true);
    }
  });

  it('should accept alt when omitted', () => {
    const result = PhotoUploadSchema.safeParse({ recipeId: crypto.randomUUID() });
    expect(result.success).toBe(true);
  });

  it('should accept alt at max length (200 chars)', () => {
    const result = PhotoUploadSchema.safeParse({
      recipeId: crypto.randomUUID(),
      alt: 'a'.repeat(200),
    });
    expect(result.success).toBe(true);
  });

  it('should reject alt exceeding 200 chars', () => {
    const result = PhotoUploadSchema.safeParse({
      recipeId: crypto.randomUUID(),
      alt: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('alt'))).toBe(true);
    }
  });

  it('should reject an invalid uuid for recipeId', () => {
    const result = PhotoUploadSchema.safeParse({ recipeId: 'not-a-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('recipeId'))).toBe(true);
    }
  });

  it('should reject non-integer sortOrder', () => {
    const result = PhotoUploadSchema.safeParse({
      recipeId: crypto.randomUUID(),
      sortOrder: 1.5,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('sortOrder'))).toBe(true);
    }
  });

  it('should reject negative sortOrder', () => {
    const result = PhotoUploadSchema.safeParse({
      recipeId: crypto.randomUUID(),
      sortOrder: -1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('sortOrder'))).toBe(true);
    }
  });

  it('should reject non-number sortOrder', () => {
    const result = PhotoUploadSchema.safeParse({
      recipeId: crypto.randomUUID(),
      sortOrder: 'zero',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('sortOrder'))).toBe(true);
    }
  });
});
