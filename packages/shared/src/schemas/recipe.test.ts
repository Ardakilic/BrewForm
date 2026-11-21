import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EMOJI_TAG_VALUES } from '../constants/emoji-tags.ts';
import { VISIBILITY_VALUES } from '../constants/visibility.ts';
import {
  MAX_ADDITIONAL_PREPARATIONS,
  MAX_RELATION_IDS,
  RecipeCreateObjectSchema,
  RecipeCreateSchema,
  RecipeFilterSchema,
  RecipeForkSchema,
  RecipeNotesSchema,
  RecipeRateSchema,
  RecipeUpdateSchema,
  recipeCrossFieldIssues,
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
    for (const visibility of VISIBILITY_VALUES) {
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

  it('should accept every emoji tag value from EMOJI_TAG_VALUES', () => {
    for (const emojiTag of EMOJI_TAG_VALUES) {
      const result = RecipeCreateSchema.safeParse({
        title: 'Tagged',
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
        emojiTag,
        preparationNotes: 'Test notes',
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.emojiTag).toBe(emojiTag);
    }
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

/**
 * Wave 6 (recipe-write): the update schema must inject no defaults, so an
 * omitted key means "keep", `null` means "clear" and `[]` means "remove all".
 */
describe('RecipeUpdateSchema — absent, null and [] semantics', () => {
  /** Fields that accept `null` on update (null clears the stored value). */
  const CLEARABLE_FIELDS = [
    'productName',
    'coffeeBrand',
    'coffeeProcessing',
    'vendorId',
    'roastDate',
    'packageOpenDate',
    'grindDate',
    'brewerDetails',
    'grinder',
    'grindSize',
    'groundWeightGrams',
    'extractionTimeSeconds',
    'extractionVolumeMl',
    'temperatureCelsius',
    'tds',
    'preInfusionTimeSeconds',
    'beanId',
    'coffeeVarietyId',
    'personalNotes',
    'rating',
    'emojiTag',
  ] as const;

  /** Fields for which `null` is a validation error on update. */
  const NON_NULLABLE_FIELDS = [
    'title',
    'brewMethod',
    'drinkType',
    'preparationNotes',
    'visibility',
    'isFavourite',
    'brewDate',
    'tasteNoteIds',
    'equipmentIds',
    'additionalPreparations',
  ] as const;

  it('parses a title-only payload without injecting visibility or isFavourite', () => {
    const result = RecipeUpdateSchema.parse({ title: 'x' });
    expect(result).toEqual({ title: 'x', bumpVersion: false });
    expect('visibility' in result).toBe(false);
    expect('isFavourite' in result).toBe(false);
  });

  it('parses an empty payload to the bump flag only (drift guard against update defaults)', () => {
    expect(Object.keys(RecipeUpdateSchema.parse({}))).toEqual(['bumpVersion']);
  });

  it.each(CLEARABLE_FIELDS)('accepts null for the clearable field %s', (field) => {
    const result = RecipeUpdateSchema.safeParse({ [field]: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>)[field]).toBeNull();
    }
  });

  it.each(NON_NULLABLE_FIELDS)('rejects null for the required field %s', (field) => {
    const result = RecipeUpdateSchema.safeParse({ [field]: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === field)).toBe(true);
    }
  });

  it('accepts an empty array for the relation fields', () => {
    const result = RecipeUpdateSchema.safeParse({
      tasteNoteIds: [],
      equipmentIds: [],
      additionalPreparations: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tasteNoteIds).toEqual([]);
      expect(result.data.equipmentIds).toEqual([]);
      expect(result.data.additionalPreparations).toEqual([]);
    }
  });

  it('rejects tasteNoteIntensities without tasteNoteIds', () => {
    const id = crypto.randomUUID();
    const result = RecipeUpdateSchema.safeParse({ tasteNoteIntensities: { [id]: 2 } });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'tasteNoteIntensities')).toBe(true);
    }
  });

  it('accepts tasteNoteIntensities together with tasteNoteIds', () => {
    const id = crypto.randomUUID();
    const result = RecipeUpdateSchema.safeParse({
      tasteNoteIds: [id],
      tasteNoteIntensities: { [id]: 2 },
    });
    expect(result.success).toBe(true);
  });

  it('applies the grind-before-roast rule to updates', () => {
    const result = RecipeUpdateSchema.safeParse({
      roastDate: '2026-11-10',
      grindDate: '2026-11-01',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['grindDate'],
          message: 'Grind date cannot be earlier than roast date',
        }),
      );
    }
  });

  it('applies the package-open-before-roast rule to updates', () => {
    const result = RecipeUpdateSchema.safeParse({
      roastDate: '2026-11-10',
      packageOpenDate: '2026-11-01',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'packageOpenDate')).toBe(true);
    }
  });

  it('applies the grind-before-package-open rule to updates', () => {
    const result = RecipeUpdateSchema.safeParse({
      packageOpenDate: '2026-11-10',
      grindDate: '2026-11-01',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['grindDate'],
          message: 'Grind date cannot be earlier than package open date',
        }),
      );
    }
  });

  it('applies the pre-infusion-shorter-than-extraction rule to updates', () => {
    const result = RecipeUpdateSchema.safeParse({
      preInfusionTimeSeconds: 30,
      extractionTimeSeconds: 20,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['preInfusionTimeSeconds'],
          message: 'Pre-infusion time must be less than extraction time',
        }),
      );
    }
  });

  it('rejects pre-infusion with an explicitly cleared extraction time', () => {
    const result = RecipeUpdateSchema.safeParse({
      preInfusionTimeSeconds: 5,
      extractionTimeSeconds: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['preInfusionTimeSeconds'],
          message: 'Extraction time is required when pre-infusion time is specified',
        }),
      );
    }
  });

  it('accepts pre-infusion alone (the stored extraction time is checked on the merged values)', () => {
    const result = RecipeUpdateSchema.safeParse({ preInfusionTimeSeconds: 5 });
    expect(result.success).toBe(true);
  });
});

