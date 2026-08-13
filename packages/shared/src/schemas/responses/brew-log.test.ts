import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  BrewLogListItemOutputSchema,
  BrewLogOutputSchema,
  RecipeBrewStatsOutputSchema,
  UserBrewStatsOutputSchema,
} from './brew-log.ts';

const brewLogRow = {
  id: 'log-1',
  userId: 'user-1',
  recipeId: 'recipe-1',
  recipeVersionId: 'version-1',
  brewedAt: '2024-06-01T08:30:00.000Z',
  yieldActual: 220.5,
  doseActual: 15,
  notes: 'Bright acidity, floral finish',
  personalRating: 8,
  createdAt: '2024-06-01T08:30:00.000Z',
  updatedAt: '2024-06-01T08:30:00.000Z',
};

describe('BrewLogOutputSchema', () => {
  it('parses a brew-log row and round-trips', () => {
    const result = BrewLogOutputSchema.safeParse(brewLogRow);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(brewLogRow);
  });

  it('accepts null for nullable fields', () => {
    const payload = {
      ...brewLogRow,
      recipeVersionId: null,
      yieldActual: null,
      doseActual: null,
      notes: null,
      personalRating: null,
    };
    const result = BrewLogOutputSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(payload);
  });

  it('rejects a non-number yieldActual', () => {
    const result = BrewLogOutputSchema.safeParse({ ...brewLogRow, yieldActual: '220' });
    expect(result.success).toBe(false);
  });

  it('rejects a row missing brewedAt', () => {
    const { brewedAt: _brewedAt, ...rest } = brewLogRow;
    const result = BrewLogOutputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe('BrewLogListItemOutputSchema', () => {
  it('parses a list item with recipeTitle and recipeSlug and round-trips', () => {
    const payload = { ...brewLogRow, recipeTitle: 'My V60', recipeSlug: 'my-v60' };
    const result = BrewLogListItemOutputSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(payload);
  });

  it('rejects a list item missing recipeTitle', () => {
    const payload = { ...brewLogRow, recipeSlug: 'my-v60' };
    const result = BrewLogListItemOutputSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe('UserBrewStatsOutputSchema', () => {
  it('parses valid stats and round-trips', () => {
    const payload = {
      totalBrews: 42,
      last30Days: 7,
      distinctRecipeCount: 5,
      firstBrewedAt: '2024-01-01T00:00:00.000Z',
      lastBrewedAt: '2024-06-01T08:30:00.000Z',
    };
    const result = UserBrewStatsOutputSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(payload);
  });

  it('accepts null brewedAt bounds when the user has no brews', () => {
    const payload = {
      totalBrews: 0,
      last30Days: 0,
      distinctRecipeCount: 0,
      firstBrewedAt: null,
      lastBrewedAt: null,
    };
    const result = UserBrewStatsOutputSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('rejects a non-integer totalBrews', () => {
    const payload = {
      totalBrews: 1.5,
      last30Days: 0,
      distinctRecipeCount: 0,
      firstBrewedAt: null,
      lastBrewedAt: null,
    };
    const result = UserBrewStatsOutputSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe('RecipeBrewStatsOutputSchema', () => {
  it('parses valid per-recipe stats and round-trips', () => {
    const payload = { recipeId: 'recipe-1', brewCount: 3, avgBrewRating: 7.5 };
    const result = RecipeBrewStatsOutputSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(payload);
  });

  it('accepts null avgBrewRating when no rated brews exist', () => {
    const payload = { recipeId: 'recipe-1', brewCount: 2, avgBrewRating: null };
    const result = RecipeBrewStatsOutputSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('rejects a non-number avgBrewRating', () => {
    const payload = { recipeId: 'recipe-1', brewCount: 2, avgBrewRating: 'high' };
    const result = RecipeBrewStatsOutputSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
