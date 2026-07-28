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
import * as model from './model.ts';
import { getMergedIds, getMergedPreparations, mergeRecipes } from './service.ts';
import { evaluateBadges } from '../badge/service.ts';

describe('getMergedIds', () => {
  const list1 = [{ tasteNoteId: 'a' }, { tasteNoteId: 'b' }];
  const list2 = [{ tasteNoteId: 'b' }, { tasteNoteId: 'c' }];

  it('returns v1 ids for choice v1', () => {
    expect(getMergedIds(list1, list2, 'v1', 'tasteNoteId')).toEqual(['a', 'b']);
  });

  it('returns v2 ids for choice v2', () => {
    expect(getMergedIds(list1, list2, 'v2', 'tasteNoteId')).toEqual(['b', 'c']);
  });

  it('deduplicates for choice both', () => {
    expect(getMergedIds(list1, list2, 'both', 'tasteNoteId')).toEqual(['a', 'b', 'c']);
  });

  it('returns empty for choice none', () => {
    expect(getMergedIds(list1, list2, 'none', 'tasteNoteId')).toEqual([]);
  });

  it('returns empty for undefined choice', () => {
    expect(getMergedIds(list1, list2, undefined, 'tasteNoteId')).toEqual([]);
  });

  it('handles undefined lists', () => {
    expect(getMergedIds(undefined, undefined, 'both', 'tasteNoteId')).toEqual([]);
  });
});

describe('getMergedPreparations', () => {
  const v1 = { additionalPreparations: [{ name: 'p1' }] };
  const v2 = { additionalPreparations: [{ name: 'p2' }] };

  it('returns v1 preparations for choice v1', () => {
    expect(getMergedPreparations(v1, v2, 'v1')).toEqual([{ name: 'p1' }]);
  });

  it('returns v2 preparations for choice v2', () => {
    expect(getMergedPreparations(v1, v2, 'v2')).toEqual([{ name: 'p2' }]);
  });

  it('concatenates for choice both', () => {
    expect(getMergedPreparations(v1, v2, 'both')).toEqual([{ name: 'p1' }, { name: 'p2' }]);
  });

  it('returns empty for choice none', () => {
    expect(getMergedPreparations(v1, v2, 'none')).toEqual([]);
  });

  it('returns empty for undefined choice', () => {
    expect(getMergedPreparations(v1, v2, undefined)).toEqual([]);
  });

  it('handles missing additionalPreparations', () => {
    expect(getMergedPreparations({}, {}, 'both')).toEqual([]);
  });
});

