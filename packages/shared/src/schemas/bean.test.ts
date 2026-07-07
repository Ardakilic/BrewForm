import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { BeanCreateSchema, BeanUpdateSchema } from './bean.ts';

describe('BeanCreateSchema', () => {
  it('should parse a valid input with only required fields', () => {
    const result = BeanCreateSchema.safeParse({ name: 'Ethiopia Yirgacheffe' });
    expect(result.success).toBe(true);
  });

  it('should parse a valid input with all optional fields', () => {
    const result = BeanCreateSchema.safeParse({
      name: 'Ethiopia Yirgacheffe',
      brand: 'Onyx',
      roaster: 'Onyx Coffee Lab',
      roastLevel: 'light',
      processing: 'washed',
      origin: 'Ethiopia',
      vendorId: crypto.randomUUID(),
    });
    expect(result.success).toBe(true);
  });

  it('should fail when required name is missing', () => {
    const result = BeanCreateSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });

  it('should fail when name is empty string', () => {
    const result = BeanCreateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });

  it('should fail when name is not a string', () => {
    const result = BeanCreateSchema.safeParse({ name: 123 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });

  it('should accept name at max length (200 chars)', () => {
    const result = BeanCreateSchema.safeParse({ name: 'a'.repeat(200) });
    expect(result.success).toBe(true);
  });

  it('should reject name exceeding 200 chars', () => {
    const result = BeanCreateSchema.safeParse({ name: 'a'.repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });

  it('should accept optional fields when omitted', () => {
    const result = BeanCreateSchema.safeParse({ name: 'Single Origin' });
    expect(result.success).toBe(true);
  });

  it('should reject brand exceeding 200 chars', () => {
    const result = BeanCreateSchema.safeParse({ name: 'Bean', brand: 'a'.repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('brand'))).toBe(true);
    }
  });

  it('should reject roaster exceeding 200 chars', () => {
    const result = BeanCreateSchema.safeParse({ name: 'Bean', roaster: 'a'.repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('roaster'))).toBe(true);
    }
  });

  it('should reject roastLevel exceeding 100 chars', () => {
    const result = BeanCreateSchema.safeParse({ name: 'Bean', roastLevel: 'a'.repeat(101) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('roastLevel'))).toBe(true);
    }
  });

  it('should reject processing exceeding 100 chars', () => {
    const result = BeanCreateSchema.safeParse({ name: 'Bean', processing: 'a'.repeat(101) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('processing'))).toBe(true);
    }
  });

  it('should reject origin exceeding 200 chars', () => {
    const result = BeanCreateSchema.safeParse({ name: 'Bean', origin: 'a'.repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('origin'))).toBe(true);
    }
  });

  it('should accept a valid uuid for vendorId', () => {
    const result = BeanCreateSchema.safeParse({ name: 'Bean', vendorId: crypto.randomUUID() });
    expect(result.success).toBe(true);
  });

  it('should reject an invalid uuid for vendorId', () => {
    const result = BeanCreateSchema.safeParse({ name: 'Bean', vendorId: 'not-a-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('vendorId'))).toBe(true);
    }
  });
});

describe('BeanUpdateSchema', () => {
  it('should accept a partial update with one field', () => {
    const result = BeanUpdateSchema.safeParse({ name: 'Updated Name' });
    expect(result.success).toBe(true);
  });

  it('should accept an empty object', () => {
    const result = BeanUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept a valid uuid for vendorId', () => {
    const result = BeanUpdateSchema.safeParse({ vendorId: crypto.randomUUID() });
    expect(result.success).toBe(true);
  });

  it('should reject an invalid uuid for vendorId', () => {
    const result = BeanUpdateSchema.safeParse({ vendorId: 'not-a-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('vendorId'))).toBe(true);
    }
  });

  it('should reject name exceeding 200 chars', () => {
    const result = BeanUpdateSchema.safeParse({ name: 'a'.repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });
});
