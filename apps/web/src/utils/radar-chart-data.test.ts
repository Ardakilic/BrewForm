/**
 * Tests for radar-chart-data utility
 *
 * Feature: recipe-detail-redesign
 * Property 7: Radar chart category aggregation
 *
 * **Validates: Requirements 8.1, 8.2**
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  aggregateByCategory,
  mapToScaaCategory,
  resolveRootCategory,
  SCAA_CATEGORIES,
  type TasteNoteForChart,
} from './radar-chart-data';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal TasteNoteForChart with the given category and intensity. */
function makeNote(
  rootCategoryName: string,
  intensity: number,
  id = 'note-1',
): TasteNoteForChart {
  return {
    tasteNoteId: id,
    intensity,
    name: rootCategoryName,
    parentId: null,
    depth: 0,
    rootCategoryName,
  };
}

// ---------------------------------------------------------------------------
// Unit tests — mapToScaaCategory
// ---------------------------------------------------------------------------

describe('mapToScaaCategory — unit tests', () => {
  it('"Floral" → "Floral"', () => {
    expect(mapToScaaCategory('Floral')).toBe('Floral');
  });

  it('"fruity" (lowercase) → "Fruity"', () => {
    expect(mapToScaaCategory('fruity')).toBe('Fruity');
  });

  it('"Nutty" → "Nutty/Cocoa"', () => {
    expect(mapToScaaCategory('Nutty')).toBe('Nutty/Cocoa');
  });

  it('"Cocoa" → "Nutty/Cocoa"', () => {
    expect(mapToScaaCategory('Cocoa')).toBe('Nutty/Cocoa');
  });

  it('"unknown" → "Other"', () => {
    expect(mapToScaaCategory('unknown')).toBe('Other');
  });
});

// ---------------------------------------------------------------------------
// Unit tests — aggregateByCategory
// ---------------------------------------------------------------------------

describe('aggregateByCategory — unit tests', () => {
  it('single note: Floral intensity=2 → Floral=2, all others=0', () => {
    const result = aggregateByCategory([makeNote('Floral', 2)]);

    expect(result['Floral']).toBe(2);
    for (const cat of SCAA_CATEGORIES) {
      if (cat !== 'Floral') {
        expect(result[cat]).toBe(0);
      }
    }
  });

  it('two notes in Fruity with intensities 1 and 3 → Fruity=4', () => {
    const notes = [
      makeNote('Fruity', 1, 'note-1'),
      makeNote('Fruity', 3, 'note-2'),
    ];
    const result = aggregateByCategory(notes);

    expect(result['Fruity']).toBe(4);
  });

  it('notes spanning all 7 categories → correct sums per category', () => {
    const notes: TasteNoteForChart[] = [
      makeNote('Floral', 1, 'n1'),
      makeNote('Fruity', 2, 'n2'),
      makeNote('Sweet', 3, 'n3'),
      makeNote('Nutty/Cocoa', 1, 'n4'),
      makeNote('Spices', 2, 'n5'),
      makeNote('Roasted', 3, 'n6'),
      makeNote('Other', 1, 'n7'),
    ];
    const result = aggregateByCategory(notes);

    expect(result['Floral']).toBe(1);
    expect(result['Fruity']).toBe(2);
    expect(result['Sweet']).toBe(3);
    expect(result['Nutty/Cocoa']).toBe(1);
    expect(result['Spices']).toBe(2);
    expect(result['Roasted']).toBe(3);
    expect(result['Other']).toBe(1);
  });

  it('empty array → all 7 categories=0', () => {
    const result = aggregateByCategory([]);

    expect(Object.keys(result)).toHaveLength(7);
    for (const cat of SCAA_CATEGORIES) {
      expect(result[cat]).toBe(0);
    }
  });

  it('always returns all 7 SCAA_CATEGORIES as keys', () => {
    const result = aggregateByCategory([makeNote('Floral', 1)]);

    expect(Object.keys(result)).toHaveLength(7);
    for (const cat of SCAA_CATEGORIES) {
      expect(Object.keys(result)).toContain(cat);
    }
  });
});

// ---------------------------------------------------------------------------
// Unit tests — resolveRootCategory
// ---------------------------------------------------------------------------

describe('resolveRootCategory — unit tests', () => {
  const allNotes = [
    { id: 'root-1', name: 'Floral', parentId: null, depth: 0 },
    { id: 'child-1', name: 'Rose', parentId: 'root-1', depth: 1 },
    { id: 'grandchild-1', name: 'Rose Hip', parentId: 'child-1', depth: 2 },
  ];

  it('depth-0 note returns its own name', () => {
    expect(resolveRootCategory('root-1', allNotes)).toBe('Floral');
  });

  it('depth-1 note returns parent name', () => {
    expect(resolveRootCategory('child-1', allNotes)).toBe('Floral');
  });

  it('depth-2 note returns grandparent name', () => {
    expect(resolveRootCategory('grandchild-1', allNotes)).toBe('Floral');
  });

  it('unknown noteId returns null', () => {
    expect(resolveRootCategory('does-not-exist', allNotes)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Arbitrary generator for taste notes
// ---------------------------------------------------------------------------

const tasteNoteArbitrary = fc.record({
  tasteNoteId: fc.uuid(),
  intensity: fc.integer({ min: 1, max: 3 }),
  name: fc.string(),
  parentId: fc.constant(null),
  depth: fc.constant(0),
  rootCategoryName: fc.constantFrom(...SCAA_CATEGORIES),
});

// ---------------------------------------------------------------------------
// Property-Based Tests
// ---------------------------------------------------------------------------

describe('aggregateByCategory — Property 7: Radar chart category aggregation', () => {
  /**
   * **Validates: Requirements 8.1, 8.2**
   *
   * For any array of notes with valid intensities (1-3),
   * aggregateByCategory always returns exactly 7 keys.
   */
  it('always returns exactly 7 keys for any input', () => {
    fc.assert(
      fc.property(
        fc.array(tasteNoteArbitrary, { minLength: 0, maxLength: 30 }),
        (notes) => {
          const result = aggregateByCategory(notes);
          const keys = Object.keys(result);

          expect(keys).toHaveLength(7);
          for (const cat of SCAA_CATEGORIES) {
            expect(keys).toContain(cat);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.1, 8.2**
   *
   * Sum of all category values equals sum of all note intensities.
   */
  it('sum of all category values equals sum of all note intensities', () => {
    fc.assert(
      fc.property(
        fc.array(tasteNoteArbitrary, { minLength: 0, maxLength: 30 }),
        (notes) => {
          const result = aggregateByCategory(notes);

          const totalCategorySum = SCAA_CATEGORIES.reduce(
            (acc, cat) => acc + result[cat],
            0,
          );
          const totalIntensitySum = notes.reduce(
            (acc, note) => acc + note.intensity,
            0,
          );

          expect(totalCategorySum).toBe(totalIntensitySum);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.1, 8.2**
   *
   * All category values are non-negative.
   */
  it('all category values are non-negative', () => {
    fc.assert(
      fc.property(
        fc.array(tasteNoteArbitrary, { minLength: 0, maxLength: 30 }),
        (notes) => {
          const result = aggregateByCategory(notes);

          for (const cat of SCAA_CATEGORIES) {
            expect(result[cat]).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
