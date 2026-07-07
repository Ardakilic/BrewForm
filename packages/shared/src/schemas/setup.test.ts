import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { SetupCreateSchema, SetupUpdateSchema } from './setup.ts';

describe('SetupCreateSchema', () => {
  it('should parse a valid input with only required fields (isDefault defaults to false)', () => {
    const result = SetupCreateSchema.safeParse({ name: 'My Espresso Setup' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isDefault).toBe(false);
    }
  });

  it('should parse a valid input with all optional fields', () => {
    const result = SetupCreateSchema.safeParse({
      name: 'My Espresso Setup',
      brewerDetails: 'La Marzocco Linea Mini',
      grinder: 'Weber EG-1',
      portafilterId: crypto.randomUUID(),
      basketId: crypto.randomUUID(),
      puckScreenId: crypto.randomUUID(),
      paperFilterId: crypto.randomUUID(),
      tamperId: crypto.randomUUID(),
      isDefault: true,
    });
    expect(result.success).toBe(true);
  });

  it('should fail when required name is missing', () => {
    const result = SetupCreateSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });

  it('should fail when name is empty string', () => {
    const result = SetupCreateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });

  it('should fail when name is not a string', () => {
    const result = SetupCreateSchema.safeParse({ name: 123 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });

  it('should accept name at max length (100 chars)', () => {
    const result = SetupCreateSchema.safeParse({ name: 'a'.repeat(100) });
    expect(result.success).toBe(true);
  });

  it('should reject name exceeding 100 chars', () => {
    const result = SetupCreateSchema.safeParse({ name: 'a'.repeat(101) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });

  it('should accept optional fields when omitted', () => {
    const result = SetupCreateSchema.safeParse({ name: 'Minimal Setup' });
    expect(result.success).toBe(true);
  });

  it('should reject brewerDetails exceeding 200 chars', () => {
    const result = SetupCreateSchema.safeParse({ name: 'Setup', brewerDetails: 'a'.repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('brewerDetails'))).toBe(true);
    }
  });

  it('should reject grinder exceeding 200 chars', () => {
    const result = SetupCreateSchema.safeParse({ name: 'Setup', grinder: 'a'.repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('grinder'))).toBe(true);
    }
  });

  it('should reject non-boolean isDefault', () => {
    const result = SetupCreateSchema.safeParse({ name: 'Setup', isDefault: 'yes' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('isDefault'))).toBe(true);
    }
  });

  it('should accept a valid uuid for portafilterId', () => {
    const result = SetupCreateSchema.safeParse({
      name: 'Setup',
      portafilterId: crypto.randomUUID(),
    });
    expect(result.success).toBe(true);
  });

  it('should reject an invalid uuid for portafilterId', () => {
    const result = SetupCreateSchema.safeParse({ name: 'Setup', portafilterId: 'not-a-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('portafilterId'))).toBe(true);
    }
  });

  it('should reject an invalid uuid for basketId', () => {
    const result = SetupCreateSchema.safeParse({ name: 'Setup', basketId: 'not-a-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('basketId'))).toBe(true);
    }
  });

  it('should reject an invalid uuid for puckScreenId', () => {
    const result = SetupCreateSchema.safeParse({ name: 'Setup', puckScreenId: 'not-a-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('puckScreenId'))).toBe(true);
    }
  });

  it('should reject an invalid uuid for paperFilterId', () => {
    const result = SetupCreateSchema.safeParse({ name: 'Setup', paperFilterId: 'not-a-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('paperFilterId'))).toBe(true);
    }
  });

  it('should reject an invalid uuid for tamperId', () => {
    const result = SetupCreateSchema.safeParse({ name: 'Setup', tamperId: 'not-a-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('tamperId'))).toBe(true);
    }
  });
});

describe('SetupUpdateSchema', () => {
  it('should accept a partial update with one field', () => {
    const result = SetupUpdateSchema.safeParse({ name: 'Updated Setup' });
    expect(result.success).toBe(true);
  });

  it('should accept an empty object', () => {
    const result = SetupUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept a valid uuid for portafilterId', () => {
    const result = SetupUpdateSchema.safeParse({ portafilterId: crypto.randomUUID() });
    expect(result.success).toBe(true);
  });

  it('should reject an invalid uuid for portafilterId', () => {
    const result = SetupUpdateSchema.safeParse({ portafilterId: 'not-a-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('portafilterId'))).toBe(true);
    }
  });

  it('should reject name exceeding 100 chars', () => {
    const result = SetupUpdateSchema.safeParse({ name: 'a'.repeat(101) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });
});
