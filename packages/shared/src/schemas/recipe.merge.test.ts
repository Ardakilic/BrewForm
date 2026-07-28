import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { RecipeMergeSchema } from './recipe.ts';

describe('RecipeMergeSchema', () => {
  const validPayload = {
    recipeVersionId1: crypto.randomUUID(),
    recipeVersionId2: crypto.randomUUID(),
    title: 'Merged Recipe',
    selections: {
      brewMethod: 'v1' as const,
      drinkType: 'v2' as const,
      grindSize: 'v1' as const,
      groundWeightGrams: 'v2' as const,
      extractionTimeSeconds: 'v1' as const,
      extractionVolumeMl: 'v2' as const,
      temperatureCelsius: 'v1' as const,
      brewerDetails: 'v2' as const,
      grinder: 'v1' as const,
      preparationNotes: 'v2' as const,
      personalNotes: 'v1' as const,
      tasteNotes: 'both' as const,
      equipment: 'none' as const,
      additionalPreparations: 'v1' as const,
    },
  };

  it('validates a complete payload with all selections', () => {
    const result = RecipeMergeSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selections.brewMethod).toBe('v1');
      expect(result.data.selections.tasteNotes).toBe('both');
      expect(result.data.selections.equipment).toBe('none');
    }
  });

  it('validates a payload with empty selections', () => {
    const result = RecipeMergeSchema.safeParse({
      recipeVersionId1: crypto.randomUUID(),
      recipeVersionId2: crypto.randomUUID(),
      title: 'X',
      selections: {},
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID', () => {
    const result = RecipeMergeSchema.safeParse({
      recipeVersionId1: 'not-a-uuid',
      recipeVersionId2: crypto.randomUUID(),
      title: 'X',
      selections: {},
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('recipeVersionId1'))).toBe(true);
    }
  });

  it('rejects empty title', () => {
    const result = RecipeMergeSchema.safeParse({
      recipeVersionId1: crypto.randomUUID(),
      recipeVersionId2: crypto.randomUUID(),
      title: '',
      selections: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects title over 200 characters', () => {
    const result = RecipeMergeSchema.safeParse({
      recipeVersionId1: crypto.randomUUID(),
      recipeVersionId2: crypto.randomUUID(),
      title: 'a'.repeat(201),
      selections: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid selection enum value', () => {
    const result = RecipeMergeSchema.safeParse({
      recipeVersionId1: crypto.randomUUID(),
      recipeVersionId2: crypto.randomUUID(),
      title: 'X',
      selections: { brewMethod: 'v3' },
    });
    expect(result.success).toBe(false);
  });

  it("accepts 'both' and 'none' for array fields", () => {
    const result = RecipeMergeSchema.safeParse({
      recipeVersionId1: crypto.randomUUID(),
      recipeVersionId2: crypto.randomUUID(),
      title: 'X',
      selections: { tasteNotes: 'both', equipment: 'none', additionalPreparations: 'both' },
    });
    expect(result.success).toBe(true);
  });

  it("rejects 'both' for scalar fields", () => {
    const result = RecipeMergeSchema.safeParse({
      recipeVersionId1: crypto.randomUUID(),
      recipeVersionId2: crypto.randomUUID(),
      title: 'X',
      selections: { brewMethod: 'both' },
    });
    expect(result.success).toBe(false);
  });

  it('defaults selections to empty object when omitted', () => {
    const result = RecipeMergeSchema.safeParse({
      recipeVersionId1: crypto.randomUUID(),
      recipeVersionId2: crypto.randomUUID(),
      title: 'X',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selections).toEqual({});
    }
  });

  it('rejects self-merge (same version ID twice)', () => {
    const id = crypto.randomUUID();
    const result = RecipeMergeSchema.safeParse({
      recipeVersionId1: id,
      recipeVersionId2: id,
      title: 'X',
      selections: {},
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('recipeVersionId2'))).toBe(true);
    }
  });
});
