import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import fc from 'npm:fast-check';
import {
  RecipeCreateObjectSchema,
  RecipeCreateSchema,
  RecipeFilterSchema,
  RecipeForkSchema,
  RecipeNotesSchema,
  RecipeRateSchema,
  RecipeUpdateSchema,
} from './recipe.ts';

describe('RecipeCreateSchema', () => {
  it('should validate a complete recipe', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'My Espresso',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      preparationNotes: 'Test notes',
      groundWeightGrams: 18,
      extractionVolumeMl: 36,
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing required fields', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Missing brew method',
      preparationNotes: 'Test notes',
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
      preparationNotes: 'Test notes',
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
        preparationNotes: 'Test notes',
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid brew method', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Bad method',
      brewMethod: 'invalid_method',
      drinkType: 'espresso',
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid drink type', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Bad drink',
      brewMethod: 'espresso_machine',
      drinkType: 'invalid_drink',
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(false);
  });

  it('should default visibility to draft', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Default visibility',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      preparationNotes: 'Test notes',
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
      preparationNotes: 'Test notes',
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
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(true);
  });

  it('should reject rating outside 1-10 range', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Bad rating',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      rating: 15,
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid emoji tag keys', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Tagged',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      emojiTag: 'fire',
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid emoji tags', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Bad tag',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      emojiTag: 'invalid',
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(false);
  });
});