describe(
  'mergeRecipes',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    let userId: string;
    let recipeId1: string;
    let recipeId2: string;
    let versionId1: string;
    let versionId2: string;
    let tn1: string;
    let tn2: string;
    let tn3: string;
    let eq1: string;
    let eq2: string;
    const createdRecipeIds: string[] = [];

    beforeEach(async () => {
      userId = crypto.randomUUID();
      recipeId1 = crypto.randomUUID();
      recipeId2 = crypto.randomUUID();
      versionId1 = crypto.randomUUID();
      versionId2 = crypto.randomUUID();
      tn1 = crypto.randomUUID();
      tn2 = crypto.randomUUID();
      tn3 = crypto.randomUUID();
      eq1 = crypto.randomUUID();
      eq2 = crypto.randomUUID();

      await db.insert(users).values({
        id: userId,
        email: `merge-${userId}@example.com`,
        username: `merge-${userId.slice(0, 8)}`,
        passwordHash: 'hash',
        emailVerifiedAt: new Date(),
      });

      await db.insert(tasteNotes).values([
        { id: tn1, name: `Note ${tn1.slice(0, 8)}` },
        { id: tn2, name: `Note ${tn2.slice(0, 8)}` },
        { id: tn3, name: `Note ${tn3.slice(0, 8)}` },
      ]);

      await db.insert(equipment).values([
        { id: eq1, name: `Eq ${eq1.slice(0, 8)}`, type: 'grinder' },
        { id: eq2, name: `Eq ${eq2.slice(0, 8)}`, type: 'grinder' },
      ]);

      await db.insert(recipes).values([
        {
          id: recipeId1,
          slug: `merge-r1-${recipeId1.slice(0, 8)}`,
          title: 'Source V1',
          authorId: userId,
          visibility: 'public',
        },
        {
          id: recipeId2,
          slug: `merge-r2-${recipeId2.slice(0, 8)}`,
          title: 'Source V2',
          authorId: userId,
          visibility: 'public',
        },
      ]);

      await db.insert(recipeVersions).values({
        id: versionId1,
        recipeId: recipeId1,
        versionNumber: 1,
        brewMethod: 'v60',
        drinkType: 'pour_over',
        grindSize: 'medium',
        groundWeightGrams: 18,
        extractionTimeSeconds: 180,
        extractionVolumeMl: 300,
        temperatureCelsius: 93,
        brewerDetails: 'Hario V60',
        grinder: 'Comandante',
        preparationNotes: 'Bloom 30s',
        personalNotes: 'v1 notes',
        brewDate: new Date(),
        isFavourite: false,
      });
      await db.insert(recipeVersions).values({
        id: versionId2,
        recipeId: recipeId2,
        versionNumber: 1,
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
        grindSize: 'fine',
        groundWeightGrams: 20,
        extractionTimeSeconds: 30,
        extractionVolumeMl: 40,
        temperatureCelsius: 94,
        brewerDetails: 'Linea Mini',
        grinder: 'Niche Zero',
        preparationNotes: 'WDT + tamp',
        personalNotes: 'v2 notes',
        brewDate: new Date(),
        isFavourite: false,
      });

      await db.insert(recipeTasteNotes).values([
        { recipeVersionId: versionId1, tasteNoteId: tn1, intensity: 1 },
        { recipeVersionId: versionId1, tasteNoteId: tn2, intensity: 1 },
        { recipeVersionId: versionId2, tasteNoteId: tn2, intensity: 1 },
        { recipeVersionId: versionId2, tasteNoteId: tn3, intensity: 1 },
      ]);

      await db.insert(recipeEquipment).values([
        { recipeVersionId: versionId1, equipmentId: eq1 },
        { recipeVersionId: versionId2, equipmentId: eq2 },
      ]);

      await db.insert(recipeAdditionalPreparations).values([
        {
          recipeVersionId: versionId1,
          name: 'prep1',
          type: 'other',
          inputAmount: '10g',
          preparationType: 'rinse',
          sortOrder: 0,
        },
        {
          recipeVersionId: versionId2,
          name: 'prep2',
          type: 'other',
          inputAmount: '5g',
          preparationType: 'rinse',
          sortOrder: 0,
        },
      ]);
    });

    afterEach(async () => {
      if (createdRecipeIds.length) {
        const versionIdsSubquery = db.select({ id: recipeVersions.id }).from(recipeVersions)
          .where(inArray(recipeVersions.recipeId, createdRecipeIds));
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

      const srcVersionIds = [versionId1, versionId2];
      await db.delete(recipeTasteNotes).where(
        inArray(recipeTasteNotes.recipeVersionId, srcVersionIds),
      );
      await db.delete(recipeEquipment).where(
        inArray(recipeEquipment.recipeVersionId, srcVersionIds),
      );
      await db.delete(recipeAdditionalPreparations).where(
        inArray(recipeAdditionalPreparations.recipeVersionId, srcVersionIds),
      );
      await db.delete(recipeVersions).where(
        inArray(recipeVersions.id, srcVersionIds),
      );
      await db.delete(recipes).where(inArray(recipes.id, [recipeId1, recipeId2]));
      await db.delete(tasteNotes).where(inArray(tasteNotes.id, [tn1, tn2, tn3]));
      await db.delete(equipment).where(inArray(equipment.id, [eq1, eq2]));
      await evaluateBadges(userId);
      await db.delete(userBadges).where(eq(userBadges.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    });

    it('creates a draft recipe with v1 field picks', async () => {
      const result = await mergeRecipes(userId, {
        recipeVersionId1: versionId1,
        recipeVersionId2: versionId2,
        title: 'Merged Recipe',
        selections: {
          brewMethod: 'v1',
          drinkType: 'v1',
          grindSize: 'v1',
          preparationNotes: 'v1',
        },
      });
      createdRecipeIds.push(result!.id);
      expect(result).toBeDefined();
      expect(result!.visibility).toBe('draft');
      const version = result!.versions?.[0];
      expect(version!.brewMethod).toBe('v60');
      expect(version!.drinkType).toBe('pour_over');
      expect(version!.grindSize).toBe('medium');
      expect(version!.preparationNotes).toBe('Bloom 30s');
    });

    it('picks v2 fields when selected', async () => {
      const result = await mergeRecipes(userId, {
        recipeVersionId1: versionId1,
        recipeVersionId2: versionId2,
        title: 'Merged V2',
        selections: {
          brewMethod: 'v2',
          drinkType: 'v2',
          grindSize: 'v2',
          grinder: 'v2',
        },
      });
      createdRecipeIds.push(result!.id);
      const version = result!.versions?.[0];
      expect(version!.brewMethod).toBe('espresso_machine');
      expect(version!.drinkType).toBe('espresso');
      expect(version!.grindSize).toBe('fine');
      expect(version!.grinder).toBe('Niche Zero');
    });

    it('deduplicates taste notes with both', async () => {
      const result = await mergeRecipes(userId, {
        recipeVersionId1: versionId1,
        recipeVersionId2: versionId2,
        title: 'Merged Both',
        selections: { tasteNotes: 'both', equipment: 'both' },
      });
      createdRecipeIds.push(result!.id);
      const version = result!.versions?.[0];
      expect(version!.tasteNotes!.length).toBe(3);
      expect(version!.equipment!.length).toBe(2);
    });

    it('returns empty arrays for none', async () => {
      const result = await mergeRecipes(userId, {
        recipeVersionId1: versionId1,
        recipeVersionId2: versionId2,
        title: 'Merged None',
        selections: { tasteNotes: 'none', equipment: 'none', additionalPreparations: 'none' },
      });
      createdRecipeIds.push(result!.id);
      const version = result!.versions?.[0];
      expect(version!.tasteNotes!.length).toBe(0);
      expect(version!.equipment!.length).toBe(0);
      expect(version!.additionalPreparations!.length).toBe(0);
    });

    it('throws RECIPE_NOT_FOUND for missing version', async () => {
      await expect(
        mergeRecipes(userId, {
          recipeVersionId1: versionId1,
          recipeVersionId2: crypto.randomUUID(),
          title: 'Should Fail',
          selections: {},
        }),
      ).rejects.toThrow('RECIPE_NOT_FOUND');
    });

    it('falls back to v1 for unselected required fields', async () => {
      const result = await mergeRecipes(userId, {
        recipeVersionId1: versionId1,
        recipeVersionId2: versionId2,
        title: 'Fallback Test',
        selections: {},
      });
      createdRecipeIds.push(result!.id);
      const version = result!.versions?.[0];
      expect(version!.brewMethod).toBe('v60');
      expect(version!.drinkType).toBe('pour_over');
    });

    it('throws FORBIDDEN when merging private recipes owned by another user', async () => {
      const otherUserId = crypto.randomUUID();
      const otherRecipeId = crypto.randomUUID();
      const otherVersionId = crypto.randomUUID();
      await db.insert(users).values({
        id: otherUserId,
        email: `other-${otherUserId}@example.com`,
        username: `other-${otherUserId.slice(0, 8)}`,
        passwordHash: 'hash',
      });
      await db.insert(recipes).values({
        id: otherRecipeId,
        slug: `merge-priv-${otherRecipeId.slice(0, 8)}`,
        title: 'Private Recipe',
        authorId: otherUserId,
        visibility: 'private',
      });
      await db.insert(recipeVersions).values({
        id: otherVersionId,
        recipeId: otherRecipeId,
        versionNumber: 1,
        brewMethod: 'v60',
        drinkType: 'pour_over',
        brewDate: new Date(),
        preparationNotes: 'secret',
        isFavourite: false,
      });

      try {
        await expect(
          mergeRecipes(userId, {
            recipeVersionId1: versionId1,
            recipeVersionId2: otherVersionId,
            title: 'Should Be Forbidden',
            selections: {},
          }),
        ).rejects.toThrow('FORBIDDEN');
      } finally {
        await db.delete(recipeVersions).where(eq(recipeVersions.id, otherVersionId));
        await db.delete(recipes).where(eq(recipes.id, otherRecipeId));
        await db.delete(users).where(eq(users.id, otherUserId));
      }
    });
  },
);

describe(
  'fetchRecipeVersionWithRelations',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    let userId: string;
    let recipeId: string;
    let versionId: string;

    beforeEach(async () => {
      userId = crypto.randomUUID();
      recipeId = crypto.randomUUID();
      versionId = crypto.randomUUID();
      await db.insert(users).values({
        id: userId,
        email: `fvwr-${userId}@example.com`,
        username: `fvwr-${userId.slice(0, 8)}`,
        passwordHash: 'hash',
      });
      await db.insert(recipes).values({
        id: recipeId,
        slug: `fvwr-${recipeId.slice(0, 8)}`,
        title: 'Version Test',
        authorId: userId,
        visibility: 'draft',
      });
      await db.insert(recipeVersions).values({
        id: versionId,
        recipeId,
        versionNumber: 1,
        brewMethod: 'v60',
        drinkType: 'pour_over',
        brewDate: new Date(),
        personalNotes: '',
        preparationNotes: '',
        isFavourite: false,
      });
    });

    afterEach(async () => {
      await db.delete(recipeVersions).where(eq(recipeVersions.id, versionId));
      await db.delete(recipes).where(eq(recipes.id, recipeId));
      await db.delete(users).where(eq(users.id, userId));
    });

    it('returns version with relations', async () => {
      const result = await model.fetchRecipeVersionWithRelations(versionId);
      expect(result).toBeDefined();
      expect(result!.id).toBe(versionId);
      expect(result!.brewMethod).toBe('v60');
      expect(Array.isArray(result!.tasteNotes)).toBe(true);
      expect(Array.isArray(result!.equipment)).toBe(true);
      expect(Array.isArray(result!.additionalPreparations)).toBe(true);
    });

    it('returns undefined for missing ID', async () => {
      const result = await model.fetchRecipeVersionWithRelations(crypto.randomUUID());
      expect(result).toBeUndefined();
    });
  },
);
