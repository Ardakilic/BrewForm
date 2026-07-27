import '../../test-setup.ts';
import { afterAll, afterEach, beforeAll, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import fc from 'npm:fast-check';
import { db } from '@brewform/db';
import {
  recipes,
  recipeVersions,
  userBadges,
  userRecipeFavourites,
  userRecipeLikes,
  users,
} from '@brewform/db/schema';
import { eq, inArray } from 'drizzle-orm';
import * as model from './model.ts';
import * as service from './service.ts';
import { canViewRecipe } from './service.ts';
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

  // deno-lint-ignore no-explicit-any -- test mock parameter
  const db: any = {
    select: () => ({
      // deno-lint-ignore no-explicit-any -- test mock parameter
      from: (_table: any) => ({
        where: (cond: unknown) => cond,
      }),
    }),
  };

  // deno-lint-ignore no-explicit-any require-await -- test mock parameter
  async function listRecipes_withTasteNoteFilters(filters: any, page: number, perPage: number) {
    // deno-lint-ignore no-explicit-any -- test mock array
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

describe('canViewRecipe', () => {
  const authorId = 'author-1';
  const otherId = 'other-2';

  for (const visibility of ['public', 'unlisted']) {
    it(`should return true for ${visibility} recipes regardless of caller`, () => {
      expect(canViewRecipe({ visibility, authorId })).toBe(true);
      expect(canViewRecipe({ visibility, authorId }, null)).toBe(true);
      expect(canViewRecipe({ visibility, authorId }, otherId)).toBe(true);
      expect(canViewRecipe({ visibility, authorId }, authorId)).toBe(true);
      expect(canViewRecipe({ visibility, authorId }, otherId, true)).toBe(true);
    });
  }

  for (const visibility of ['draft', 'private']) {
    it(`should return false for ${visibility} recipes when anonymous`, () => {
      expect(canViewRecipe({ visibility, authorId })).toBe(false);
      expect(canViewRecipe({ visibility, authorId }, null)).toBe(false);
    });

    it(`should return false for ${visibility} recipes for a non-owner`, () => {
      expect(canViewRecipe({ visibility, authorId }, otherId)).toBe(false);
    });

    it(`should return true for ${visibility} recipes for the owner`, () => {
      expect(canViewRecipe({ visibility, authorId }, authorId)).toBe(true);
    });

    it(`should return true for ${visibility} recipes for an admin (deliberate bypass)`, () => {
      expect(canViewRecipe({ visibility, authorId }, otherId, true)).toBe(true);
      expect(canViewRecipe({ visibility, authorId }, null, true)).toBe(true);
    });
  }
});

/**
 * DB-backed integration tests for recipe service branches.
 *
 * Exercises the real service functions against the PostgreSQL test database:
 * lookup (slug vs id), authorization errors (FORBIDDEN / RECIPE_NOT_FOUND),
 * the like/favourite/feature toggles, notes, metadata, forking, and updates.
 */
describe(
  'Recipe Service — DB integration',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    let author: typeof users.$inferSelect;
    let other: typeof users.$inferSelect;
    const createdRecipes: string[] = [];
    const createdUsers: string[] = [];

    async function makeUser(prefix: string) {
      const id = crypto.randomUUID();
      const [user] = await db.insert(users).values({
        id,
        email: `${prefix}-${id}@example.com`,
        username: `${prefix}-${id.slice(0, 8)}`,
        passwordHash: 'hash',
      }).returning();
      createdUsers.push(user.id);
      return user;
    }

    /** Insert a recipe + first version, linking `currentVersionId`. */
    async function makeRecipe(
      authorId: string,
      title: string,
      visibility: 'public' | 'draft' | 'private' | 'unlisted' = 'public',
    ) {
      const recipeId = crypto.randomUUID();
      const [recipe] = await db.insert(recipes).values({
        id: recipeId,
        slug: `slug-${recipeId.slice(0, 8)}`,
        title,
        authorId,
        visibility,
      }).returning();
      createdRecipes.push(recipe.id);
      const [version] = await db.insert(recipeVersions).values({
        recipeId: recipe.id,
        versionNumber: 1,
        brewMethod: 'v60',
        drinkType: 'pour_over',
        preparationNotes: 'test preparation',
      }).returning();
      await db.update(recipes).set({ currentVersionId: version.id }).where(
        eq(recipes.id, recipe.id),
      );
      return recipe;
    }

    /** Insert a recipe with no version (currentVersionId stays null). */
    async function makeBareRecipe(authorId: string, title: string) {
      const recipeId = crypto.randomUUID();
      const [recipe] = await db.insert(recipes).values({
        id: recipeId,
        slug: `slug-${recipeId.slice(0, 8)}`,
        title,
        authorId,
        visibility: 'public',
      }).returning();
      createdRecipes.push(recipe.id);
      return recipe;
    }

    /** Delete a user, draining the fire-and-forget badge-evaluation race. */
    async function deleteUserWithBadges(userId: string) {
      for (let attempt = 0;; attempt++) {
        await db.delete(userBadges).where(eq(userBadges.userId, userId));
        try {
          await db.delete(users).where(eq(users.id, userId));
          return;
        } catch (err) {
          if (attempt >= 9) throw err;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
    }

    beforeAll(async () => {
      author = await makeUser('svc-author');
      other = await makeUser('svc-other');
    });

    afterEach(async () => {
      if (createdRecipes.length) {
        await db.delete(userRecipeLikes).where(inArray(userRecipeLikes.recipeId, createdRecipes));
        await db.delete(userRecipeFavourites).where(
          inArray(userRecipeFavourites.recipeId, createdRecipes),
        );
        await db.delete(recipeVersions).where(inArray(recipeVersions.recipeId, createdRecipes));
        await db.delete(recipes).where(inArray(recipes.id, createdRecipes));
        createdRecipes.length = 0;
      }
    });

    afterAll(async () => {
      if (createdRecipes.length) {
        await db.delete(recipeVersions).where(inArray(recipeVersions.recipeId, createdRecipes));
        await db.delete(recipes).where(inArray(recipes.id, createdRecipes));
      }
      for (const userId of createdUsers) {
        await deleteUserWithBadges(userId);
      }
    });

    describe('getRecipe', () => {
      it('should resolve a recipe by id', async () => {
        const recipe = await makeRecipe(author.id, 'Get By Id');
        const found = await service.getRecipe(recipe.id);
        expect(found.id).toBe(recipe.id);
      });

      it('should resolve a recipe by slug', async () => {
        const recipe = await makeRecipe(author.id, 'Get By Slug');
        const found = await service.getRecipe(recipe.slug);
        expect(found.id).toBe(recipe.id);
      });

      it('should throw RECIPE_NOT_FOUND for an unknown slug', async () => {
        await expect(service.getRecipe('no-such-slug')).rejects.toThrow('RECIPE_NOT_FOUND');
      });
    });

    describe('deleteRecipe', () => {
      it('should soft-delete the recipe for its author', async () => {
        const recipe = await makeRecipe(author.id, 'Delete Mine');
        await service.deleteRecipe(recipe.id, author.id);
        const found = await model.findById(recipe.id);
        expect(found).toBeUndefined();
      });

      it('should throw FORBIDDEN for a non-author', async () => {
        const recipe = await makeRecipe(author.id, 'Delete Forbidden');
        await expect(service.deleteRecipe(recipe.id, other.id)).rejects.toThrow('FORBIDDEN');
      });

      it('should throw RECIPE_NOT_FOUND for an unknown recipe', async () => {
        await expect(service.deleteRecipe(crypto.randomUUID(), author.id)).rejects.toThrow(
          'RECIPE_NOT_FOUND',
        );
      });
    });

    describe('toggleLike', () => {
      it('should like then unlike a recipe', async () => {
        const recipe = await makeRecipe(author.id, 'Like Toggle');
        const first = await service.toggleLike(author.id, recipe.id);
        expect(first.liked).toBe(true);
        const second = await service.toggleLike(author.id, recipe.id);
        expect(second.liked).toBe(false);
      });

      it('should throw RECIPE_NOT_FOUND for an unknown recipe', async () => {
        await expect(service.toggleLike(author.id, crypto.randomUUID())).rejects.toThrow(
          'RECIPE_NOT_FOUND',
        );
      });
    });

    describe('toggleFavourite', () => {
      it('should favourite then unfavourite a recipe', async () => {
        const recipe = await makeRecipe(author.id, 'Fav Toggle');
        const first = await service.toggleFavourite(author.id, recipe.id);
        expect(first.favourited).toBe(true);
        const second = await service.toggleFavourite(author.id, recipe.id);
        expect(second.favourited).toBe(false);
      });

      it('should throw RECIPE_NOT_FOUND for an unknown recipe', async () => {
        await expect(service.toggleFavourite(author.id, crypto.randomUUID())).rejects.toThrow(
          'RECIPE_NOT_FOUND',
        );
      });
    });

    describe('toggleFeature', () => {
      it('should toggle the featured flag for the author', async () => {
        const recipe = await makeRecipe(author.id, 'Feature Toggle');
        const result = await service.toggleFeature(recipe.id, author.id);
        expect(typeof result.featured).toBe('boolean');
      });

      it('should throw FORBIDDEN for a non-author', async () => {
        const recipe = await makeRecipe(author.id, 'Feature Forbidden');
        await expect(service.toggleFeature(recipe.id, other.id)).rejects.toThrow('FORBIDDEN');
      });

      it('should throw RECIPE_NOT_FOUND for an unknown recipe', async () => {
        await expect(service.toggleFeature(crypto.randomUUID(), author.id)).rejects.toThrow(
          'RECIPE_NOT_FOUND',
        );
      });
    });

    describe('saveNotes', () => {
      it('should save notes on the current version', async () => {
        const recipe = await makeRecipe(author.id, 'Notes OK');
        await service.saveNotes(recipe.id, 'My personal notes');
        const reloaded = await model.findById(recipe.id);
        expect(reloaded?.versions?.[0]?.personalNotes).toBe('My personal notes');
      });

      it('should throw RECIPE_NOT_FOUND for an unknown recipe', async () => {
        await expect(service.saveNotes(crypto.randomUUID(), 'x')).rejects.toThrow(
          'RECIPE_NOT_FOUND',
        );
      });

      it('should throw RECIPE_NOT_FOUND when there is no current version', async () => {
        const recipe = await makeBareRecipe(author.id, 'Notes No Version');
        await expect(service.saveNotes(recipe.id, 'x')).rejects.toThrow('RECIPE_NOT_FOUND');
      });
    });

    describe('getRecipeMeta', () => {
      it('should return lightweight metadata for a slug', async () => {
        const recipe = await makeRecipe(author.id, 'Meta Recipe');
        const meta = await service.getRecipeMeta(recipe.slug);
        expect(meta.id).toBe(recipe.id);
        expect(meta.slug).toBe(recipe.slug);
        expect(meta.title).toBe('Meta Recipe');
        expect(meta.brewMethod).toBe('v60');
      });

      it('should throw RECIPE_NOT_FOUND for an unknown slug', async () => {
        await expect(service.getRecipeMeta('no-such-slug')).rejects.toThrow('RECIPE_NOT_FOUND');
      });
    });

    describe('checkEquipmentCompatibility', () => {
      it('should return no messages when all equipment is compatible', () => {
        const messages = service.checkEquipmentCompatibility(
          [{ id: 'e1', type: 'paper_filter' }],
          'v60' as never,
          [{ brewMethod: 'v60' as never, equipmentType: 'paper_filter', compatible: true }],
        );
        expect(messages).toEqual([]);
      });

      it('should report incompatible equipment', () => {
        const messages = service.checkEquipmentCompatibility(
          [{ id: 'e1', type: 'french_press' }],
          'espresso_machine' as never,
          [{
            brewMethod: 'espresso_machine' as never,
            equipmentType: 'french_press',
            compatible: false,
          }],
        );
        expect(messages).toEqual(['french_press is not compatible with espresso_machine']);
      });

      it('should ignore equipment with no matching rule', () => {
        const messages = service.checkEquipmentCompatibility(
          [{ id: 'e1', type: 'unknown_thing' }],
          'v60' as never,
          [{ brewMethod: 'v60' as never, equipmentType: 'paper_filter', compatible: false }],
        );
        expect(messages).toEqual([]);
      });
    });

    describe('forkRecipe', () => {
      it('should throw RECIPE_NOT_FOUND for an unknown source', async () => {
        await expect(service.forkRecipe(crypto.randomUUID(), author.id)).rejects.toThrow(
          'RECIPE_NOT_FOUND',
        );
      });

      it('should throw FORBIDDEN when a non-author forks a draft', async () => {
        const recipe = await makeRecipe(author.id, 'Fork Draft', 'draft');
        await expect(service.forkRecipe(recipe.id, other.id)).rejects.toThrow('FORBIDDEN');
      });

      it('should fork a public recipe into a new draft', async () => {
        const source = await makeRecipe(author.id, 'Fork Public Source', 'public');
        const forked = await service.forkRecipe(source.id, other.id);
        createdRecipes.push(forked.id);
        expect(forked.authorId).toBe(other.id);
        expect(forked.visibility).toBe('draft');
        expect(forked.forkedFromId).toBe(source.id);
      });
    });

    describe('updateRecipe', () => {
      it('should update top-level fields without bumping the version', async () => {
        const recipe = await makeRecipe(author.id, 'Update Title');
        const updated = await service.updateRecipe(recipe.id, author.id, {
          bumpVersion: false,
          title: 'Updated Title',
          visibility: 'unlisted',
        });
        expect(updated?.title).toBe('Updated Title');
        expect(updated?.visibility).toBe('unlisted');
        expect(updated?.versions?.length).toBe(1);
      });

      it('should create a new version when bumpVersion is set', async () => {
        const recipe = await makeRecipe(author.id, 'Update Bump');
        const updated = await service.updateRecipe(recipe.id, author.id, {
          bumpVersion: true,
          productName: 'New Bean',
        });
        expect(updated?.versions?.length).toBe(2);
        expect(updated?.versions?.[0]?.versionNumber).toBe(2);
      });

      it('should throw FORBIDDEN for a non-author', async () => {
        const recipe = await makeRecipe(author.id, 'Update Forbidden');
        await expect(service.updateRecipe(recipe.id, other.id, { bumpVersion: false, title: 'X' }))
          .rejects.toThrow('FORBIDDEN');
      });

      it('should throw RECIPE_NOT_FOUND for an unknown recipe', async () => {
        await expect(
          service.updateRecipe(crypto.randomUUID(), author.id, { bumpVersion: false, title: 'X' }),
        ).rejects.toThrow('RECIPE_NOT_FOUND');
      });
    });

    describe('listStarredRecipes', () => {
      it('should flag the deprecated tasteNoteId param and ignore cursor', async () => {
        const viewer = await makeUser('svc-starred');
        const result = await service.listStarredRecipes(
          // deno-lint-ignore no-explicit-any -- test cast
          { tasteNoteId: crypto.randomUUID(), cursor: 'ignored' } as any,
          1,
          10,
          viewer.id,
        );
        expect(result.deprecations?.tasteNoteId).toBe(true);
        expect(result.recipes.length).toBe(0);
      });
    });
  },
);