describe('preparationNotes validation', () => {
  it('should reject missing preparationNotes', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Missing prep notes',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('preparationNotes'))).toBe(true);
    }
  });

  it('should reject empty preparationNotes', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Empty prep notes',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      preparationNotes: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('preparationNotes'))).toBe(true);
    }
  });

  it('should accept preparationNotes up to 10000 chars', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Long prep notes',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      preparationNotes: 'a'.repeat(10000),
    });
    expect(result.success).toBe(true);
  });

  it('should reject preparationNotes over 10000 chars', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Too long prep notes',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      preparationNotes: 'a'.repeat(10001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('preparationNotes'))).toBe(true);
    }
  });

  it('should allow optional preparationNotes in RecipeUpdateSchema', () => {
    const result = RecipeUpdateSchema.safeParse({
      title: 'Updated',
    });
    expect(result.success).toBe(true);
  });

  it('should validate preparationNotes when provided in RecipeUpdateSchema', () => {
    const result = RecipeUpdateSchema.safeParse({
      title: 'Updated',
      preparationNotes: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('preparationNotes'))).toBe(true);
    }
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

/**
 * Bug Condition Exploration Test — Missing Date Ordering Validation
 *
 * Property 1: Bug Condition
 *
 * This test MUST FAIL on unfixed code — failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 *
 * GOAL: Surface counterexamples that demonstrate the two missing .refine()
 * rules in RecipeCreateSchema:
 *   - Case A: packageOpenDate < roastDate → currently accepted (bug)
 *   - Case B: grindDate < packageOpenDate → currently accepted (bug)
 *
 * Validates: Requirements 2.4, 2.5
 */
describe('RecipeFilterSchema.tasteNoteIds', () => {
  it('PBT: for any array of 1–10 valid UUIDs, comma-separated string is accepted', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
        (ids) => {
          const result = RecipeFilterSchema.safeParse({
            tasteNoteIds: ids.join(','),
          });
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('PBT: for any array of >10 valid UUIDs, comma-separated string is rejected', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 11, maxLength: 20 }),
        (ids) => {
          const result = RecipeFilterSchema.safeParse({
            tasteNoteIds: ids.join(','),
          });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('PBT: for any string containing a non-UUID segment, parsing is rejected', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.array(fc.uuid(), { minLength: 0, maxLength: 4 }),
          fc.string({ minLength: 1, maxLength: 5 }),
          fc.array(fc.uuid(), { minLength: 0, maxLength: 4 }),
        ),
        ([before, invalid, after]) => {
          const parts = [...before, invalid, ...after];
          const result = RecipeFilterSchema.safeParse({
            tasteNoteIds: parts.join(','),
          });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Bug Condition exploration', () => {
  // ---------------------------------------------------------------------------
  // Concrete unit tests
  // ---------------------------------------------------------------------------

  /**
   * Concrete test — Case A:
   * packageOpenDate ('2026-04-05') < roastDate ('2026-04-10') should be rejected.
   * Currently returns success: true (bug).
   *
   * Counterexample: { roastDate: '2026-04-10', packageOpenDate: '2026-04-05' }
   * returns success: true instead of success: false.
   *
   * Validates: Requirements 2.4
   */
  it('should reject packageOpenDate earlier than roastDate (FAILS on unfixed code)', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'T',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      roastDate: '2026-04-10',
      packageOpenDate: '2026-04-05',
      preparationNotes: 'Test notes',
    });
    // This assertion FAILS on unfixed code because the schema currently accepts
    // this invalid payload (success: true instead of success: false)
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('packageOpenDate'))).toBe(true);
    }
  });

  /**
   * Concrete test — Case B:
   * grindDate ('2026-04-05') < packageOpenDate ('2026-04-10') should be rejected.
   * Currently returns success: true (bug).
   *
   * Counterexample: { packageOpenDate: '2026-04-10', grindDate: '2026-04-05' }
   * returns success: true instead of success: false.
   *
   * Validates: Requirements 2.5
   */
  it('should reject grindDate earlier than packageOpenDate (FAILS on unfixed code)', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'T',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      packageOpenDate: '2026-04-10',
      grindDate: '2026-04-05',
      preparationNotes: 'Test notes',
    });
    // This assertion FAILS on unfixed code because the schema currently accepts
    // this invalid payload (success: true instead of success: false)
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('grindDate'))).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // Property-based tests
  // ---------------------------------------------------------------------------

  /**
   * PBT — Case A (Property 1):
   * For ALL (roastDate, packageOpenDate) pairs where packageOpenDate < roastDate,
   * RecipeCreateSchema.safeParse() MUST return success: false with an issue on
   * path ['packageOpenDate'].
   *
   * This test FAILS on unfixed code for every generated pair, confirming the
   * missing .refine() rule is the root cause.
   *
   * Validates: Requirements 2.4
   */
  it('PBT: for all packageOpenDate < roastDate pairs, safeParse returns success: false (FAILS on unfixed code)', () => {
    fc.assert(
      fc.property(
        // Generate two distinct dates and ensure packageOpenDate < roastDate
        fc.date({ min: new Date('2020-01-02'), max: new Date('2030-12-31') }).filter((d) =>
          !isNaN(d.getTime())
        ),
        fc.date({ min: new Date('2020-01-02'), max: new Date('2030-12-31') }).filter((d) =>
          !isNaN(d.getTime())
        ),
        (dateA, dateB) => {
          // Assign so that roastDate > packageOpenDate
          const roastDate = dateA > dateB ? dateA : dateB;
          const packageOpenDate = dateA > dateB ? dateB : dateA;

          // Skip equal dates (boundary — those are valid)
          if (roastDate.getTime() === packageOpenDate.getTime()) return;

          const roastDateStr = roastDate.toISOString().slice(0, 10);
          const packageOpenDateStr = packageOpenDate.toISOString().slice(0, 10);

          // Skip if string comparison yields equal (same day despite different times)
          if (packageOpenDateStr >= roastDateStr) return;

          const result = RecipeCreateSchema.safeParse({
            title: 'T',
            brewMethod: 'v60',
            drinkType: 'pour_over',
            roastDate: roastDateStr,
            packageOpenDate: packageOpenDateStr,
            preparationNotes: 'Test notes',
          });

          // EXPECTED: success: false with error on packageOpenDate
          // ACTUAL (buggy): success: true — this assertion fails, surfacing the counterexample
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues.some((i) => i.path.includes('packageOpenDate'))).toBe(true);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * PBT — Case B (Property 1):
   * For ALL (packageOpenDate, grindDate) pairs where grindDate < packageOpenDate,
   * RecipeCreateSchema.safeParse() MUST return success: false with an issue on
   * path ['grindDate'].
   *
   * This test FAILS on unfixed code for every generated pair, confirming the
   * missing .refine() rule is the root cause.
   *
   * Validates: Requirements 2.5
   */
  it('PBT: for all grindDate < packageOpenDate pairs, safeParse returns success: false (FAILS on unfixed code)', () => {
    fc.assert(
      fc.property(
        // Generate two distinct dates and ensure grindDate < packageOpenDate
        fc.date({ min: new Date('2020-01-02'), max: new Date('2030-12-31') }).filter((d) =>
          !isNaN(d.getTime())
        ),
        fc.date({ min: new Date('2020-01-02'), max: new Date('2030-12-31') }).filter((d) =>
          !isNaN(d.getTime())
        ),
        (dateA, dateB) => {
          // Assign so that packageOpenDate > grindDate
          const packageOpenDate = dateA > dateB ? dateA : dateB;
          const grindDate = dateA > dateB ? dateB : dateA;

          // Skip equal dates (boundary — those are valid)
          if (packageOpenDate.getTime() === grindDate.getTime()) return;

          const packageOpenDateStr = packageOpenDate.toISOString().slice(0, 10);
          const grindDateStr = grindDate.toISOString().slice(0, 10);

          // Skip if string comparison yields equal (same day despite different times)
          if (grindDateStr >= packageOpenDateStr) return;

          const result = RecipeCreateSchema.safeParse({
            title: 'T',
            brewMethod: 'v60',
            drinkType: 'pour_over',
            packageOpenDate: packageOpenDateStr,
            grindDate: grindDateStr,
            preparationNotes: 'Test notes',
          });

          // EXPECTED: success: false with error on grindDate
          // ACTUAL (buggy): success: true — this assertion fails, surfacing the counterexample
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues.some((i) => i.path.includes('grindDate'))).toBe(true);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

/**
 * Preservation Property Tests — Valid and Absent Date Orderings Are Accepted
 *
 * These tests establish the baseline behavior that MUST be preserved after the fix.
 * They MUST PASS on unfixed code — passing confirms the baseline is correct.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */
describe('Preservation property tests', () => {
  // ---------------------------------------------------------------------------
  // Boundary unit tests
  // ---------------------------------------------------------------------------

  it('should accept payload with no date fields at all', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'T',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(true);
  });

  it('should accept payload with only roastDate provided', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'T',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      roastDate: '2026-03-15',
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(true);
  });

  it('should accept payload with only packageOpenDate provided', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'T',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      packageOpenDate: '2026-04-01',
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(true);
  });

  it('should accept same-day roastDate == packageOpenDate == grindDate (boundary)', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'T',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      roastDate: '2026-04-10',
      packageOpenDate: '2026-04-10',
      grindDate: '2026-04-10',
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(true);
  });

  it('should accept packageOpenDate on same day as roastDate (boundary)', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'T',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      roastDate: '2026-03-15',
      packageOpenDate: '2026-03-15',
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(true);
  });

  it('should accept grindDate on same day as packageOpenDate (boundary)', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'T',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      packageOpenDate: '2026-04-01',
      grindDate: '2026-04-01',
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(true);
  });

  it('should accept valid full date chain roastDate <= packageOpenDate <= grindDate', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'T',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      roastDate: '2026-03-15',
      packageOpenDate: '2026-04-01',
      grindDate: '2026-04-10',
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(true);
  });

  it('should reject grindDate earlier than roastDate (existing rule preserved)', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'T',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      roastDate: '2026-04-10',
      grindDate: '2026-04-05',
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('grindDate'))).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // Property-based tests
  // ---------------------------------------------------------------------------

  /**
   * Property 3: For ALL valid date triples where roastDate <= packageOpenDate <= grindDate,
   * RecipeCreateSchema.safeParse() MUST return success: true.
   *
   * Validates: Requirements 3.2, 3.3, 3.4
   */
  it('PBT Property 3: for all valid date triples (roastDate <= packageOpenDate <= grindDate), safeParse returns success: true', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).filter((d) =>
          !isNaN(d.getTime())
        ),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).filter((d) =>
          !isNaN(d.getTime())
        ),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).filter((d) =>
          !isNaN(d.getTime())
        ),
        (dateA, dateB, dateC) => {
          const sorted = [dateA, dateB, dateC].sort((a, b) => a.getTime() - b.getTime());
          const roastDate = sorted[0].toISOString().slice(0, 10);
          const packageOpenDate = sorted[1].toISOString().slice(0, 10);
          const grindDate = sorted[2].toISOString().slice(0, 10);

          const result = RecipeCreateSchema.safeParse({
            title: 'T',
            brewMethod: 'v60',
            drinkType: 'pour_over',
            roastDate,
            packageOpenDate,
            grindDate,
            preparationNotes: 'Test notes',
          });

          // Valid ordering must always be accepted
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4: For ALL valid recipe payloads with no date fields,
   * RecipeCreateSchema.safeParse() MUST return success: true.
   *
   * Validates: Requirements 3.1
   */
  it('PBT Property 4: for all valid recipe payloads with no date fields, safeParse returns success: true', () => {
    const brewMethods = [
      'espresso_machine',
      'v60',
      'french_press',
      'aeropress',
      'turkish_coffee',
      'drip_coffee',
      'chemex',
      'kalita_wave',
      'moka_pot',
      'cold_brew',
      'siphon',
    ] as const;
    const drinkTypes = [
      'espresso',
      'americano',
      'flat_white',
      'latte',
      'cappuccino',
      'cortado',
      'macchiato',
      'turkish_coffee',
      'pour_over',
      'cold_brew',
      'french_press',
    ] as const;

    fc.assert(
      fc.property(
        fc.constantFrom(...brewMethods),
        fc.constantFrom(...drinkTypes),
        fc.string({ minLength: 1, maxLength: 200 }),
        (brewMethod, drinkType, title) => {
          const result = RecipeCreateSchema.safeParse({
            title,
            brewMethod,
            drinkType,
            preparationNotes: 'Test notes',
          });

          // No date fields — must always be accepted
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 5: For ALL (grindDate, roastDate) pairs where grindDate < roastDate,
   * RecipeCreateSchema.safeParse() MUST return success: false (existing rule preserved).
   *
   * Validates: Requirements 3.2
   */
  it('PBT Property 5: for all grindDate < roastDate pairs, safeParse returns success: false (existing rule preserved)', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-02'), max: new Date('2030-12-31') }).filter((d) =>
          !isNaN(d.getTime())
        ),
        fc.date({ min: new Date('2020-01-02'), max: new Date('2030-12-31') }).filter((d) =>
          !isNaN(d.getTime())
        ),
        (dateA, dateB) => {
          // Assign so that roastDate > grindDate
          const roastDate = dateA > dateB ? dateA : dateB;
          const grindDate = dateA > dateB ? dateB : dateA;

          // Skip equal dates (boundary — those are valid)
          if (roastDate.getTime() === grindDate.getTime()) return;

          const roastDateStr = roastDate.toISOString().slice(0, 10);
          const grindDateStr = grindDate.toISOString().slice(0, 10);

          // Skip if string comparison yields equal (same day despite different times)
          if (grindDateStr >= roastDateStr) return;

          const result = RecipeCreateSchema.safeParse({
            title: 'T',
            brewMethod: 'v60',
            drinkType: 'pour_over',
            roastDate: roastDateStr,
            grindDate: grindDateStr,
            preparationNotes: 'Test notes',
          });

          // Existing rule: grindDate < roastDate must be rejected
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues.some((i) => i.path.includes('grindDate'))).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 9: Pre-infusion time validation
 *
 * For any pair of integers (preInfusionTimeSeconds, extractionTimeSeconds),
 * the validation SHALL accept the pair if and only if:
 *   - preInfusionTimeSeconds ≥ 1 AND
 *   - extractionTimeSeconds is provided AND
 *   - preInfusionTimeSeconds < extractionTimeSeconds
 * All other combinations SHALL be rejected.
 *
 * Validates: Requirements 12.2, 12.3, 12.4
 */
describe('Property 9: Pre-infusion time validation', () => {
  const baseRecipe = {
    title: 'Test Recipe',
    brewMethod: 'espresso_machine',
    drinkType: 'espresso',
    preparationNotes: 'Test preparation notes',
  } as const;

  // ---------------------------------------------------------------------------
  // Concrete unit tests
  // ---------------------------------------------------------------------------

  it('should accept valid pair: preInfusionTimeSeconds=5, extractionTimeSeconds=28', () => {
    const result = RecipeCreateSchema.safeParse({
      ...baseRecipe,
      preInfusionTimeSeconds: 5,
      extractionTimeSeconds: 28,
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(true);
  });

  it('should reject equal values: preInfusionTimeSeconds=28, extractionTimeSeconds=28', () => {
    const result = RecipeCreateSchema.safeParse({
      ...baseRecipe,
      preInfusionTimeSeconds: 28,
      extractionTimeSeconds: 28,
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('preInfusionTimeSeconds'))).toBe(true);
    }
  });

  it('should reject preInfusionTimeSeconds > extractionTimeSeconds: 30 vs 28', () => {
    const result = RecipeCreateSchema.safeParse({
      ...baseRecipe,
      preInfusionTimeSeconds: 30,
      extractionTimeSeconds: 28,
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('preInfusionTimeSeconds'))).toBe(true);
    }
  });

  it('should reject preInfusionTimeSeconds without extractionTimeSeconds', () => {
    const result = RecipeCreateSchema.safeParse({
      ...baseRecipe,
      preInfusionTimeSeconds: 5,
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('preInfusionTimeSeconds'))).toBe(true);
    }
  });

  it('should accept preInfusionTimeSeconds=undefined, extractionTimeSeconds=28 (pre-infusion optional)', () => {
    const result = RecipeCreateSchema.safeParse({
      ...baseRecipe,
      extractionTimeSeconds: 28,
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(true);
  });

  it('should accept both preInfusionTimeSeconds=undefined and extractionTimeSeconds=undefined', () => {
    const result = RecipeCreateSchema.safeParse({
      ...baseRecipe,
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(true);
  });

  it('should reject preInfusionTimeSeconds=0 (min is 1)', () => {
    const result = RecipeCreateSchema.safeParse({
      ...baseRecipe,
      preInfusionTimeSeconds: 0,
      extractionTimeSeconds: 28,
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(false);
  });

  it('should reject preInfusionTimeSeconds=-1 (min is 1)', () => {
    const result = RecipeCreateSchema.safeParse({
      ...baseRecipe,
      preInfusionTimeSeconds: -1,
      extractionTimeSeconds: 28,
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Property-based tests
  // ---------------------------------------------------------------------------

  /**
   * PBT — Valid pairs (preInfusionTimeSeconds ≥ 1 AND preInfusionTimeSeconds < extractionTimeSeconds):
   * For ALL such pairs, safeParse MUST return success: true.
   *
   * Validates: Requirements 12.2
   */
  it('PBT Property 9a: for all valid pairs (preInfusion ≥ 1 AND preInfusion < extraction), safeParse returns success: true', () => {
    fc.assert(
      fc.property(
        // Generate preInfusionTimeSeconds ≥ 1
        fc.integer({ min: 1, max: 1000 }),
        // Generate extractionTimeSeconds strictly greater than preInfusionTimeSeconds
        fc.integer({ min: 1, max: 1000 }),
        (preInfusion, delta) => {
          const extractionTimeSeconds = preInfusion + delta;

          const result = RecipeCreateSchema.safeParse({
            ...baseRecipe,
            preInfusionTimeSeconds: preInfusion,
            extractionTimeSeconds,
            preparationNotes: 'Test notes',
          });

          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * PBT — Equal values (preInfusionTimeSeconds === extractionTimeSeconds):
   * For ALL such pairs where preInfusion ≥ 1, safeParse MUST return success: false.
   *
   * Validates: Requirements 12.3
   */
  it('PBT Property 9b: for all pairs where preInfusion === extraction (≥ 1), safeParse returns success: false', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        (value) => {
          const result = RecipeCreateSchema.safeParse({
            ...baseRecipe,
            preInfusionTimeSeconds: value,
            extractionTimeSeconds: value,
            preparationNotes: 'Test notes',
          });

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues.some((i) => i.path.includes('preInfusionTimeSeconds'))).toBe(
              true,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * PBT — preInfusionTimeSeconds > extractionTimeSeconds:
   * For ALL such pairs where preInfusion ≥ 1, safeParse MUST return success: false.
   *
   * Validates: Requirements 12.3
   */
  it('PBT Property 9c: for all pairs where preInfusion > extraction (both ≥ 1), safeParse returns success: false', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        (extraction, delta) => {
          const preInfusion = extraction + delta;

          const result = RecipeCreateSchema.safeParse({
            ...baseRecipe,
            preInfusionTimeSeconds: preInfusion,
            extractionTimeSeconds: extraction,
            preparationNotes: 'Test notes',
          });

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues.some((i) => i.path.includes('preInfusionTimeSeconds'))).toBe(
              true,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * PBT — preInfusionTimeSeconds provided without extractionTimeSeconds:
   * For ALL preInfusionTimeSeconds ≥ 1 with no extractionTimeSeconds, safeParse MUST return success: false.
   *
   * Validates: Requirements 12.4
   */
  it('PBT Property 9d: for all preInfusion ≥ 1 without extractionTimeSeconds, safeParse returns success: false', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        (preInfusion) => {
          const result = RecipeCreateSchema.safeParse({
            ...baseRecipe,
            preInfusionTimeSeconds: preInfusion,
            preparationNotes: 'Test notes',
          });

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues.some((i) => i.path.includes('preInfusionTimeSeconds'))).toBe(
              true,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * PBT — preInfusionTimeSeconds absent (only extractionTimeSeconds provided):
   * For ALL extractionTimeSeconds > 0 with no preInfusionTimeSeconds, safeParse MUST return success: true.
   *
   * Validates: Requirements 12.2 (pre-infusion is optional)
   */
  it('PBT Property 9e: for all extractionTimeSeconds > 0 without preInfusionTimeSeconds, safeParse returns success: true', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        (extraction) => {
          const result = RecipeCreateSchema.safeParse({
            ...baseRecipe,
            extractionTimeSeconds: extraction,
            preparationNotes: 'Test notes',
          });

          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 10: Intensity range validation
 *
 * For any integer value provided as a taste note intensity, the validation
 * SHALL accept the value if and only if it is 1, 2, or 3. All other integer
 * values SHALL be rejected.
 *
 * Validates: Requirements 13.2, 13.3
 */
describe('Property 10: Intensity range validation', () => {
  const TEST_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

  const baseRecipe = {
    title: 'Test Recipe',
    brewMethod: 'espresso_machine',
    drinkType: 'espresso',
    preparationNotes: 'Test preparation notes',
  } as const;

  // ---------------------------------------------------------------------------
  // Concrete unit tests — valid intensities
  // ---------------------------------------------------------------------------

  it('should accept intensity=1', () => {
    const result = RecipeCreateObjectSchema.safeParse({
      ...baseRecipe,
      tasteNoteIntensities: { [TEST_UUID]: 1 },
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(true);
  });

  it('should accept intensity=2', () => {
    const result = RecipeCreateObjectSchema.safeParse({
      ...baseRecipe,
      tasteNoteIntensities: { [TEST_UUID]: 2 },
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(true);
  });

  it('should accept intensity=3', () => {
    const result = RecipeCreateObjectSchema.safeParse({
      ...baseRecipe,
      tasteNoteIntensities: { [TEST_UUID]: 3 },
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Concrete unit tests — invalid intensities
  // ---------------------------------------------------------------------------

  it('should reject intensity=0', () => {
    const result = RecipeCreateObjectSchema.safeParse({
      ...baseRecipe,
      tasteNoteIntensities: { [TEST_UUID]: 0 },
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(false);
  });

  it('should reject intensity=4', () => {
    const result = RecipeCreateObjectSchema.safeParse({
      ...baseRecipe,
      tasteNoteIntensities: { [TEST_UUID]: 4 },
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(false);
  });

  it('should reject intensity=-1', () => {
    const result = RecipeCreateObjectSchema.safeParse({
      ...baseRecipe,
      tasteNoteIntensities: { [TEST_UUID]: -1 },
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(false);
  });

  it('should reject intensity=100', () => {
    const result = RecipeCreateObjectSchema.safeParse({
      ...baseRecipe,
      tasteNoteIntensities: { [TEST_UUID]: 100 },
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(false);
  });

  it('should accept no intensity provided (tasteNoteIntensities omitted)', () => {
    const result = RecipeCreateObjectSchema.safeParse({
      ...baseRecipe,
      preparationNotes: 'Test notes',
    });
    expect(result.success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Property-based test — valid intensities (1, 2, 3) are always accepted
  // ---------------------------------------------------------------------------

  /**
   * PBT — valid range:
   * For ALL integers in {1, 2, 3}, RecipeCreateObjectSchema.safeParse() with
   * tasteNoteIntensities: { [uuid]: value } MUST return success: true.
   *
   * Validates: Requirements 13.2, 13.3
   */
  it('PBT Property 10: for all valid intensities (1, 2, 3), safeParse returns success: true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(1, 2, 3),
        (intensity) => {
          const result = RecipeCreateObjectSchema.safeParse({
            ...baseRecipe,
            tasteNoteIntensities: { [TEST_UUID]: intensity },
            preparationNotes: 'Test notes',
          });
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * PBT — invalid range:
   * For ALL integers outside {1, 2, 3}, RecipeCreateObjectSchema.safeParse()
   * with tasteNoteIntensities: { [uuid]: value } MUST return success: false.
   *
   * Validates: Requirements 13.2, 13.3
   */
  it('PBT Property 10: for all integers outside {1, 2, 3}, safeParse returns success: false', () => {
    fc.assert(
      fc.property(
        // Generate integers that are NOT in {1, 2, 3}
        fc.integer({ min: -1000, max: 1000 }).filter((n) => n < 1 || n > 3),
        (intensity) => {
          const result = RecipeCreateObjectSchema.safeParse({
            ...baseRecipe,
            tasteNoteIntensities: { [TEST_UUID]: intensity },
            preparationNotes: 'Test notes',
          });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('RecipeRateSchema', () => {
  it('should validate rating 1 (minimum)', () => {
    const result = RecipeRateSchema.safeParse({ rating: 1 });
    expect(result.success).toBe(true);
  });

  it('should validate rating 5', () => {
    const result = RecipeRateSchema.safeParse({ rating: 5 });
    expect(result.success).toBe(true);
  });

  it('should validate rating 10 (maximum)', () => {
    const result = RecipeRateSchema.safeParse({ rating: 10 });
    expect(result.success).toBe(true);
  });

  it('should reject rating 0', () => {
    const result = RecipeRateSchema.safeParse({ rating: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('rating'))).toBe(true);
    }
  });

  it('should reject rating 11', () => {
    const result = RecipeRateSchema.safeParse({ rating: 11 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('rating'))).toBe(true);
    }
  });

  it('should reject non-integer rating', () => {
    const result = RecipeRateSchema.safeParse({ rating: 3.5 });
    expect(result.success).toBe(false);
  });

  it('should reject negative rating', () => {
    const result = RecipeRateSchema.safeParse({ rating: -1 });
    expect(result.success).toBe(false);
  });

  it('should reject missing rating', () => {
    const result = RecipeRateSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('rating'))).toBe(true);
    }
  });
});

describe('RecipeNotesSchema', () => {
  it('should validate valid notes', () => {
    const result = RecipeNotesSchema.safeParse({ notes: 'These are my recipe notes.' });
    expect(result.success).toBe(true);
  });

  it('should validate notes up to 10000 chars', () => {
    const result = RecipeNotesSchema.safeParse({ notes: 'a'.repeat(10000) });
    expect(result.success).toBe(true);
  });

  it('should reject empty notes', () => {
    const result = RecipeNotesSchema.safeParse({ notes: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('notes'))).toBe(true);
    }
  });

  it('should reject missing notes', () => {
    const result = RecipeNotesSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject notes over 10000 chars', () => {
    const result = RecipeNotesSchema.safeParse({ notes: 'a'.repeat(10001) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('notes'))).toBe(true);
    }
  });
});

describe('RecipeForkSchema', () => {
  it('should validate with title', () => {
    const result = RecipeForkSchema.safeParse({ title: 'My Forked Recipe' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('My Forked Recipe');
    }
  });

  it('should validate without title (optional)', () => {
    const result = RecipeForkSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should validate title up to 200 chars', () => {
    const result = RecipeForkSchema.safeParse({ title: 'a'.repeat(200) });
    expect(result.success).toBe(true);
  });

  it('should reject title over 200 chars', () => {
    const result = RecipeForkSchema.safeParse({ title: 'a'.repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('title'))).toBe(true);
    }
  });

  it('should reject non-string title', () => {
    const result = RecipeForkSchema.safeParse({ title: 123 });
    expect(result.success).toBe(false);
  });
});