describe('recipeCrossFieldIssues', () => {
  it('returns no issues for consistent or absent values', () => {
    expect(recipeCrossFieldIssues({})).toEqual([]);
    expect(
      recipeCrossFieldIssues({
        roastDate: '2026-11-01',
        packageOpenDate: '2026-11-05',
        grindDate: '2026-11-05',
        preInfusionTimeSeconds: 5,
        extractionTimeSeconds: 30,
      }),
    ).toEqual([]);
  });

  it('flags a grind date before the roast date', () => {
    expect(recipeCrossFieldIssues({ roastDate: '2026-11-10', grindDate: '2026-11-01' })).toEqual([
      { field: 'grindDate', message: 'Grind date cannot be earlier than roast date' },
    ]);
  });

  it('flags a package-open date before the roast date', () => {
    expect(
      recipeCrossFieldIssues({ roastDate: '2026-11-10', packageOpenDate: '2026-11-01' }),
    ).toEqual([
      { field: 'packageOpenDate', message: 'Package open date cannot be earlier than roast date' },
    ]);
  });

  it('flags a grind date before the package-open date', () => {
    expect(
      recipeCrossFieldIssues({ packageOpenDate: '2026-11-10', grindDate: '2026-11-01' }),
    ).toEqual([
      { field: 'grindDate', message: 'Grind date cannot be earlier than package open date' },
    ]);
  });

  it('flags a pre-infusion time that is not shorter than the extraction time', () => {
    expect(
      recipeCrossFieldIssues({ preInfusionTimeSeconds: 30, extractionTimeSeconds: 30 }),
    ).toEqual([
      {
        field: 'preInfusionTimeSeconds',
        message: 'Pre-infusion time must be less than extraction time',
      },
    ]);
  });

  it('requires an extraction time with pre-infusion in complete mode (absent or null)', () => {
    const expected = [
      {
        field: 'preInfusionTimeSeconds',
        message: 'Extraction time is required when pre-infusion time is specified',
      },
    ];
    expect(recipeCrossFieldIssues({ preInfusionTimeSeconds: 5 })).toEqual(expected);
    expect(
      recipeCrossFieldIssues({ preInfusionTimeSeconds: 5, extractionTimeSeconds: null }),
    ).toEqual(expected);
  });

  it('in partial mode requires the extraction time only when it is explicitly cleared', () => {
    expect(recipeCrossFieldIssues({ preInfusionTimeSeconds: 5 }, 'partial')).toEqual([]);
    expect(
      recipeCrossFieldIssues({ preInfusionTimeSeconds: 5, extractionTimeSeconds: null }, 'partial'),
    ).toHaveLength(1);
  });

  it('ignores null dates (cleared values)', () => {
    expect(recipeCrossFieldIssues({ roastDate: null, grindDate: '2026-11-01' })).toEqual([]);
  });

  it('reports every violation in rule order', () => {
    const issues = recipeCrossFieldIssues({
      roastDate: '2026-11-10',
      packageOpenDate: '2026-11-05',
      grindDate: '2026-11-01',
      preInfusionTimeSeconds: 40,
      extractionTimeSeconds: 30,
    });
    expect(issues.map((i) => i.field)).toEqual([
      'grindDate',
      'packageOpenDate',
      'grindDate',
      'preInfusionTimeSeconds',
    ]);
  });

  it('is what RecipeCreateSchema reports (same messages and paths)', () => {
    const payload = {
      title: 'T',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      preparationNotes: 'P',
      roastDate: '2026-11-10',
      grindDate: '2026-11-01',
      preInfusionTimeSeconds: 5,
    };
    const result = RecipeCreateSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => ({ field: i.path[0], message: i.message }))).toEqual(
        recipeCrossFieldIssues(payload),
      );
    }
  });
});

