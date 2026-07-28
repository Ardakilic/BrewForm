/**
 * Unit tests for the `diffVersions` service function.
 *
 * Exercises scalar-field status logic (added/removed/modified/unchanged),
 * same-version and cross-recipe guards, and set-diff behaviour for taste
 * notes and equipment against a PostgreSQL test database.
 */

import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@brewform/db';
import {
  equipment,
  recipeEquipment,
  recipes,
  recipeTasteNotes,
  recipeVersions,
  tasteNotes,
  users,
} from '@brewform/db/schema';
import { diffVersions } from './service.ts';

describe('diffVersions', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;
  let otherRecipeId: string;
  let v1Id: string;
  let v2Id: string;
  let otherVersionId: string;
  let tnA: string;
  let tnB: string;
  let tnC: string;
  let eqA: string;
  let eqB: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    recipeId = crypto.randomUUID();
    otherRecipeId = crypto.randomUUID();
    v1Id = crypto.randomUUID();
    v2Id = crypto.randomUUID();
    otherVersionId = crypto.randomUUID();
    tnA = crypto.randomUUID();
    tnB = crypto.randomUUID();
    tnC = crypto.randomUUID();
    eqA = crypto.randomUUID();
    eqB = crypto.randomUUID();

    await db.insert(users).values({
      id: userId,
      email: `diff-${userId}@example.com`,
      username: `diff-${userId.slice(0, 8)}`,
      passwordHash: 'hash',
    });

    await db.insert(recipes).values([
      {
        id: recipeId,
        slug: `diff-r1-${recipeId.slice(0, 8)}`,
        title: 'Diff Recipe',
        authorId: userId,
        visibility: 'public',
      },
      {
        id: otherRecipeId,
        slug: `diff-r2-${otherRecipeId.slice(0, 8)}`,
        title: 'Other Recipe',
        authorId: userId,
        visibility: 'public',
      },
    ]);

    await db.insert(recipeVersions).values({
      id: v1Id,
      recipeId,
      versionNumber: 1,
      brewMethod: 'v60',
      drinkType: 'pour_over',
      grindSize: 'medium',
      groundWeightGrams: 18,
      preparationNotes: 'Bloom 30s',
      brewDate: new Date('2025-01-01'),
      isFavourite: false,
    });
    await db.insert(recipeVersions).values({
      id: v2Id,
      recipeId,
      versionNumber: 2,
      brewMethod: 'espresso_machine',
      drinkType: 'pour_over',
      grindSize: null,
      groundWeightGrams: 18,
      personalNotes: 'new notes',
      preparationNotes: 'WDT + tamp',
      brewDate: new Date('2025-02-01'),
      isFavourite: false,
    });
    await db.insert(recipeVersions).values({
      id: otherVersionId,
      recipeId: otherRecipeId,
      versionNumber: 1,
      brewMethod: 'french_press',
      drinkType: 'french_press',
      preparationNotes: 'steep 4min',
      brewDate: new Date(),
      isFavourite: false,
    });

    await db.insert(tasteNotes).values([
      { id: tnA, name: `NoteA-${tnA.slice(0, 8)}` },
      { id: tnB, name: `NoteB-${tnB.slice(0, 8)}` },
      { id: tnC, name: `NoteC-${tnC.slice(0, 8)}` },
    ]);

    await db.insert(equipment).values([
      { id: eqA, name: `EqA-${eqA.slice(0, 8)}`, type: 'grinder' },
      { id: eqB, name: `EqB-${eqB.slice(0, 8)}`, type: 'kettle' },
    ]);

    await db.insert(recipeTasteNotes).values([
      { recipeVersionId: v1Id, tasteNoteId: tnA, intensity: 3 },
      { recipeVersionId: v1Id, tasteNoteId: tnB, intensity: 2 },
      { recipeVersionId: v2Id, tasteNoteId: tnB, intensity: 2 },
      { recipeVersionId: v2Id, tasteNoteId: tnC, intensity: 3 },
    ]);

    await db.insert(recipeEquipment).values([
      { recipeVersionId: v1Id, equipmentId: eqA },
      { recipeVersionId: v2Id, equipmentId: eqA },
      { recipeVersionId: v2Id, equipmentId: eqB },
    ]);
  });

  afterEach(async () => {
    const versionIds = [v1Id, v2Id, otherVersionId];
    await db.delete(recipeTasteNotes).where(
      inArray(recipeTasteNotes.recipeVersionId, versionIds),
    );
    await db.delete(recipeEquipment).where(
      inArray(recipeEquipment.recipeVersionId, versionIds),
    );
    await db.delete(recipeVersions).where(inArray(recipeVersions.id, versionIds));
    await db.delete(recipes).where(inArray(recipes.id, [recipeId, otherRecipeId]));
    await db.delete(tasteNotes).where(inArray(tasteNotes.id, [tnA, tnB, tnC]));
    await db.delete(equipment).where(inArray(equipment.id, [eqA, eqB]));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('returns correct field statuses for two versions with different fields', async () => {
    const result = await diffVersions(recipeId, v1Id, v2Id);

    expect(result.version1.id).toBe(v1Id);
    expect(result.version1.versionNumber).toBe(1);
    expect(result.version2.id).toBe(v2Id);
    expect(result.version2.versionNumber).toBe(2);

    const byField = Object.fromEntries(result.fields.map((f) => [f.field, f.status]));
    expect(byField.brewMethod).toBe('modified');
    expect(byField.grindSize).toBe('removed');
    expect(byField.groundWeightGrams).toBe('unchanged');
    expect(byField.personalNotes).toBe('added');
    expect(byField.drinkType).toBe('unchanged');
    expect(byField.preparationNotes).toBe('modified');
  });

  it('throws SAME_VERSION when v1Id equals v2Id', async () => {
    await expect(diffVersions(recipeId, v1Id, v1Id)).rejects.toThrow('SAME_VERSION');
  });

  it('throws VERSION_NOT_FOUND when version belongs to a different recipe', async () => {
    await expect(diffVersions(recipeId, v1Id, otherVersionId)).rejects.toThrow(
      'VERSION_NOT_FOUND',
    );
  });

  it('marks fields as unchanged when both versions have null', async () => {
    const result = await diffVersions(recipeId, v1Id, v2Id);
    const tds = result.fields.find((f) => f.field === 'tds');
    expect(tds).toBeDefined();
    expect(tds!.status).toBe('unchanged');
    expect(tds!.value1).toBeNull();
    expect(tds!.value2).toBeNull();
  });

  it('computes taste note set diffs', async () => {
    const result = await diffVersions(recipeId, v1Id, v2Id);
    const nameA = (await db.select({ name: tasteNotes.name }).from(tasteNotes).where(
      eq(tasteNotes.id, tnA),
    ))[0].name;
    const nameB = (await db.select({ name: tasteNotes.name }).from(tasteNotes).where(
      eq(tasteNotes.id, tnB),
    ))[0].name;
    const nameC = (await db.select({ name: tasteNotes.name }).from(tasteNotes).where(
      eq(tasteNotes.id, tnC),
    ))[0].name;

    expect(result.tasteNotes.added).toEqual([nameC]);
    expect(result.tasteNotes.removed).toEqual([nameA]);
    expect(result.tasteNotes.unchanged).toEqual([nameB]);
  });

  it('computes equipment set diffs', async () => {
    const result = await diffVersions(recipeId, v1Id, v2Id);
    const nameA = (await db.select({ name: equipment.name }).from(equipment).where(
      eq(equipment.id, eqA),
    ))[0].name;
    const nameB = (await db.select({ name: equipment.name }).from(equipment).where(
      eq(equipment.id, eqB),
    ))[0].name;

    expect(result.equipment.added).toEqual([nameB]);
    expect(result.equipment.removed).toEqual([]);
    expect(result.equipment.unchanged).toEqual([nameA]);
  });
});
