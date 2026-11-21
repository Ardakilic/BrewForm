/**
 * DB-backed tests for `updateRecipeWithVersion` (recipe-write: "Edits without a version bump
 * amend the current version", "Version bumps create a complete new version atomically").
 *
 * Every recipe and reference row is created through {@link RecipeWriteFixtures} and deleted in
 * `afterEach`.
 */
import '../../test-setup.ts';
import { db } from '@brewform/db';
import { recipes, recipeVersionPhotos, recipeVersions } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as model from './model.ts';
import { RecipeWriteFixtures } from './test-helpers.ts';

/** The rich recipe every test starts from. */
interface SeededRecipe {
  recipeId: string;
  versionId: string;
  tasteNotes: [string, string, string];
  equipment: [string, string];
  photos: [string, string];
}

describe('updateRecipeWithVersion', () => {
  const fixtures = new RecipeWriteFixtures();
  let authorId: string;

  beforeEach(async () => {
    authorId = (await fixtures.user('upd-model')).id;
  });

  afterEach(async () => {
    await fixtures.cleanup();
  });

  /**
   * Create a recipe whose only version links taste notes T1 (intensity 3) and T2 (2),
   * equipment E1, preparations A and B, and photos P1 and P2, with `tds` 1.35. T3 and E2 exist
   * but are not linked.
   */
  async function seed(): Promise<SeededRecipe> {
    const t1 = await fixtures.tasteNote();
    const t2 = await fixtures.tasteNote();
    const t3 = await fixtures.tasteNote();
    const e1 = await fixtures.equipmentItem();
    const e2 = await fixtures.equipmentItem();
    const created = await model.createRecipeWithRelations({
      authorId,
      slugCandidates: [`upd-model-${crypto.randomUUID().slice(0, 8)}`],
      title: 'Model update',
      visibility: 'public',
      productName: 'Finca',
      coffeeBrand: null,
      coffeeProcessing: null,
      vendorId: null,
      roastDate: null,
      packageOpenDate: null,
      grindDate: null,
      brewDate: new Date('2026-11-01T08:00:00.000Z'),
      brewMethod: 'v60',
      drinkType: 'pour_over',
      brewerDetails: null,
      grinder: 'Comandante',
      grindSize: 'fine',
      groundWeightGrams: 15,
      extractionTimeSeconds: 150,
      extractionVolumeMl: 250,
      temperatureCelsius: 94,
      tds: '1.35',
      brewRatio: 16.7,
      flowRate: 1.7,
      preInfusionTimeSeconds: null,
      beanId: null,
      coffeeVarietyId: null,
      coffeeVarietyName: null,
      personalNotes: 'Bright',
      preparationNotes: 'Bloom',
      isFavourite: true,
      rating: 8,
      emojiTag: null,
      tasteNoteIds: [t1, t2],
      tasteNoteIntensities: { [t1]: 3, [t2]: 2 },
      equipmentIds: [e1],
      additionalPreparations: [
        { name: 'A', type: 'milk', inputAmount: '100ml', preparationType: 'steamed' },
        { name: 'B', type: 'syrup', inputAmount: '5ml', preparationType: 'stirred' },
      ],
    });
    const recipeId = created!.id;
    const versionId = created!.currentVersionId!;
    const p1 = await fixtures.photo(recipeId);
    const p2 = await fixtures.photo(recipeId);
    await db.insert(recipeVersionPhotos).values([
      { recipeVersionId: versionId, photoId: p1, sortOrder: 0 },
      { recipeVersionId: versionId, photoId: p2, sortOrder: 1 },
    ]);
    return { recipeId, versionId, tasteNotes: [t1, t2, t3], equipment: [e1, e2], photos: [p1, p2] };
  }

  /** Read a version row by id. */
  async function versionRow(versionId: string) {
    const [row] = await db.select().from(recipeVersions).where(eq(recipeVersions.id, versionId));
    return row;
  }

  /** Read a recipe row by id. */
  async function recipeRow(recipeId: string) {
    const [row] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
    return row;
  }

  /** Build an update input that keeps every stored value of `versionId` unless overridden. */
  async function input(
    seeded: SeededRecipe,
    mode: model.RecipeWriteMode,
    versionId: string,
    overrides: Omit<Partial<model.UpdateRecipeWithVersionInput>, 'version'> & {
      version?: Partial<model.RecipeVersionColumns>;
    } = {},
  ): Promise<model.UpdateRecipeWithVersionInput> {
    const { version, ...rest } = overrides;
    return {
      recipeId: seeded.recipeId,
      authorId,
      mode,
      title: 'Model update',
      visibility: 'public',
      version: { ...model.copyVersionColumns(await versionRow(versionId)), ...version },
      ...rest,
    };
  }

  it('amend updates the current version, replaces provided relations and keeps the rest', async () => {
    const seeded = await seed();
    const [t1, t2, t3] = seeded.tasteNotes;
    const [, e2] = seeded.equipment;

    const result = await model.updateRecipeWithVersion(
      await input(seeded, 'amend', seeded.versionId, {
        version: { grindSize: 'medium' },
        tasteNoteIds: [t2, t3],
        tasteNoteIntensities: { [t3]: 3 },
        equipmentIds: [e2],
      }),
    );

    expect(result!.currentVersionId).toBe(seeded.versionId);
    expect(await fixtures.versionNumbers(seeded.recipeId)).toEqual([1]);
    const after = await fixtures.snapshot(seeded.versionId);
    expect(after.row.grindSize).toBe('medium');
    expect(after.row.tds).toBe('1.35');
    expect(after.row.isFavourite).toBe(true);
    expect(after.tasteNotes).toHaveLength(2);
    expect(after.tasteNotes).toContainEqual({ tasteNoteId: t2, intensity: 2 });
    expect(after.tasteNotes).toContainEqual({ tasteNoteId: t3, intensity: 3 });
    expect(after.tasteNotes.some((tn) => tn.tasteNoteId === t1)).toBe(false);
    expect(after.equipmentIds).toEqual([e2]);
    expect(after.preparations.map((p) => p.name)).toEqual(['A', 'B']);
    expect(after.photos).toEqual([
      { photoId: seeded.photos[0], sortOrder: 0 },
      { photoId: seeded.photos[1], sortOrder: 1 },
    ]);
  });

  it('amend with [] removes every row of that relation', async () => {
    const seeded = await seed();
    await model.updateRecipeWithVersion(
      await input(seeded, 'amend', seeded.versionId, {
        tasteNoteIds: [],
        additionalPreparations: [],
      }),
    );
    const after = await fixtures.snapshot(seeded.versionId);
    expect(after.tasteNotes).toEqual([]);
    expect(after.preparations).toEqual([]);
    expect(after.equipmentIds).toEqual([seeded.equipment[0]]);
  });

  it('bump copies every relation with intensities and sortOrder and moves currentVersionId', async () => {
    const seeded = await seed();
    const before = await fixtures.snapshot(seeded.versionId);

    const result = await model.updateRecipeWithVersion(
      await input(seeded, 'bump', seeded.versionId, { version: { grindSize: 'coarse' } }),
    );

    expect(await fixtures.versionNumbers(seeded.recipeId)).toEqual([1, 2]);
    const newVersionId = result!.currentVersionId!;
    expect(newVersionId).not.toBe(seeded.versionId);
    const bumped = await fixtures.snapshot(newVersionId);
    expect(bumped.row.versionNumber).toBe(2);
    expect(bumped.row.grindSize).toBe('coarse');
    expect(bumped.row.tds).toBe('1.35');
    expect(bumped.row.isFavourite).toBe(true);
    expect(bumped.tasteNotes).toEqual(before.tasteNotes);
    expect(bumped.equipmentIds).toEqual(before.equipmentIds);
    expect(bumped.preparations).toEqual(before.preparations);
    expect(bumped.photos).toEqual(before.photos);
    expect(await fixtures.snapshot(seeded.versionId)).toEqual(before);
  });

  it('bump replaces relations when provided and leaves the previous version unchanged', async () => {
    const seeded = await seed();
    const [, , t3] = seeded.tasteNotes;
    const before = await fixtures.snapshot(seeded.versionId);

    const result = await model.updateRecipeWithVersion(
      await input(seeded, 'bump', seeded.versionId, {
        tasteNoteIds: [t3],
        tasteNoteIntensities: { [t3]: 2 },
        equipmentIds: [],
        additionalPreparations: [
          { name: 'C', type: 'water', inputAmount: '30ml', preparationType: 'poured' },
        ],
      }),
    );

    const bumped = await fixtures.snapshot(result!.currentVersionId!);
    expect(bumped.tasteNotes).toEqual([{ tasteNoteId: t3, intensity: 2 }]);
    expect(bumped.equipmentIds).toEqual([]);
    expect(bumped.preparations).toEqual([{ name: 'C', inputAmount: '30ml', sortOrder: 0 }]);
    expect(bumped.photos).toEqual(before.photos);
    expect(await fixtures.snapshot(seeded.versionId)).toEqual(before);
  });

  it('never touches an earlier version when the current version is amended', async () => {
    const seeded = await seed();
    const bumped = await model.updateRecipeWithVersion(
      await input(seeded, 'bump', seeded.versionId),
    );
    const v2 = bumped!.currentVersionId!;
    const v1Before = await fixtures.snapshot(seeded.versionId);

    await model.updateRecipeWithVersion(
      await input(seeded, 'amend', v2, {
        version: { grindSize: 'extra fine', tds: null },
        tasteNoteIds: [],
        equipmentIds: [seeded.equipment[1]],
      }),
    );

    expect(await fixtures.snapshot(seeded.versionId)).toEqual(v1Before);
    const v2After = await fixtures.snapshot(v2);
    expect(v2After.row.grindSize).toBe('extra fine');
    expect(v2After.row.tds).toBeNull();
  });

  it('updates the recipe title, visibility and updatedAt in the same transaction', async () => {
    const seeded = await seed();
    const before = await recipeRow(seeded.recipeId);
    await model.updateRecipeWithVersion(
      await input(seeded, 'amend', seeded.versionId, { title: 'Renamed', visibility: 'unlisted' }),
    );
    const after = await recipeRow(seeded.recipeId);
    expect(after.title).toBe('Renamed');
    expect(after.visibility).toBe('unlisted');
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it('a bump that fails mid-transaction leaves no version and no recipe change', async () => {
    const seeded = await seed();
    const recipeBefore = await recipeRow(seeded.recipeId);

    // The version insert succeeds, then the equipment insert violates its foreign key.
    await expect(
      model.updateRecipeWithVersion(
        await input(seeded, 'bump', seeded.versionId, {
          title: 'Should not stick',
          equipmentIds: [crypto.randomUUID()],
        }),
      ),
    ).rejects.toThrow();

    expect(await fixtures.versionNumbers(seeded.recipeId)).toEqual([1]);
    const recipeAfter = await recipeRow(seeded.recipeId);
    expect(recipeAfter.title).toBe(recipeBefore.title);
    expect(recipeAfter.currentVersionId).toBe(seeded.versionId);
  });

  it('an amend that fails mid-transaction leaves the current version and relations unchanged', async () => {
    const seeded = await seed();
    const before = await fixtures.snapshot(seeded.versionId);

    // The version update and the taste-note delete succeed, then the insert violates its FK.
    await expect(
      model.updateRecipeWithVersion(
        await input(seeded, 'amend', seeded.versionId, {
          version: { grindSize: 'should not stick' },
          tasteNoteIds: [crypto.randomUUID()],
        }),
      ),
    ).rejects.toThrow();

    expect(await fixtures.snapshot(seeded.versionId)).toEqual(before);
  });

  it('two concurrent bumps both succeed with consecutive version numbers', async () => {
    const seeded = await seed();
    const [a, b] = await Promise.all([
      input(seeded, 'bump', seeded.versionId, { version: { grindSize: 'a' } }),
      input(seeded, 'bump', seeded.versionId, { version: { grindSize: 'b' } }),
    ]);

    const results = await Promise.all([
      model.updateRecipeWithVersion(a),
      model.updateRecipeWithVersion(b),
    ]);

    expect(results.every((r) => r !== undefined)).toBe(true);
    expect(await fixtures.versionNumbers(seeded.recipeId)).toEqual([1, 2, 3]);
    const recipe = await recipeRow(seeded.recipeId);
    const current = await versionRow(recipe.currentVersionId!);
    expect(current.versionNumber).toBe(3);
  });

  it('throws RECIPE_NOT_FOUND for a soft-deleted recipe', async () => {
    const seeded = await seed();
    await db.update(recipes).set({ deletedAt: new Date() }).where(eq(recipes.id, seeded.recipeId));
    await expect(
      model.updateRecipeWithVersion(await input(seeded, 'amend', seeded.versionId)),
    ).rejects.toThrow('RECIPE_NOT_FOUND');
  });
});
