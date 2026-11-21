import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { COFFEE_VARIETY_CATEGORY_VALUES } from '../constants/coffee-variety.ts';
import {
  CoffeeVarietyCreateSchema,
  CoffeeVarietyFilterSchema,
  CoffeeVarietyUpdateSchema,
} from './coffee-variety.ts';

describe('CoffeeVarietyCreateSchema', () => {
  it('should accept a valid coffee variety', () => {
    const result = CoffeeVarietyCreateSchema.safeParse({
      name: 'Arabica Bourbon',
      category: 'variety',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty name', () => {
    const result = CoffeeVarietyCreateSchema.safeParse({
      name: '',
      category: 'variety',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid category', () => {
    const result = CoffeeVarietyCreateSchema.safeParse({
      name: 'Test',
      category: 'invalid_category',
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid categories', () => {
    for (const category of COFFEE_VARIETY_CATEGORY_VALUES) {
      const result = CoffeeVarietyCreateSchema.safeParse({
        name: `Test ${category}`,
        category,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept all optional fields', () => {
    const result = CoffeeVarietyCreateSchema.safeParse({
      name: 'Arabica',
      category: 'variety',
      species: 'Coffea arabica',
      origin: 'Ethiopia',
      spread: 'Worldwide',
      altitudeRangeM: '1200-2000m',
      cupProfile: 'Bright, fruity',
      body: 'Medium',
      acidity: 'High',
      caffeinePct: '0.8-1.4%',
      processingCompatibility: ['washed', 'natural', 'honey'],
      diseaseResistance: 'Moderate',
      yield: 'High',
      plantSize: 'Medium',
      notes: 'Most popular arabica variety',
      subVarieties: ['Typica', 'Bourbon', 'Caturra'],
    });
    expect(result.success).toBe(true);
  });

  it('should accept market_name category with typeLabel', () => {
    const result = CoffeeVarietyCreateSchema.safeParse({
      name: 'Special Blend',
      category: 'market_name',
      typeLabel: 'Blend',
      origin: 'Brazil',
    });
    expect(result.success).toBe(true);
  });

  it('should accept processing category with fermentation fields', () => {
    const result = CoffeeVarietyCreateSchema.safeParse({
      name: 'Natural Process',
      category: 'processing',
      fermentation: 'Dry fermentation',
      dryingTimeDays: '15-30',
      dryingMethod: 'Sun dried on raised beds',
    });
    expect(result.success).toBe(true);
  });

  it('should reject name exceeding 255 chars', () => {
    const result = CoffeeVarietyCreateSchema.safeParse({
      name: 'a'.repeat(256),
      category: 'variety',
    });
    expect(result.success).toBe(false);
  });
});

describe('CoffeeVarietyUpdateSchema', () => {
  it('should accept partial updates', () => {
    const result = CoffeeVarietyUpdateSchema.safeParse({
      name: 'Updated Name',
    });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = CoffeeVarietyUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should reject invalid category in update', () => {
    const result = CoffeeVarietyUpdateSchema.safeParse({
      category: 'invalid_category',
    });
    expect(result.success).toBe(false);
  });
});

describe('CoffeeVarietyFilterSchema', () => {
  it('should have default page of 1 and perPage of 20', () => {
    const result = CoffeeVarietyFilterSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.perPage).toBe(20);
  });

  it('should accept category filter', () => {
    const result = CoffeeVarietyFilterSchema.parse({ category: 'variety' });
    expect(result.category).toBe('variety');
  });

  it('should accept search filter', () => {
    const result = CoffeeVarietyFilterSchema.parse({ search: 'arabica' });
    expect(result.search).toBe('arabica');
  });

  it('should accept both category and search filters', () => {
    const result = CoffeeVarietyFilterSchema.parse({
      category: 'variety',
      search: 'bourbon',
    });
    expect(result.category).toBe('variety');
    expect(result.search).toBe('bourbon');
  });

  it('should reject search longer than 200 chars', () => {
    const result = CoffeeVarietyFilterSchema.safeParse({
      search: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('should accept custom page and perPage', () => {
    const result = CoffeeVarietyFilterSchema.parse({ page: '3', perPage: '50' });
    expect(result.page).toBe(3);
    expect(result.perPage).toBe(50);
  });

  it('should reject invalid category in filter', () => {
    const result = CoffeeVarietyFilterSchema.safeParse({
      category: 'invalid_category',
    });
    expect(result.success).toBe(false);
  });

  it('should reject perPage over 100', () => {
    const result = CoffeeVarietyFilterSchema.safeParse({
      perPage: '101',
    });
    expect(result.success).toBe(false);
  });
});

describe('Coffee-variety list fields are bounded (coffee-variety-write)', () => {
  const base = { name: 'Bounded', category: 'variety' as const };

  it('rejects a list item longer than 100 characters', () => {
    const result = CoffeeVarietyCreateSchema.safeParse({
      ...base,
      notableFarms: ['x'.repeat(101)],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual(['notableFarms', 0]);
    }
  });

  it('accepts a 100-character item', () => {
    const result = CoffeeVarietyCreateSchema.safeParse({
      ...base,
      notableFarms: ['x'.repeat(100)],
    });
    expect(result.success).toBe(true);
  });

  it('rejects 21 items and accepts 20', () => {
    const items = (count: number) => Array.from({ length: count }, (_, i) => `Process ${i}`);
    expect(
      CoffeeVarietyCreateSchema.safeParse({ ...base, processingCompatibility: items(21) }).success,
    ).toBe(false);
    expect(
      CoffeeVarietyCreateSchema.safeParse({ ...base, processingCompatibility: items(20) }).success,
    ).toBe(true);
  });

  it.each([[['']], [['   ']]])('rejects the empty item list %j', (subVarieties) => {
    expect(CoffeeVarietyCreateSchema.safeParse({ ...base, subVarieties }).success).toBe(false);
  });

  it('trims items', () => {
    const result = CoffeeVarietyCreateSchema.parse({
      ...base,
      processingCompatibility: [' Washed '],
    });
    expect(result.processingCompatibility).toEqual(['Washed']);
  });

  it('accepts the widest seed list (7 notable regions)', () => {
    const notableRegions = ['Yirgacheffe', 'Sidamo', 'Guji', 'Harrar', 'Limu', 'Jimma', 'Kaffa'];
    expect(CoffeeVarietyCreateSchema.safeParse({ ...base, notableRegions }).success).toBe(true);
  });

  it('applies the same bounds to the update schema', () => {
    const regionalVariants = Array.from({ length: 21 }, (_, i) => `Variant ${i}`);
    expect(CoffeeVarietyUpdateSchema.safeParse({ regionalVariants }).success).toBe(false);
    expect(CoffeeVarietyUpdateSchema.safeParse({ notableFarms: ['x'.repeat(101)] }).success).toBe(
      false,
    );
  });

  it('documents maxItems and item maxLength in the JSON Schema', () => {
    const json = z.toJSONSchema(CoffeeVarietyCreateSchema) as {
      properties: Record<string, { maxItems?: number; items?: { maxLength?: number } }>;
    };
    expect(json.properties.regionalVariants.maxItems).toBe(20);
    expect(json.properties.regionalVariants.items?.maxLength).toBe(100);
  });
});
