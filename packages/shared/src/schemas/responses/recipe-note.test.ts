import { describe, expect, it } from 'vitest';
import { RecipeUserNoteOutputSchema } from './recipe-note.ts';

/** Serialize like Hono's `c.json` (Dates become ISO strings). */
function wire<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}

describe('RecipeUserNoteOutputSchema', () => {
  it('parses a saved note and round-trips', () => {
    const payload = {
      recipeId: 'recipe-1',
      notes: 'Grind one step finer next time',
      updatedAt: new Date('2026-11-20T10:00:00.000Z'),
    };
    const result = RecipeUserNoteOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });

  it('parses the absent-note payload (notes and updatedAt null)', () => {
    const payload = { recipeId: 'recipe-1', notes: null, updatedAt: null };
    const result = RecipeUserNoteOutputSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(payload);
  });

  it('rejects a payload without recipeId', () => {
    expect(RecipeUserNoteOutputSchema.safeParse({ notes: null, updatedAt: null }).success).toBe(
      false,
    );
  });
});
