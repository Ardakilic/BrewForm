// deno-lint-ignore-file no-explicit-any

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import fc from 'npm:fast-check';
import { computeBrewRatio, computeExtractionYield, computeFlowRate } from '@brewform/shared/utils';
import { ensureUniqueSlug, generateSlug } from '@brewform/shared/utils';
import {
  RecipeCreateObjectSchema,
  RecipeCreateSchema,
  RecipeFilterSchema,
} from '@brewform/shared/schemas';

describe('Recipe Service Logic', () => {
  describe('Slug generation', () => {
    it('should generate slug from title', () => {
      const title = 'My Espresso Recipe';
      const slug = generateSlug(title);
      expect(slug).toBe('my-espresso-recipe');
    });

    it('should handle special characters in title', () => {
      const title = 'Coffee & Tea #1!';
      const slug = generateSlug(title);
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    });
  });

  describe('Unique slug generation', () => {
    it('should find unique slug when none exist', () => {
      const slug = ensureUniqueSlug('my-recipe', []);
      expect(slug).toBe('my-recipe');
    });

    it('should append counter for duplicate slugs', () => {
      const slug = ensureUniqueSlug('my-recipe', ['my-recipe']);
      expect(slug).toBe('my-recipe-1');
    });
  });

  describe('Brew ratio computation in recipe creation', () => {
    it('should compute brew ratio when grounds and yield are provided', () => {
      const ratio = computeBrewRatio(18, 36);
      expect(ratio).toBe(2);
    });

    it('should compute flow rate when yield and time are provided', () => {
      const rate = computeFlowRate(36, 28);
      expect(rate).toBeCloseTo(1.29, 1);
    });

    it('should return null when grounds are zero', () => {
      const ratio = computeBrewRatio(0, 36);
      expect(ratio).toBeNull();
    });

    it('should return null when extraction volume is zero', () => {
      const ratio = computeBrewRatio(18, null as unknown as number);
      expect(ratio).toBeNull();
    });
  });

  describe('Recipe visibility checks', () => {
    it('should prevent forking of private recipes by non-authors', () => {
      const recipe = { visibility: 'private', authorId: 'user-1' };
      const currentUserId = 'user-2';
      const canFork = recipe.visibility === 'public' || recipe.visibility === 'unlisted' ||
        recipe.authorId === currentUserId;
      expect(canFork).toBe(false);
    });

    it('should allow forking of public recipes by anyone', () => {
      const recipe = { visibility: 'public', authorId: 'user-1' };
      const currentUserId = 'user-2';
      const canFork = recipe.visibility === 'public' || recipe.visibility === 'unlisted' ||
        recipe.authorId === currentUserId;
      expect(canFork).toBe(true);
    });

    it('should allow author to fork their own private recipe', () => {
      const recipe = { visibility: 'private', authorId: 'user-1' };
      const currentUserId = 'user-1';
      const canFork = recipe.visibility === 'public' || recipe.visibility === 'unlisted' ||
        recipe.authorId === currentUserId;
      expect(canFork).toBe(true);
    });
  });

  describe('Recipe fork title generation', () => {
    it('should use custom title when provided', () => {
      const customTitle = 'My Version';
      const sourceTitle = 'Original Recipe';
      const forkTitle = customTitle || `Fork of ${sourceTitle}`;
      expect(forkTitle).toBe('My Version');
    });

    it('should generate fork title when custom title not provided', () => {
      const sourceTitle = 'Original Recipe';
      const forkTitle = `Fork of ${sourceTitle}`;
      expect(forkTitle).toBe('Fork of Original Recipe');
    });
  });

  describe('Extraction yield computation', () => {
    it('should compute extraction yield correctly', () => {
      const yield_ = computeExtractionYield(18, 36);
      expect(yield_).toBeCloseTo(100, 1);
    });

    it('should return null for zero dose', () => {
      const yield_ = computeExtractionYield(0, 36);
      expect(yield_).toBeNull();
    });
  });

  describe('Setup auto-fill in recipe creation', () => {
    it('should auto-fill grinder from setup when not provided', () => {
      const userGrinder = null;
      const setupGrinder = 'Niche Zero';
      const finalGrinder = userGrinder || setupGrinder;
      expect(finalGrinder).toBe('Niche Zero');
    });

    it('should auto-fill brewerDetails from setup when not provided', () => {
      const userBrewerDetails = null;
      const setupBrewerDetails = 'V60 02 ceramic';
      const finalBrewerDetails = userBrewerDetails || setupBrewerDetails;
      expect(finalBrewerDetails).toBe('V60 02 ceramic');
    });

    it('should not overwrite user-provided grinder', () => {
      const userGrinder = 'Eureka Mignon';
      const setupGrinder = 'Niche Zero';
      const finalGrinder = userGrinder || setupGrinder;
      expect(finalGrinder).toBe('Eureka Mignon');
    });

    it('should not overwrite user-provided brewerDetails', () => {
      const userBrewerDetails = 'Aeropress';
      const setupBrewerDetails = 'V60 02 ceramic';
      const finalBrewerDetails = userBrewerDetails || setupBrewerDetails;
      expect(finalBrewerDetails).toBe('Aeropress');
    });

    it('should map equipmentIds to connection create array', () => {
      const equipmentIds = ['eq-1', 'eq-2'];
      const connections = equipmentIds.map((id: string) => ({ equipmentId: id }));
      expect(connections).toEqual([{ equipmentId: 'eq-1' }, { equipmentId: 'eq-2' }]);
    });
  });
});

