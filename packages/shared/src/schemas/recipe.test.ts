import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { RecipeCreateSchema, RecipeFilterSchema, RecipeUpdateSchema } from './recipe.ts';

describe('RecipeCreateSchema', () => {
  it('should validate a complete recipe', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'My Espresso',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      groundWeightGrams: 18,
      extractionVolumeMl: 36,
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing required fields', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Missing brew method',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('brewMethod'))).toBe(true);
      expect(result.error.issues.some((i) => i.path.includes('drinkType'))).toBe(true);
    }
  });

  it('should reject grind date before roast date', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Bad dates',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      roastDate: '2026-04-10',
      grindDate: '2026-04-05',
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid visibility values', () => {
    for (const visibility of ['draft', 'private', 'unlisted', 'public'] as const) {
      const result = RecipeCreateSchema.safeParse({
        title: 'Test',
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
        visibility,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid brew method', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Bad method',
      brewMethod: 'invalid_method',
      drinkType: 'espresso',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid drink type', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Bad drink',
      brewMethod: 'espresso_machine',
      drinkType: 'invalid_drink',
    });
    expect(result.success).toBe(false);
  });

  it('should default visibility to draft', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Default visibility',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visibility).toBe('draft');
    }
  });

  it('should default isFavourite to false', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Test',
      brewMethod: 'v60',
      drinkType: 'pour_over',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isFavourite).toBe(false);
    }
  });

  it('should accept optional additional preparations', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'With prep',
      brewMethod: 'espresso_machine',
      drinkType: 'latte',
      additionalPreparations: [
        { name: 'Steamed Milk', type: 'milk', inputAmount: '60ml', preparationType: 'milk' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should reject rating outside 1-10 range', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Bad rating',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      rating: 15,
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid emoji tag keys', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Tagged',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      emojiTag: 'fire',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid emoji tags', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Bad tag',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      emojiTag: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});

describe('RecipeUpdateSchema', () => {
  it('should accept partial updates', () => {
    const result = RecipeUpdateSchema.safeParse({
      title: 'Updated Title',
    });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = RecipeUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept bumpVersion flag', () => {
    const result = RecipeUpdateSchema.safeParse({
      title: 'Updated',
      bumpVersion: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('RecipeFilterSchema', () => {
  it('should apply defaults', () => {
    const result = RecipeFilterSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.perPage).toBe(20);
      expect(result.data.sortBy).toBe('createdAt');
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('should accept valid filter values', () => {
    const result = RecipeFilterSchema.safeParse({
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      visibility: 'public',
      page: 2,
      perPage: 10,
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid sort fields', () => {
    const result = RecipeFilterSchema.safeParse({
      sortBy: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});