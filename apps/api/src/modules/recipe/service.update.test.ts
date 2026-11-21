/**
 * DB-backed regression tests for `updateRecipe` (recipe-write: every data-loss path fixed by
 * wave 6). Payloads go through `RecipeUpdateSchema.parse`, exactly as the PATCH route's
 * validator does, so a default injected by the schema would show up here.
 */
import '../../test-setup.ts';
import { db } from '@brewform/db';
import { recipes, recipeVersionPhotos } from '@brewform/db/schema';
import { RecipeCreateSchema, RecipeUpdateSchema } from '@brewform/shared/schemas';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '../../utils/errors.ts';
import * as service from './service.ts';
import { RecipeWriteFixtures } from './test-helpers.ts';

/** The rich recipe most tests start from. */
interface RichRecipe {
  recipeId: string;
  versionId: string;
  t1: string;
  t2: string;
  e1: string;
  photoId: string;
  variety: { id: string; name: string };
}

describe('updateRecipe (integration)', () => {
  const fixtures = new RecipeWriteFixtures();
  let authorId: string;

  beforeEach(async () => {
    authorId = (await fixtures.user('upd-svc')).id;
  });

  afterEach(async () => {
    await fixtures.cleanup();
  });

  /** Run a payload through the route's schema, then `updateRecipe`, as the author. */
  function update(recipeId: string, payload: Record<string, unknown>) {
    return service.updateRecipe(recipeId, authorId, RecipeUpdateSchema.parse(payload));
  }

  /**
   * Create a public recipe through the service: taste notes T1 (intensity 3) and T2 (2),
   * equipment E1, one preparation, `tds` 1.35, a coffee variety, `grindSize` "fine",
   * `isFavourite: true`, then link one photo to its version.
   */
  async function createRich(extra: Record<string, unknown> = {}): Promise<RichRecipe> {
    const t1 = await fixtures.tasteNote();
    const t2 = await fixtures.tasteNote();
    const e1 = await fixtures.equipmentItem();
    const variety = await fixtures.variety('Gesha');
    const created = await service.createRecipe(
      authorId,
      RecipeCreateSchema.parse({
        title: `Rich ${crypto.randomUUID().slice(0, 8)}`,
        visibility: 'public',
        brewMethod: 'v60',
        drinkType: 'pour_over',
        preparationNotes: 'Bloom 45s',
        personalNotes: 'Bright',
        grinder: 'Comandante',
        grindSize: 'fine',
        tds: 1.35,
        coffeeVarietyId: variety.id,
        isFavourite: true,
        tasteNoteIds: [t1, t2],
        tasteNoteIntensities: { [t1]: 3, [t2]: 2 },
        equipmentIds: [e1],
        additionalPreparations: [
          { name: 'Milk', type: 'milk', inputAmount: '100ml', preparationType: 'steamed' },
        ],
        ...extra,
      }),
    );
    const recipeId = created!.id;
    const versionId = created!.currentVersionId!;
    const photoId = await fixtures.photo(recipeId);
    await db
      .insert(recipeVersionPhotos)
      .values({ recipeVersionId: versionId, photoId, sortOrder: 0 });
    return { recipeId, versionId, t1, t2, e1, photoId, variety };
  }

  /** The current version of an updated recipe. */
  function currentOf(recipe: Awaited<ReturnType<typeof service.updateRecipe>>) {
    const current = recipe!.versions.find((v) => v.id === recipe!.currentVersionId);
    if (!current) throw new Error('current version missing');
    return current;
  }

  /** Expect `promise` to reject with a ValidationError carrying a detail for `field`. */
  async function expectValidationError(promise: Promise<unknown>, field: string) {
    const err = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).details?.map((d) => d.field)).toContain(field);
  }

  it('persists a grindSize edit without a bump (amend)', async () => {
    const rich = await createRich();
    const updated = await update(rich.recipeId, { grindSize: 'medium' });

    expect(updated!.versions).toHaveLength(1);
    expect(updated!.currentVersionId).toBe(rich.versionId);
    expect(currentOf(updated).grindSize).toBe('medium');
  });

  it('keeps taste notes with intensities, equipment, preparations, photos, tds and variety on a bump', async () => {
    const rich = await createRich();
    const updated = await update(rich.recipeId, { grindSize: 'medium', bumpVersion: true });

    expect(updated!.versions).toHaveLength(2);
    const current = currentOf(updated);
    expect(current.versionNumber).toBe(2);
    expect(current.grindSize).toBe('medium');
    expect(current.tds).toBe('1.35');
    expect(current.coffeeVarietyId).toBe(rich.variety.id);
    expect(current.coffeeVarietyName).toBe(rich.variety.name);
    expect(current.grinder).toBe('Comandante');
    expect(current.personalNotes).toBe('Bright');
    const intensities = Object.fromEntries(
      current.tasteNotes.map((tn) => [tn.tasteNoteId, tn.intensity]),
    );
    expect(intensities).toEqual({ [rich.t1]: 3, [rich.t2]: 2 });
    expect(current.equipment.map((e) => e.equipmentId)).toEqual([rich.e1]);
    expect(current.additionalPreparations.map((p) => p.name)).toEqual(['Milk']);
    expect(current.versionPhotos.map((vp) => vp.photoId)).toEqual([rich.photoId]);
  });

  it('replaces relations on a bump when they are provided and leaves version 1 unchanged', async () => {
    const rich = await createRich();
    const before = await fixtures.snapshot(rich.versionId);
    const updated = await update(rich.recipeId, {
      bumpVersion: true,
      tasteNoteIds: [rich.t2],
      tasteNoteIntensities: { [rich.t2]: 1 },
      equipmentIds: [],
    });

    const current = currentOf(updated);
    expect(current.tasteNotes.map((tn) => [tn.tasteNoteId, tn.intensity])).toEqual([[rich.t2, 1]]);
    expect(current.equipment).toEqual([]);
    expect(current.versionPhotos.map((vp) => vp.photoId)).toEqual([rich.photoId]);
    expect(await fixtures.snapshot(rich.versionId)).toEqual(before);
  });

  it('persists tds and a coffee variety set on an amend', async () => {
    const rich = await createRich();
    const variety = await fixtures.variety('Sidra');
    const updated = await update(rich.recipeId, { tds: 1.25, coffeeVarietyId: variety.id });

    const current = currentOf(updated);
    expect(updated!.versions).toHaveLength(1);
    expect(current.tds).toBe('1.25');
    expect(current.coffeeVarietyId).toBe(variety.id);
    expect(current.coffeeVarietyName).toBe(variety.name);
  });

  it('carries tds and the coffee variety through a bump and then a fork', async () => {
    const rich = await createRich();
    await update(rich.recipeId, { bumpVersion: true, grindSize: 'medium' });
    const forker = await fixtures.user('upd-svc-forker');

    const fork = await service.forkRecipe(rich.recipeId, forker.id);
    expect(fork.versions[0].tds).toBe('1.35');
    expect(fork.versions[0].coffeeVarietyId).toBe(rich.variety.id);
    expect(fork.versions[0].coffeeVarietyName).toBe(rich.variety.name);
    expect(fork.versions[0].rating).toBeNull();
    expect(fork.versions[0].isFavourite).toBe(false);
  });

  it('lets two concurrent bumps both succeed with consecutive version numbers', async () => {
    const rich = await createRich();
    const results = await Promise.all([
      update(rich.recipeId, { bumpVersion: true, grindSize: 'a' }),
      update(rich.recipeId, { bumpVersion: true, grindSize: 'b' }),
    ]);
    expect(results.every((r) => r?.id === rich.recipeId)).toBe(true);
    expect(await fixtures.versionNumbers(rich.recipeId)).toEqual([1, 2, 3]);
  });

  it('keeps a public recipe public on a title-only update', async () => {
    const rich = await createRich();
    const updated = await update(rich.recipeId, { title: 'New title' });

    expect(updated!.title).toBe('New title');
    expect(updated!.visibility).toBe('public');
  });

  it('keeps isFavourite and visibility on a bump that omits them', async () => {
    const rich = await createRich();
    const updated = await update(rich.recipeId, { grindSize: 'medium', bumpVersion: true });

    expect(currentOf(updated).isFavourite).toBe(true);
    expect(updated!.visibility).toBe('public');
  });

  it('keeps isFavourite and visibility on an amend that omits them', async () => {
    const rich = await createRich();
    const updated = await update(rich.recipeId, { grindSize: 'medium', bumpVersion: false });

    expect(currentOf(updated).isFavourite).toBe(true);
    expect(updated!.visibility).toBe('public');
  });

  it('applies explicit visibility and isFavourite values', async () => {
    const rich = await createRich();
    const updated = await update(rich.recipeId, { visibility: 'private', isFavourite: false });

    expect(updated!.visibility).toBe('private');
    expect(currentOf(updated).isFavourite).toBe(false);
  });

  it('clears values with null and relations with []', async () => {
    const rich = await createRich();
    const updated = await update(rich.recipeId, {
      grinder: null,
      tds: null,
      coffeeVarietyId: null,
      personalNotes: null,
      tasteNoteIds: [],
      equipmentIds: [],
    });

    const current = currentOf(updated);
    expect(current.grinder).toBeNull();
    expect(current.tds).toBeNull();
    expect(current.coffeeVarietyId).toBeNull();
    expect(current.coffeeVarietyName).toBeNull();
    expect(current.personalNotes).toBeNull();
    expect(current.tasteNotes).toEqual([]);
    expect(current.equipment).toEqual([]);
    expect(current.additionalPreparations).toHaveLength(1);
  });

  it('stores brewer notes that are empty after sanitization as NULL', async () => {
    const rich = await createRich();
    const updated = await update(rich.recipeId, { personalNotes: '<b></b>' });
    expect(currentOf(updated).personalNotes).toBeNull();
  });

  it('rejects an empty sanitized title on a bump and leaves no orphan version', async () => {
    const rich = await createRich();
    await expectValidationError(
      update(rich.recipeId, { title: '<b></b>', bumpVersion: true }),
      'title',
    );
    expect(await fixtures.versionNumbers(rich.recipeId)).toEqual([1]);
  });

  it('rejects a cross-field violation on the merged values and writes nothing', async () => {
    const rich = await createRich({ roastDate: '2026-11-10' });
    const before = await fixtures.snapshot(rich.versionId);

    await expectValidationError(update(rich.recipeId, { grindDate: '2026-11-01' }), 'grindDate');
    expect(await fixtures.snapshot(rich.versionId)).toEqual(before);
  });

  it('rejects clearing the extraction time while a pre-infusion time is stored', async () => {
    const rich = await createRich({ preInfusionTimeSeconds: 5, extractionTimeSeconds: 30 });
    await expectValidationError(
      update(rich.recipeId, { extractionTimeSeconds: null }),
      'preInfusionTimeSeconds',
    );
  });

  it('accepts a pre-infusion time when the stored extraction time is longer', async () => {
    const rich = await createRich({ extractionTimeSeconds: 30 });
    const updated = await update(rich.recipeId, { preInfusionTimeSeconds: 5 });
    expect(currentOf(updated).preInfusionTimeSeconds).toBe(5);
  });

  it.each([
    ['coffeeVarietyId', () => ({ coffeeVarietyId: crypto.randomUUID() })],
    ['tasteNoteIds', () => ({ tasteNoteIds: [crypto.randomUUID()] })],
  ] as const)('rejects an unknown %s before any write', async (field, payload) => {
    const rich = await createRich();
    const before = await fixtures.snapshot(rich.versionId);

    await expectValidationError(update(rich.recipeId, payload()), field);
    expect(await fixtures.snapshot(rich.versionId)).toEqual(before);
    expect(await fixtures.versionNumbers(rich.recipeId)).toEqual([1]);
  });

  it('rejects a soft-deleted coffee variety', async () => {
    const rich = await createRich();
    const deleted = await fixtures.variety('Retired', { deleted: true });
    await expectValidationError(
      update(rich.recipeId, { coffeeVarietyId: deleted.id, bumpVersion: true }),
      'coffeeVarietyId',
    );
    expect(await fixtures.versionNumbers(rich.recipeId)).toEqual([1]);
  });

  it("rejects another user's bean before any write", async () => {
    const rich = await createRich();
    const stranger = await fixtures.user('upd-svc-stranger');
    const foreignBean = await fixtures.bean(stranger.id);
    const before = await fixtures.snapshot(rich.versionId);

    await expectValidationError(update(rich.recipeId, { beanId: foreignBean }), 'beanId');
    expect(await fixtures.snapshot(rich.versionId)).toEqual(before);
  });

  it("links the author's own bean and a new coffee variety", async () => {
    const rich = await createRich();
    const bean = await fixtures.bean(authorId);
    const variety = await fixtures.variety('Pink Bourbon');
    const updated = await update(rich.recipeId, {
      beanId: bean,
      coffeeVarietyId: variety.id,
      bumpVersion: true,
    });
    const current = currentOf(updated);
    expect(current.beanId).toBe(bean);
    expect(current.coffeeVarietyId).toBe(variety.id);
    expect(current.coffeeVarietyName).toBe(variety.name);
  });

  it('fills grinder and brewerDetails from setupId only when they are absent', async () => {
    const rich = await createRich({ brewerDetails: 'Hario V60' });
    const setupId = await fixtures.setup(authorId, { grinder: 'Niche', brewerDetails: 'Origami' });

    const filled = await update(rich.recipeId, { setupId });
    expect(currentOf(filled).grinder).toBe('Niche');
    expect(currentOf(filled).brewerDetails).toBe('Origami');

    const explicit = await update(rich.recipeId, { setupId, grinder: 'Kinu' });
    expect(currentOf(explicit).grinder).toBe('Kinu');
    expect(currentOf(explicit).brewerDetails).toBe('Origami');
  });

  it('recomputes brewRatio and flowRate from the merged measurements', async () => {
    const rich = await createRich({
      groundWeightGrams: 15,
      extractionVolumeMl: 250,
      extractionTimeSeconds: 150,
    });
    const updated = await update(rich.recipeId, { groundWeightGrams: 20 });
    expect(currentOf(updated).brewRatio).toBeCloseTo(250 / 20, 5);
    expect(currentOf(updated).flowRate).toBeCloseTo(250 / 150, 5);
  });

  it('uses the payload brewDate on a bump and keeps the stored one on an amend', async () => {
    const rich = await createRich({ brewDate: '2026-10-01' });
    const amended = await update(rich.recipeId, { grindSize: 'medium' });
    expect(currentOf(amended).brewDate.toISOString().slice(0, 10)).toBe('2026-10-01');

    const bumped = await update(rich.recipeId, { bumpVersion: true, brewDate: '2026-11-02' });
    expect(currentOf(bumped).brewDate.toISOString().slice(0, 10)).toBe('2026-11-02');
  });

  it('sets recipes.updatedAt on every successful update', async () => {
    const rich = await createRich();
    const [before] = await db.select().from(recipes).where(eq(recipes.id, rich.recipeId));
    await update(rich.recipeId, { grindSize: 'medium' });
    const [after] = await db.select().from(recipes).where(eq(recipes.id, rich.recipeId));
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });
});