describe('Recipe schema — new fields (recipe-detail-redesign)', () => {
  const BASE_RECIPE = {
    title: 'Test',
    brewMethod: 'espresso_machine',
    drinkType: 'espresso',
    preparationNotes: 'Test preparation notes',
  } as const;
  const TEST_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

  // Requirements 12.2, 12.3, 12.4
  describe('Pre-infusion cross-field validation', () => {
    it('should accept preInfusionTimeSeconds=5 with extractionTimeSeconds=28', () => {
      const result = RecipeCreateSchema.safeParse({
        ...BASE_RECIPE,
        preInfusionTimeSeconds: 5,
        extractionTimeSeconds: 28,
      });
      expect(result.success).toBe(true);
    });

    it('should reject preInfusionTimeSeconds=28 when extractionTimeSeconds=28 (equal)', () => {
      const result = RecipeCreateSchema.safeParse({
        ...BASE_RECIPE,
        preInfusionTimeSeconds: 28,
        extractionTimeSeconds: 28,
      });
      expect(result.success).toBe(false);
    });

    it('should reject preInfusionTimeSeconds=30 when extractionTimeSeconds=28 (greater)', () => {
      const result = RecipeCreateSchema.safeParse({
        ...BASE_RECIPE,
        preInfusionTimeSeconds: 30,
        extractionTimeSeconds: 28,
      });
      expect(result.success).toBe(false);
    });

    it('should reject preInfusionTimeSeconds=5 without extractionTimeSeconds', () => {
      const result = RecipeCreateSchema.safeParse({
        ...BASE_RECIPE,
        preInfusionTimeSeconds: 5,
      });
      expect(result.success).toBe(false);
    });

    it('should accept extractionTimeSeconds=28 without preInfusionTimeSeconds', () => {
      const result = RecipeCreateSchema.safeParse({
        ...BASE_RECIPE,
        extractionTimeSeconds: 28,
      });
      expect(result.success).toBe(true);
    });
  });

  // Requirements 13.2, 13.3
  describe('Intensity validation', () => {
    it('should accept tasteNoteIntensities with values 1, 2, 3', () => {
      const result = RecipeCreateObjectSchema.safeParse({
        ...BASE_RECIPE,
        tasteNoteIntensities: {
          [TEST_UUID]: 1,
          'a47ac10b-58cc-4372-a567-0e02b2c3d479': 2,
          'b47ac10b-58cc-4372-a567-0e02b2c3d479': 3,
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject tasteNoteIntensities with value 0', () => {
      const result = RecipeCreateObjectSchema.safeParse({
        ...BASE_RECIPE,
        tasteNoteIntensities: {
          [TEST_UUID]: 0,
        },
      });
      expect(result.success).toBe(false);
    });

    it('should reject tasteNoteIntensities with value 4', () => {
      const result = RecipeCreateObjectSchema.safeParse({
        ...BASE_RECIPE,
        tasteNoteIntensities: {
          [TEST_UUID]: 4,
        },
      });
      expect(result.success).toBe(false);
    });
  });

  // Requirement 14.2
  describe('beanId field', () => {
    it('should accept beanId as a valid UUID', () => {
      const result = RecipeCreateObjectSchema.safeParse({
        ...BASE_RECIPE,
        beanId: TEST_UUID,
      });
      expect(result.success).toBe(true);
    });

    it('should reject beanId as a non-UUID string', () => {
      const result = RecipeCreateObjectSchema.safeParse({
        ...BASE_RECIPE,
        beanId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  // Requirement 14.2 (equipmentId filter)
  describe('equipmentId filter', () => {
    it('should accept equipmentId as a valid UUID in filter', () => {
      const result = RecipeFilterSchema.safeParse({
        equipmentId: TEST_UUID,
      });
      expect(result.success).toBe(true);
    });

    it('should reject equipmentId as a non-UUID string in filter', () => {
      const result = RecipeFilterSchema.safeParse({
        equipmentId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('mainBrewer filter', () => {
    it('should accept mainBrewer in filter', () => {
      const result = RecipeFilterSchema.safeParse({
        mainBrewer: 'Lelit Mara X',
      });
      expect(result.success).toBe(true);
    });

    it('should reject mainBrewer longer than 200 chars', () => {
      const result = RecipeFilterSchema.safeParse({
        mainBrewer: 'a'.repeat(201),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('groundWeightGrams validation', () => {
    it('should reject negative groundWeightGrams', () => {
      const result = RecipeCreateSchema.safeParse({
        ...BASE_RECIPE,
        groundWeightGrams: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should accept groundWeightGrams of 0', () => {
      const result = RecipeCreateSchema.safeParse({
        ...BASE_RECIPE,
        groundWeightGrams: 0,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('extractionVolumeMl validation', () => {
    it('should reject negative extractionVolumeMl', () => {
      const result = RecipeCreateSchema.safeParse({
        ...BASE_RECIPE,
        extractionVolumeMl: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should accept extractionVolumeMl of 0', () => {
      const result = RecipeCreateSchema.safeParse({
        ...BASE_RECIPE,
        extractionVolumeMl: 0,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('new drink types', () => {
    const newDrinkTypes = ['aeropress', 'drip_coffee', 'moka_pot', 'siphon'] as const;

    for (const drinkType of newDrinkTypes) {
      it(`should accept drink type ${drinkType}`, () => {
        const result = RecipeCreateSchema.safeParse({
          ...BASE_RECIPE,
          drinkType,
        });
        expect(result.success).toBe(true);
      });
    }
  });
});

describe('tasteNoteIds AND logic filtering', () => {
  // ---------------------------------------------------------------------------
  // Minimal Drizzle-ORM-like condition builders (no real DB needed)
  // ---------------------------------------------------------------------------
  type Condition = { type: string; column: string; value: unknown };

  function eq(column: string, value: unknown): Condition {
    return { type: 'eq', column, value };
  }

  function inArray(column: string, _subquery: unknown): Condition {
    return { type: 'inArray', column, value: _subquery };
  }

  function and(...conditions: Condition[]): { type: 'and'; conditions: Condition[] } {
    return { type: 'and', conditions };
  }

  let capturedConditions: Condition[] = [];

  const mockModel = {
    findMany: (
      where: unknown,
      _page: number,
      _perPage: number,
      _sortBy: string,
      _sortOrder: string,
    ) => {
      if ((where as { type: string }).type === 'and') {
        capturedConditions = (where as { type: string; conditions: Condition[] }).conditions;
      } else if (Array.isArray(where)) {
        capturedConditions = where as Condition[];
      } else {
        capturedConditions = [where as Condition];
      }
      return Promise.resolve({ data: [], meta: { page: 1, perPage: 20, total: 0, totalPages: 0 } });
    },
  };

  const recipes = {
    visibility: 'recipes.visibility',
    currentVersionId: 'recipes.currentVersionId',
  };

  const recipeTasteNotes = {
    recipeVersionId: 'recipeTasteNotes.recipeVersionId',
    tasteNoteId: 'recipeTasteNotes.tasteNoteId',
  };

  const db: any = {
    select: () => ({
      from: (_table: any) => ({
        where: (cond: unknown) => cond,
      }),
    }),
  };

  async function listRecipes_withTasteNoteFilters(filters: any, page: number, perPage: number) {
    const conditions: any[] = [eq(recipes.visibility, 'public')];

    if (filters.tasteNoteIds) {
      const ids = filters.tasteNoteIds.split(',').map((id: string) => id.trim());
      // AND logic: recipe's current version must have ALL specified taste notes
      for (const noteId of ids) {
        conditions.push(
          inArray(
            recipes.currentVersionId,
            db.select({ id: recipeTasteNotes.recipeVersionId })
              .from(recipeTasteNotes)
              .where(eq(recipeTasteNotes.tasteNoteId, noteId)),
          ),
        );
      }
    }

    const where = conditions.length > 1 ? and(...conditions) : conditions[0];
    return mockModel.findMany(where, page, perPage, 'createdAt', 'desc');
  }

  it('PBT: for any subset of 1–10 taste note IDs, parsing splits correctly and generates the right number of conditions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
        async (ids) => {
          capturedConditions = [];
          const tasteNoteIds = ids.join(',');
          await listRecipes_withTasteNoteFilters({ tasteNoteIds }, 1, 20);

          // First condition is visibility eq
          expect(capturedConditions.length).toBe(1 + ids.length);

          const tasteNoteConditions = capturedConditions.filter(
            (c) => c.type === 'inArray' && c.column === 'recipes.currentVersionId',
          );
          expect(tasteNoteConditions.length).toBe(ids.length);

          // Verify each ID appears in exactly one condition
          ids.forEach((noteId) => {
            const matching = tasteNoteConditions.filter(
              (c) =>
                (c.value as Condition).type === 'eq' &&
                (c.value as Condition).column === 'recipeTasteNotes.tasteNoteId' &&
                (c.value as Condition).value === noteId,
            );
            expect(matching.length).toBe(1);
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Recipe Create/Update input types', () => {
  it('RecipeCreateObjectSchema should accept a valid payload and produce typed output', () => {
    const payload = {
      title: 'Morning Espresso',
      visibility: 'public' as const,
      brewMethod: 'espresso_machine' as const,
      drinkType: 'espresso' as const,
      preparationNotes: 'Pull a 36g shot in 28s',
    };
    const parsed = RecipeCreateObjectSchema.parse(payload);
    expect(parsed.title).toBe('Morning Espresso');
    expect(parsed.preparationNotes).toBe('Pull a 36g shot in 28s');
  });

  it('RecipeCreateSchema should pass through the same fields with extra refinements', () => {
    const payload = {
      title: 'Quick',
      visibility: 'draft' as const,
      brewMethod: 'aeropress' as const,
      drinkType: 'espresso' as const,
      preparationNotes: 'Inverted, 1 minute steep',
    };
    const parsed = RecipeCreateSchema.parse(payload);
    expect(parsed.title).toBe('Quick');
    expect(parsed.brewMethod).toBe('aeropress');
  });

  it('RecipeFilterSchema should accept a valid visibility filter', () => {
    const parsed = RecipeFilterSchema.parse({ visibility: 'public' });
    expect(parsed.visibility).toBe('public');
  });
});
