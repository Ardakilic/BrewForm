import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { BrewLogCreateSchema, BrewLogUpdateSchema } from './brew-log.ts';

const validCreate = {
  recipeId: crypto.randomUUID(),
  recipeVersionId: crypto.randomUUID(),
  brewedAt: '2024-06-01T08:30:00.000Z',
  yieldActual: 220.5,
  doseActual: 15,
  notes: 'Bright acidity, floral finish',
  personalRating: 8,
};

describe('BrewLogCreateSchema', () => {
  it('should validate a valid full brew log', () => {
    const result = BrewLogCreateSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
  });

  it('should reject missing recipeId', () => {
    const { recipeId: _recipeId, ...rest } = validCreate;
    const result = BrewLogCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('recipeId'))).toBe(true);
    }
  });

  it('should reject an empty object', () => {
    const result = BrewLogCreateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject personalRating above 10', () => {
    const result = BrewLogCreateSchema.safeParse({ ...validCreate, personalRating: 11 });
    expect(result.success).toBe(false);
  });

  it('should reject personalRating below 1', () => {
    const result = BrewLogCreateSchema.safeParse({ ...validCreate, personalRating: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject negative yieldActual', () => {
    const result = BrewLogCreateSchema.safeParse({ ...validCreate, yieldActual: -5 });
    expect(result.success).toBe(false);
  });

  it('should reject notes longer than 5000 characters', () => {
    const result = BrewLogCreateSchema.safeParse({ ...validCreate, notes: 'a'.repeat(5001) });
    expect(result.success).toBe(false);
  });

  it('should reject an invalid recipeId uuid', () => {
    const result = BrewLogCreateSchema.safeParse({ ...validCreate, recipeId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('should reject an invalid brewedAt datetime', () => {
    const result = BrewLogCreateSchema.safeParse({ ...validCreate, brewedAt: 'not-a-datetime' });
    expect(result.success).toBe(false);
  });
});

describe('BrewLogUpdateSchema', () => {
  it('should reject an empty object', () => {
    const result = BrewLogUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should accept nulling out notes and personalRating', () => {
    const result = BrewLogUpdateSchema.safeParse({ notes: null, personalRating: null });
    expect(result.success).toBe(true);
  });

  it('should accept a single-field update', () => {
    const result = BrewLogUpdateSchema.safeParse({ personalRating: 5 });
    expect(result.success).toBe(true);
  });

  it('should reject personalRating above 10', () => {
    const result = BrewLogUpdateSchema.safeParse({ personalRating: 11 });
    expect(result.success).toBe(false);
  });
});
