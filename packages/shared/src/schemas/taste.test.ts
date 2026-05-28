import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { TasteNoteCreateSchema, TasteNoteFilterSchema, TasteNoteUpdateSchema } from './taste.ts';

describe('TasteNoteCreateSchema', () => {
  it('should validate valid data', () => {
    const result = TasteNoteCreateSchema.safeParse({
      name: 'Chocolate',
      depth: 1,
    });
    expect(result.success).toBe(true);
  });

  it('should validate with all optional fields', () => {
    const result = TasteNoteCreateSchema.safeParse({
      name: 'Dark Chocolate',
      parentId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      color: '#3c1a00',
      definition: 'A rich dark chocolate flavor note.',
      depth: 2,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Dark Chocolate');
      expect(result.data.color).toBe('#3c1a00');
    }
  });

  it('should reject empty name', () => {
    const result = TasteNoteCreateSchema.safeParse({
      name: '',
      depth: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });

  it('should reject missing name', () => {
    const result = TasteNoteCreateSchema.safeParse({
      depth: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });

  it('should accept optional parentId', () => {
    const result = TasteNoteCreateSchema.safeParse({
      name: 'Fruity',
      parentId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      depth: 0,
    });
    expect(result.success).toBe(true);
  });

  it('should accept optional color', () => {
    const result = TasteNoteCreateSchema.safeParse({
      name: 'Caramel',
      color: '#c68a00',
      depth: 1,
    });
    expect(result.success).toBe(true);
  });

  it('should reject color exceeding 7 chars', () => {
    const result = TasteNoteCreateSchema.safeParse({
      name: 'Caramel',
      color: '#12345678',
      depth: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('color'))).toBe(true);
    }
  });

  it('should accept optional definition', () => {
    const result = TasteNoteCreateSchema.safeParse({
      name: 'Acidity',
      definition: 'A bright citrus-like acidity.',
      depth: 1,
    });
    expect(result.success).toBe(true);
  });

  it('should reject definition exceeding 2000 chars', () => {
    const result = TasteNoteCreateSchema.safeParse({
      name: 'Test',
      definition: 'a'.repeat(2001),
      depth: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('definition'))).toBe(true);
    }
  });

  it('should reject name exceeding 200 chars', () => {
    const result = TasteNoteCreateSchema.safeParse({
      name: 'a'.repeat(201),
      depth: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });

  it('should reject missing depth', () => {
    const result = TasteNoteCreateSchema.safeParse({
      name: 'Chocolate',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('depth'))).toBe(true);
    }
  });

  it('should reject invalid depth (negative)', () => {
    const result = TasteNoteCreateSchema.safeParse({
      name: 'Test',
      depth: -1,
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid depth (>2)', () => {
    const result = TasteNoteCreateSchema.safeParse({
      name: 'Test',
      depth: 3,
    });
    expect(result.success).toBe(false);
  });
});

describe('TasteNoteFilterSchema', () => {
  it('should accept empty object', () => {
    const result = TasteNoteFilterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept valid search query', () => {
    const result = TasteNoteFilterSchema.safeParse({
      search: 'choc',
    });
    expect(result.success).toBe(true);
  });

  it('should reject search shorter than 3 chars', () => {
    const result = TasteNoteFilterSchema.safeParse({
      search: 'ch',
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid depth filter', () => {
    for (const depth of ['0', '1', '2'] as const) {
      const result = TasteNoteFilterSchema.safeParse({ depth });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid depth value', () => {
    const result = TasteNoteFilterSchema.safeParse({ depth: '3' });
    expect(result.success).toBe(false);
  });
});

describe('TasteNoteUpdateSchema', () => {
  it('should accept partial updates', () => {
    const result = TasteNoteUpdateSchema.safeParse({
      name: 'Updated Note',
    });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = TasteNoteUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
