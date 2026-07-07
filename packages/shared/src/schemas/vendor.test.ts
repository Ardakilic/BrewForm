import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { VendorCreateSchema, VendorUpdateSchema } from './vendor.ts';

describe('VendorCreateSchema', () => {
  it('should parse a valid input with only required fields', () => {
    const result = VendorCreateSchema.safeParse({ name: 'Onyx Coffee Lab' });
    expect(result.success).toBe(true);
  });

  it('should parse a valid input with all optional fields', () => {
    const result = VendorCreateSchema.safeParse({
      name: 'Onyx Coffee Lab',
      website: 'https://onyxcoffeelab.com',
      description: 'Specialty coffee roaster based in Arkansas',
    });
    expect(result.success).toBe(true);
  });

  it('should fail when required name is missing', () => {
    const result = VendorCreateSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });

  it('should fail when name is empty string', () => {
    const result = VendorCreateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });

  it('should fail when name is not a string', () => {
    const result = VendorCreateSchema.safeParse({ name: 123 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });

  it('should accept name at max length (200 chars)', () => {
    const result = VendorCreateSchema.safeParse({ name: 'a'.repeat(200) });
    expect(result.success).toBe(true);
  });

  it('should reject name exceeding 200 chars', () => {
    const result = VendorCreateSchema.safeParse({ name: 'a'.repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });

  it('should accept optional fields when omitted', () => {
    const result = VendorCreateSchema.safeParse({ name: 'Minimal Vendor' });
    expect(result.success).toBe(true);
  });

  it('should accept an empty string for website', () => {
    const result = VendorCreateSchema.safeParse({ name: 'Vendor', website: '' });
    expect(result.success).toBe(true);
  });

  it('should reject an invalid url for website', () => {
    const result = VendorCreateSchema.safeParse({ name: 'Vendor', website: 'not-a-url' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('website'))).toBe(true);
    }
  });

  it('should reject description exceeding 1000 chars', () => {
    const result = VendorCreateSchema.safeParse({ name: 'Vendor', description: 'a'.repeat(1001) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('description'))).toBe(true);
    }
  });

  it('should accept description at max length (1000 chars)', () => {
    const result = VendorCreateSchema.safeParse({ name: 'Vendor', description: 'a'.repeat(1000) });
    expect(result.success).toBe(true);
  });
});

describe('VendorUpdateSchema', () => {
  it('should accept a partial update with one field', () => {
    const result = VendorUpdateSchema.safeParse({ name: 'Updated Vendor' });
    expect(result.success).toBe(true);
  });

  it('should accept an empty object', () => {
    const result = VendorUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept an empty string for website', () => {
    const result = VendorUpdateSchema.safeParse({ website: '' });
    expect(result.success).toBe(true);
  });

  it('should reject an invalid url for website', () => {
    const result = VendorUpdateSchema.safeParse({ website: 'not-a-url' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('website'))).toBe(true);
    }
  });

  it('should reject name exceeding 200 chars', () => {
    const result = VendorUpdateSchema.safeParse({ name: 'a'.repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });
});
