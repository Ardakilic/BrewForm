import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import fc from 'npm:fast-check@3.22.0';
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
        fc.date({ min: new Date('2020-01-02'), max: new Date('2030-12-31') }),
        fc.date({ min: new Date('2020-01-02'), max: new Date('2030-12-31') }),
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
        fc.date({ min: new Date('2020-01-02'), max: new Date('2030-12-31') }),
        fc.date({ min: new Date('2020-01-02'), max: new Date('2030-12-31') }),
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
    });
    expect(result.success).toBe(true);
  });

  it('should accept payload with only roastDate provided', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'T',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      roastDate: '2026-03-15',
    });
    expect(result.success).toBe(true);
  });

  it('should accept payload with only packageOpenDate provided', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'T',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      packageOpenDate: '2026-04-01',
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
        // Generate three dates and sort them to get a valid ordering
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
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
      'espresso_machine', 'v60', 'french_press', 'aeropress', 'turkish_coffee',
      'drip_coffee', 'chemex', 'kalita_wave', 'moka_pot', 'cold_brew', 'siphon',
    ] as const;
    const drinkTypes = [
      'espresso', 'americano', 'flat_white', 'latte', 'cappuccino', 'cortado',
      'macchiato', 'turkish_coffee', 'pour_over', 'cold_brew', 'french_press',
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
        fc.date({ min: new Date('2020-01-02'), max: new Date('2030-12-31') }),
        fc.date({ min: new Date('2020-01-02'), max: new Date('2030-12-31') }),
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