describe('Recipe create/update payload fields (wave 6)', () => {
  const base = {
    title: 'Fields',
    brewMethod: 'v60',
    drinkType: 'pour_over',
    preparationNotes: 'Bloom',
  };

  it('accepts an optional coffeeVarietyId on create', () => {
    const id = crypto.randomUUID();
    const parsed = RecipeCreateSchema.parse({ ...base, coffeeVarietyId: id });
    expect(parsed.coffeeVarietyId).toBe(id);
    expect('coffeeVarietyId' in RecipeCreateSchema.parse(base)).toBe(false);
  });

  it('rejects a non-UUID coffeeVarietyId on create and update', () => {
    expect(RecipeCreateSchema.safeParse({ ...base, coffeeVarietyId: 'gesha' }).success).toBe(false);
    expect(RecipeUpdateSchema.safeParse({ coffeeVarietyId: 'gesha' }).success).toBe(false);
  });

  it('strips client-sent brewRatio and flowRate (derived server-side)', () => {
    const created = RecipeCreateSchema.parse({ ...base, brewRatio: 15, flowRate: 2 });
    expect('brewRatio' in created).toBe(false);
    expect('flowRate' in created).toBe(false);
    const updated = RecipeUpdateSchema.parse({ brewRatio: 15, flowRate: 2 });
    expect(updated).toEqual({ bumpVersion: false });
  });

  it('never accepts coffeeVarietyName from clients', () => {
    const created = RecipeCreateSchema.parse({ ...base, coffeeVarietyName: 'Gesha' });
    expect('coffeeVarietyName' in created).toBe(false);
  });
});

describe('Recipe payloads reject duplicate relation ids', () => {
  const base = {
    title: 'Dup',
    brewMethod: 'v60',
    drinkType: 'pour_over',
    preparationNotes: 'Bloom',
  };

  it.each(['tasteNoteIds', 'equipmentIds'] as const)('rejects duplicate %s on create', (field) => {
    const id = crypto.randomUUID();
    const result = RecipeCreateSchema.safeParse({ ...base, [field]: [id, id] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: [field], message: 'Duplicate ids are not allowed' }),
      );
    }
  });

  it.each(['tasteNoteIds', 'equipmentIds'] as const)('rejects duplicate %s on update', (field) => {
    const id = crypto.randomUUID();
    const result = RecipeUpdateSchema.safeParse({ [field]: [id, id] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: [field], message: 'Duplicate ids are not allowed' }),
      );
    }
  });

  it('accepts distinct ids on create and update', () => {
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    expect(RecipeCreateSchema.safeParse({ ...base, tasteNoteIds: ids }).success).toBe(true);
    expect(RecipeUpdateSchema.safeParse({ equipmentIds: ids }).success).toBe(true);
  });
});

