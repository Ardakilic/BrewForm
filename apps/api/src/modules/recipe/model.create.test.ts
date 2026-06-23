// deno-lint-ignore-file no-explicit-any require-await
import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@brewform/db';
import {
  equipment,
  photos,
  recipeAdditionalPreparations,
  recipeEquipment,
  recipes,
  recipeTasteNotes,
  recipeVersionPhotos,
  recipeVersions,
  tasteNotes,
  users,
} from '@brewform/db/schema';
import * as model from './model.ts';

describe('createRecipeWithRelations', { sanitizeOps: false, sanitizeResources: false }, () => {
  let user: { id: string };
  let tasteNote: { id: string };
  let equipmentRow: { id: string };
  const createdRecipeIds: string[] = [];
  const throwawayRecipeIds: string[] = [];
  const throwawayPhotoIds: string[] = [];

  beforeEach(async () => {
    const userId = crypto.randomUUID();
    const tasteNoteId = crypto.randomUUID();
    const equipmentId = crypto.randomUUID();

    await db.insert(users).values({
      id: userId,
      email: `create-${userId}@example.com`,
      username: `createuser-${userId.slice(0, 8)}`,
      passwordHash: 'hash',
    });

    await db.insert(tasteNotes).values({
      id: tasteNoteId,
      name: `Test Note ${tasteNoteId.slice(0, 8)}`,
    });

    await db.insert(equipment).values({
      id: equipmentId,
      name: `Test Grinder ${equipmentId.slice(0, 8)}`,
      type: 'grinder',
    });

    user = { id: userId };
    tasteNote = { id: tasteNoteId };
    equipmentRow = { id: equipmentId };
  });

  afterEach(async () => {
    for (const recipeId of createdRecipeIds) {
      const versionRows = await db.select({ id: recipeVersions.id })
        .from(recipeVersions)
        .where(eq(recipeVersions.recipeId, recipeId));
      const versionIds = versionRows.map((v) => v.id);

      if (versionIds.length) {
        await db.delete(recipeTasteNotes).where(
          inArray(recipeTasteNotes.recipeVersionId, versionIds),
        );
        await db.delete(recipeEquipment).where(
          inArray(recipeEquipment.recipeVersionId, versionIds),
        );
        await db.delete(recipeAdditionalPreparations).where(
          inArray(recipeAdditionalPreparations.recipeVersionId, versionIds),
        );
        await db.delete(recipeVersionPhotos).where(
          inArray(recipeVersionPhotos.recipeVersionId, versionIds),
        );
        await db.delete(recipeVersions).where(
          inArray(recipeVersions.id, versionIds),
        );
      }
      await db.delete(photos).where(eq(photos.recipeId, recipeId));
      await db.delete(recipes).where(eq(recipes.id, recipeId));
    }

    for (const photoId of throwawayPhotoIds) {
      await db.delete(recipeVersionPhotos).where(eq(recipeVersionPhotos.photoId, photoId));
      await db.delete(photos).where(eq(photos.id, photoId));
    }
    for (const recipeId of throwawayRecipeIds) {
      await db.delete(recipeVersions).where(eq(recipeVersions.recipeId, recipeId));
      await db.delete(recipes).where(eq(recipes.id, recipeId));
    }

    await db.delete(tasteNotes).where(eq(tasteNotes.id, tasteNote.id));
    await db.delete(equipment).where(eq(equipment.id, equipmentRow.id));
    await db.delete(users).where(eq(users.id, user.id));

    createdRecipeIds.length = 0;
    throwawayRecipeIds.length = 0;
    throwawayPhotoIds.length = 0;
  });

  function buildInput(
    overrides: Partial<model.CreateRecipeWithRelationsInput> = {},
  ): model.CreateRecipeWithRelationsInput {
    return {
      authorId: user.id,
      slug: `test-recipe-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Test Recipe',
      visibility: 'draft',
      roastDate: null,
      packageOpenDate: null,
      grindDate: null,
      brewDate: new Date(),
      brewMethod: 'v60',
      drinkType: 'pour_over',
      brewerDetails: 'Hario V60',
      grinder: 'Comandante',
      personalNotes: '',
      preparationNotes: 'Bloom 45s',
      isFavourite: false,
      preInfusionTimeSeconds: null,
      beanId: null,
      brewRatio: null,
      flowRate: null,
      ...overrides,
    };
  }

  it('inserts the recipe row with correct fields', async () => {
    const input = buildInput();
    const result = await model.createRecipeWithRelations(input);
    createdRecipeIds.push(result!.id);

    const [recipeRow] = await db.select().from(recipes).where(eq(recipes.id, result!.id));
    expect(recipeRow).toBeDefined();
    expect(recipeRow.slug).toBe(input.slug);
    expect(recipeRow.title).toBe(input.title);
    expect(recipeRow.authorId).toBe(input.authorId);
    expect(recipeRow.visibility).toBe(input.visibility);
    expect(recipeRow.currentVersionId).not.toBeNull();

    const [versionRow] = await db.select().from(recipeVersions).where(
      eq(recipeVersions.recipeId, result!.id),
    );
    expect(recipeRow.currentVersionId).toBe(versionRow.id);
    expect(recipeRow.likeCount).toBe(0);
    expect(recipeRow.commentCount).toBe(0);
    expect(recipeRow.forkCount).toBe(0);
    expect(recipeRow.featured).toBe(false);
  });

  it('inserts the version row with versionNumber 1 and all passed fields', async () => {
    const input = buildInput({
      productName: 'Test Beans',
      brewMethod: 'v60',
      drinkType: 'pour_over',
      brewRatio: 16.5,
      flowRate: 2.1,
      personalNotes: 'Sweet and bright',
      preparationNotes: 'Bloom 45s, then pour',
      isFavourite: true,
      rating: 8,
      emojiTag: 'fire',
      preInfusionTimeSeconds: 10,
      beanId: null,
    });
    const result = await model.createRecipeWithRelations(input);
    createdRecipeIds.push(result!.id);

    const [versionRow] = await db.select().from(recipeVersions).where(
      eq(recipeVersions.recipeId, result!.id),
    );
    expect(versionRow).toBeDefined();
    expect(versionRow.versionNumber).toBe(1);
    expect(versionRow.productName).toBe('Test Beans');
    expect(versionRow.brewMethod).toBe('v60');
    expect(versionRow.drinkType).toBe('pour_over');
    expect(versionRow.brewRatio).toBe(16.5);
    expect(versionRow.flowRate).toBe(2.1);
    expect(versionRow.personalNotes).toBe('Sweet and bright');
    expect(versionRow.preparationNotes).toBe('Bloom 45s, then pour');
    expect(versionRow.isFavourite).toBe(true);
    expect(versionRow.rating).toBe(8);
    expect(versionRow.emojiTag).toBe('fire');
    expect(versionRow.preInfusionTimeSeconds).toBe(10);
    expect(versionRow.beanId).toBeNull();
  });

  it('inserts taste notes with correct intensity', async () => {
    const input = buildInput({
      tasteNoteIds: [tasteNote.id],
      tasteNoteIntensities: { [tasteNote.id]: 2 },
    });
    const result = await model.createRecipeWithRelations(input);
    createdRecipeIds.push(result!.id);

    const [versionRow] = await db.select().from(recipeVersions).where(
      eq(recipeVersions.recipeId, result!.id),
    );
    const tasteNoteRows = await db.select().from(recipeTasteNotes).where(
      eq(recipeTasteNotes.recipeVersionId, versionRow.id),
    );
    expect(tasteNoteRows.length).toBe(1);
    expect(tasteNoteRows[0].recipeVersionId).toBe(versionRow.id);
    expect(tasteNoteRows[0].tasteNoteId).toBe(tasteNote.id);
    expect(tasteNoteRows[0].intensity).toBe(2);
  });

  it('taste notes default intensity is 1', async () => {
    const input = buildInput({
      tasteNoteIds: [tasteNote.id],
    });
    const result = await model.createRecipeWithRelations(input);
    createdRecipeIds.push(result!.id);

    const [versionRow] = await db.select().from(recipeVersions).where(
      eq(recipeVersions.recipeId, result!.id),
    );
    const tasteNoteRows = await db.select().from(recipeTasteNotes).where(
      eq(recipeTasteNotes.recipeVersionId, versionRow.id),
    );
    expect(tasteNoteRows.length).toBe(1);
    expect(tasteNoteRows[0].intensity).toBe(1);
  });

  it('taste notes absent when tasteNoteIds is undefined', async () => {
    const input = buildInput();
    const result = await model.createRecipeWithRelations(input);
    createdRecipeIds.push(result!.id);

    const [versionRow] = await db.select().from(recipeVersions).where(
      eq(recipeVersions.recipeId, result!.id),
    );
    const tasteNoteRows = await db.select().from(recipeTasteNotes).where(
      eq(recipeTasteNotes.recipeVersionId, versionRow.id),
    );
    expect(tasteNoteRows.length).toBe(0);
  });

  it('taste notes absent when tasteNoteIds is empty', async () => {
    const input = buildInput({ tasteNoteIds: [] });
    const result = await model.createRecipeWithRelations(input);
    createdRecipeIds.push(result!.id);

    const [versionRow] = await db.select().from(recipeVersions).where(
      eq(recipeVersions.recipeId, result!.id),
    );
    const tasteNoteRows = await db.select().from(recipeTasteNotes).where(
      eq(recipeTasteNotes.recipeVersionId, versionRow.id),
    );
    expect(tasteNoteRows.length).toBe(0);
  });

  it('inserts equipment when equipmentIds provided', async () => {
    const input = buildInput({ equipmentIds: [equipmentRow.id] });
    const result = await model.createRecipeWithRelations(input);
    createdRecipeIds.push(result!.id);

    const [versionRow] = await db.select().from(recipeVersions).where(
      eq(recipeVersions.recipeId, result!.id),
    );
    const equipmentRows = await db.select().from(recipeEquipment).where(
      eq(recipeEquipment.recipeVersionId, versionRow.id),
    );
    expect(equipmentRows.length).toBe(1);
    expect(equipmentRows[0].recipeVersionId).toBe(versionRow.id);
    expect(equipmentRows[0].equipmentId).toBe(equipmentRow.id);
  });

  it('inserts additional preparations with sortOrder equal to array index', async () => {
    const input = buildInput({
      additionalPreparations: [
        { name: 'Milk', type: 'milk', inputAmount: '30ml', preparationType: 'steamed' },
        { name: 'Sugar', type: 'spice', inputAmount: '1tsp', preparationType: 'mixed' },
      ],
    });
    const result = await model.createRecipeWithRelations(input);
    createdRecipeIds.push(result!.id);

    const [versionRow] = await db.select().from(recipeVersions).where(
      eq(recipeVersions.recipeId, result!.id),
    );
    const prepRows = await db.select().from(recipeAdditionalPreparations).where(
      eq(recipeAdditionalPreparations.recipeVersionId, versionRow.id),
    );
    expect(prepRows.length).toBe(2);

    const milk = prepRows.find((p) => p.name === 'Milk');
    const sugar = prepRows.find((p) => p.name === 'Sugar');
    expect(milk).toBeDefined();
    expect(milk!.type).toBe('milk');
    expect(milk!.inputAmount).toBe('30ml');
    expect(milk!.preparationType).toBe('steamed');
    expect(milk!.sortOrder).toBe(0);
    expect(sugar).toBeDefined();
    expect(sugar!.type).toBe('spice');
    expect(sugar!.inputAmount).toBe('1tsp');
    expect(sugar!.preparationType).toBe('mixed');
    expect(sugar!.sortOrder).toBe(1);
  });

  it('inserts version photos with sortOrder equal to array index', async () => {
    const throwawayRecipeId = crypto.randomUUID();
    const throwawayVersionId = crypto.randomUUID();
    const photoId = crypto.randomUUID();

    await db.insert(recipes).values({
      id: throwawayRecipeId,
      slug: `throwaway-${throwawayRecipeId}`,
      title: 'Throwaway',
      authorId: user.id,
      visibility: 'draft',
    });
    await db.insert(recipeVersions).values({
      id: throwawayVersionId,
      recipeId: throwawayRecipeId,
      versionNumber: 1,
      brewMethod: 'v60',
      drinkType: 'pour_over',
      preparationNotes: '',
    });
    await db.insert(photos).values({
      id: photoId,
      recipeId: throwawayRecipeId,
      url: 'https://example.com/photo.jpg',
    });
    throwawayRecipeIds.push(throwawayRecipeId);
    throwawayPhotoIds.push(photoId);

    const input = buildInput({ photoIds: [photoId] });
    const result = await model.createRecipeWithRelations(input);
    createdRecipeIds.push(result!.id);

    const [versionRow] = await db.select().from(recipeVersions).where(
      eq(recipeVersions.recipeId, result!.id),
    );
    const photoRows = await db.select().from(recipeVersionPhotos).where(
      eq(recipeVersionPhotos.recipeVersionId, versionRow.id),
    );
    expect(photoRows.length).toBe(1);
    expect(photoRows[0].recipeVersionId).toBe(versionRow.id);
    expect(photoRows[0].photoId).toBe(photoId);
    expect(photoRows[0].sortOrder).toBe(0);
  });

  it('returns the full findById shape with nested relations', async () => {
    const input = buildInput({
      tasteNoteIds: [tasteNote.id],
      equipmentIds: [equipmentRow.id],
    });
    const result = await model.createRecipeWithRelations(input);
    createdRecipeIds.push(result!.id);

    expect(result).toBeDefined();
    expect(result!.author).toBeDefined();
    expect(result!.author.id).toBe(user.id);
    expect(result!.author.username).toBeDefined();
    expect(result!.author.displayName).toBeDefined();
    expect(result!.author.avatarUrl).toBeDefined();
    expect(Array.isArray(result!.versions)).toBe(true);
    expect(result!.versions.length).toBe(1);

    const firstVersion = result!.versions[0];
    expect(firstVersion.tasteNotes).toBeDefined();
    expect(firstVersion.tasteNotes.length).toBe(1);
    expect(firstVersion.tasteNotes[0].tasteNote).toBeDefined();
    expect(firstVersion.tasteNotes[0].tasteNote!.id).toBe(tasteNote.id);

    expect(firstVersion.equipment).toBeDefined();
    expect(firstVersion.equipment.length).toBe(1);
    expect(firstVersion.equipment[0].equipment).toBeDefined();
    expect(firstVersion.equipment[0].equipment!.id).toBe(equipmentRow.id);

    expect(firstVersion.additionalPreparations).toBeDefined();
    expect(Array.isArray(firstVersion.additionalPreparations)).toBe(true);

    expect(firstVersion.versionPhotos).toBeDefined();
    expect(Array.isArray(firstVersion.versionPhotos)).toBe(true);

    expect(firstVersion.bean).toBeDefined();

    expect(result!.photos).toBeDefined();
    expect(Array.isArray(result!.photos)).toBe(true);

    expect(result!.forkedFrom).toBeNull();
    expect(result!.currentVersionId).toBe(firstVersion.id);
  });
});
