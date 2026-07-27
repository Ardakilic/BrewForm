import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@brewform/db';
import {
  equipment,
  recipeAdditionalPreparations,
  recipeEquipment,
  recipes,
  recipeTasteNotes,
  recipeVersionPhotos,
  recipeVersions,
  tasteNotes,
  userBadges,
  users,
} from '@brewform/db/schema';
import { RecipeCreateSchema } from '@brewform/shared/schemas';
import * as service from './service.ts';
import { evaluateBadges } from '../badge/service.ts';

describe('createRecipe (integration)', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let tasteNoteId: string;
  let equipmentId: string;
  const createdRecipeIds: string[] = [];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    tasteNoteId = crypto.randomUUID();
    equipmentId = crypto.randomUUID();

    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });

    await db.insert(tasteNotes).values({
      id: tasteNoteId,
      name: `Service Test Note ${tasteNoteId.slice(0, 8)}`,
    });

    await db.insert(equipment).values({
      id: equipmentId,
      name: `Service Test Grinder ${equipmentId.slice(0, 8)}`,
      type: 'grinder',
      isSystem: false,
      createdBy: userId,
    });
  });

  afterEach(async () => {
    if (createdRecipeIds.length) {
      const versionIdsSubquery = db.select({ id: recipeVersions.id }).from(
        recipeVersions,
      ).where(inArray(recipeVersions.recipeId, createdRecipeIds));

      await db.delete(recipeTasteNotes).where(
        inArray(recipeTasteNotes.recipeVersionId, versionIdsSubquery),
      );
      await db.delete(recipeEquipment).where(
        inArray(recipeEquipment.recipeVersionId, versionIdsSubquery),
      );
      await db.delete(recipeAdditionalPreparations).where(
        inArray(recipeAdditionalPreparations.recipeVersionId, versionIdsSubquery),
      );
      await db.delete(recipeVersionPhotos).where(
        inArray(recipeVersionPhotos.recipeVersionId, versionIdsSubquery),
      );
      await db.delete(recipeVersions).where(
        inArray(recipeVersions.recipeId, createdRecipeIds),
      );
      await db.delete(recipes).where(inArray(recipes.id, createdRecipeIds));
      createdRecipeIds.length = 0;
    }

    await db.delete(tasteNotes).where(eq(tasteNotes.id, tasteNoteId));
    await db.delete(equipment).where(eq(equipment.id, equipmentId));
    // `createRecipe` triggers `evaluateBadges()` as a non-awaited (fire-and-forget) side effect
    // (see apps/api/src/modules/recipe/service.ts), which asynchronously inserts `user_badge` rows.
    // Awaiting it here drains that in-flight insert (its own write is idempotent via
    // onConflictDoNothing) so the rows have settled before we delete them and the user — otherwise a
    // late insert races the user delete and violates the `user_badge -> user` foreign key.
    await evaluateBadges(userId);
    await db.delete(userBadges).where(eq(userBadges.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('returns the rich findById shape end-to-end', async () => {
    const data = RecipeCreateSchema.parse({
      title: 'Test Recipe',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      preparationNotes: 'Bloom 45s',
      tasteNoteIds: [tasteNoteId],
      equipmentIds: [equipmentId],
    });

    const result = await service.createRecipe(userId, data);
    expect(result).toBeDefined();
    createdRecipeIds.push(result!.id);

    expect(result!.author.id).toBe(userId);
    expect(result!.versions.length).toBe(1);
    expect(result!.versions[0].versionNumber).toBe(1);
    expect(result!.currentVersionId).toBe(result!.versions[0].id);
    expect(Array.isArray(result!.versions[0].tasteNotes)).toBe(true);
    expect(result!.versions[0].tasteNotes.length).toBeGreaterThan(0);
    expect(result!.versions[0].tasteNotes[0].tasteNote).toBeDefined();
    expect(result!.versions[0].tasteNotes[0].tasteNote.id).toBe(tasteNoteId);
    expect(Array.isArray(result!.versions[0].equipment)).toBe(true);
    expect(result!.versions[0].equipment.length).toBeGreaterThan(0);
    expect(result!.versions[0].equipment[0].equipment).toBeDefined();
    expect(result!.versions[0].equipment[0].equipment.id).toBe(equipmentId);
    expect(result!.forkedFrom).toBeNull();
    expect(Array.isArray(result!.photos)).toBe(true);
  });

  it('sanitizes the title and generates a slug', async () => {
    const data = RecipeCreateSchema.parse({
      title: '  My  Test  Recipe  ',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      preparationNotes: 'Bloom 45s',
    });

    const result = await service.createRecipe(userId, data);
    expect(result).toBeDefined();
    createdRecipeIds.push(result!.id);

    expect(result!.title).toBe('My Test Recipe');
    expect(result!.slug).toBe('my-test-recipe');
  });

  it('computes brewRatio and flowRate from raw measurements', async () => {
    const data = RecipeCreateSchema.parse({
      title: 'Ratio Test Recipe',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      preparationNotes: 'Bloom 45s',
      groundWeightGrams: 15,
      extractionVolumeMl: 250,
      extractionTimeSeconds: 150,
    });

    const result = await service.createRecipe(userId, data);
    expect(result).toBeDefined();
    createdRecipeIds.push(result!.id);

    expect(result!.versions[0].brewRatio).toBeCloseTo(250 / 15, 5);
    expect(result!.versions[0].flowRate).toBeCloseTo(250 / 150, 5);
  });

  it('creates with taste notes and intensities', async () => {
    const data = RecipeCreateSchema.parse({
      title: 'Intensity Test Recipe',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      preparationNotes: 'Bloom 45s',
      tasteNoteIds: [tasteNoteId],
      tasteNoteIntensities: { [tasteNoteId]: 3 },
    });

    const result = await service.createRecipe(userId, data);
    expect(result).toBeDefined();
    createdRecipeIds.push(result!.id);

    expect(result!.versions[0].tasteNotes.length).toBe(1);
    expect(result!.versions[0].tasteNotes[0].intensity).toBe(3);
  });

  it('throws on empty title', async () => {
    const data = RecipeCreateSchema.parse({
      title: '   ',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      preparationNotes: 'Bloom 45s',
    });

    let threw = false;
    try {
      await service.createRecipe(userId, data);
    } catch (err) {
      threw = true;
      expect((err as Error).message).toContain('Title cannot be empty');
    }
    expect(threw).toBe(true);
  });
});