describe('Recipe payloads bound their relation arrays', () => {
  it('exports the limits', () => {
    expect(MAX_ADDITIONAL_PREPARATIONS).toBe(20);
    expect(MAX_RELATION_IDS).toBe(50);
  });

  const base = {
    title: 'Bounds',
    brewMethod: 'v60',
    drinkType: 'pour_over',
    preparationNotes: 'Bloom',
  };

  /** `count` valid additional preparations. */
  function preparations(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      name: `Prep ${i}`,
      type: 'milk',
      inputAmount: '100ml',
      preparationType: 'steamed',
    }));
  }

  /** `count` distinct UUIDs. */
  function ids(count: number): string[] {
    return Array.from({ length: count }, () => crypto.randomUUID());
  }

  const schemas = [
    ['RecipeCreateSchema', (body: object) => RecipeCreateSchema.safeParse({ ...base, ...body })],
    ['RecipeUpdateSchema', (body: object) => RecipeUpdateSchema.safeParse(body)],
  ] as const;

  it.each(schemas)('%s accepts 20 additional preparations and rejects 21', (_name, parse) => {
    expect(parse({ additionalPreparations: preparations(20) }).success).toBe(true);
    const result = parse({ additionalPreparations: preparations(21) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual([
        'additionalPreparations',
      ]);
    }
  });

  it.each(
    schemas.flatMap(([name, parse]) =>
      (['tasteNoteIds', 'equipmentIds'] as const).map((field) => [name, field, parse] as const),
    ),
  )('%s accepts 50 distinct %s and rejects 51', (_name, field, parse) => {
    expect(parse({ [field]: ids(50) }).success).toBe(true);
    const result = parse({ [field]: ids(51) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual([field]);
    }
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

  it('accepts author filter', () => {
    const result = RecipeFilterSchema.safeParse({ author: 'alice' });
    expect(result.success).toBe(true);
  });

  it('accepts dateFrom as ISO string and coerces to Date', () => {
    const result = RecipeFilterSchema.safeParse({ dateFrom: '2025-01-01' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dateFrom).toBeInstanceOf(Date);
    }
  });

  it('rejects minRating below 1', () => {
    const result = RecipeFilterSchema.safeParse({ minRating: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects maxRating above 10', () => {
    const result = RecipeFilterSchema.safeParse({ maxRating: 11 });
    expect(result.success).toBe(false);
  });

  it('silently drops grinder (removed field)', () => {
    const result = RecipeFilterSchema.safeParse({ grinder: 'Niche' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).grinder).toBeUndefined();
  });

  // --- wave 6 (advanced-search): search is trimmed and bounded at 200 characters ---
  it('rejects a search of 201 characters', () => {
    const result = RecipeFilterSchema.safeParse({ search: 'a'.repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['search']);
    }
  });

  it('accepts a search of exactly 200 characters', () => {
    const result = RecipeFilterSchema.safeParse({ search: 'a'.repeat(200) });
    expect(result.success).toBe(true);
  });

  it('trims surrounding whitespace from search', () => {
    const result = RecipeFilterSchema.safeParse({ search: '  espresso  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.search).toBe('espresso');
    }
  });

  it('applies the 200-character bound after trimming', () => {
    const result = RecipeFilterSchema.safeParse({ search: `  ${'a'.repeat(200)}  ` });
    expect(result.success).toBe(true);
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
      fc.property(fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }), (ids) => {
        const result = RecipeFilterSchema.safeParse({
          tasteNoteIds: ids.join(','),
        });
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('PBT: for any array of >10 valid UUIDs, comma-separated string is rejected', () => {
    fc.assert(
      fc.property(fc.array(fc.uuid(), { minLength: 11, maxLength: 20 }), (ids) => {
        const result = RecipeFilterSchema.safeParse({
          tasteNoteIds: ids.join(','),
        });
        expect(result.success).toBe(false);
      }),
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
        fc
          .date({ min: new Date('2020-01-02'), max: new Date('2030-12-31') })
          .filter((d) => !isNaN(d.getTime())),
        fc
          .date({ min: new Date('2020-01-02'), max: new Date('2030-12-31') })
          .filter((d) => !isNaN(d.getTime())),
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
        fc
          .date({ min: new Date('2020-01-02'), max: new Date('2030-12-31') })
          .filter((d) => !isNaN(d.getTime())),
        fc
          .date({ min: new Date('2020-01-02'), max: new Date('2030-12-31') })
          .filter((d) => !isNaN(d.getTime())),
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
        fc
          .date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
          .filter((d) => !isNaN(d.getTime())),
        fc
          .date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
          .filter((d) => !isNaN(d.getTime())),
        fc
          .date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
          .filter((d) => !isNaN(d.getTime())),
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
        fc
          .date({ min: new Date('2020-01-02'), max: new Date('2030-12-31') })
          .filter((d) => !isNaN(d.getTime())),
        fc
          .date({ min: new Date('2020-01-02'), max: new Date('2030-12-31') })
          .filter((d) => !isNaN(d.getTime())),
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
      fc.property(fc.integer({ min: 1, max: 10000 }), (value) => {
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
      }),
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
      fc.property(fc.integer({ min: 1, max: 10000 }), (preInfusion) => {
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
      }),
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
      fc.property(fc.integer({ min: 1, max: 10000 }), (extraction) => {
        const result = RecipeCreateSchema.safeParse({
          ...baseRecipe,
          extractionTimeSeconds: extraction,
          preparationNotes: 'Test notes',
        });

        expect(result.success).toBe(true);
      }),
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
      fc.property(fc.constantFrom(1, 2, 3), (intensity) => {
        const result = RecipeCreateObjectSchema.safeParse({
          ...baseRecipe,
          tasteNoteIntensities: { [TEST_UUID]: intensity },
          preparationNotes: 'Test notes',
        });
        expect(result.success).toBe(true);
      }),
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
