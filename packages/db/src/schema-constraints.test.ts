import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  recipes,
  recipeTasteNotes,
  recipeVersions,
  tasteNotes,
  userRecipeRatings,
  users,
} from './schema.ts';

describe('Schema CHECK constraints', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;
  let recipeVersionId: string;
  let tasteNoteId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    recipeId = crypto.randomUUID();
    recipeVersionId = crypto.randomUUID();
    tasteNoteId = crypto.randomUUID();

    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });

    await db.insert(recipes).values({
      id: recipeId,
      authorId: userId,
      slug: `test-recipe-${recipeId}`,
      title: 'Test Recipe',
      visibility: 'public',
    });

    await db.insert(recipeVersions).values({
      id: recipeVersionId,
      recipeId: recipeId,
      versionNumber: 1,
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      preparationNotes: 'Test notes',
    });

    await db.update(recipes).set({ currentVersionId: recipeVersionId }).where(
      eq(recipes.id, recipeId),
    );

    await db.insert(tasteNotes).values({
      id: tasteNoteId,
      name: 'Test Taste Note',
      depth: 0,
    });
  });

  afterEach(async () => {
    await db.delete(recipeTasteNotes).where(eq(recipeTasteNotes.recipeVersionId, recipeVersionId));
    await db.delete(userRecipeRatings).where(eq(userRecipeRatings.recipeId, recipeId));
    await db.delete(tasteNotes).where(eq(tasteNotes.id, tasteNoteId));
    await db.delete(recipeVersions).where(eq(recipeVersions.id, recipeVersionId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  describe('recipe_taste_note intensity check', () => {
    it('should reject intensity = 0', async () => {
      await expect(
        db.insert(recipeTasteNotes).values({
          recipeVersionId,
          tasteNoteId,
          intensity: 0,
        }),
      ).rejects.toThrow();
    });

    it('should reject intensity = 4', async () => {
      await expect(
        db.insert(recipeTasteNotes).values({
          recipeVersionId,
          tasteNoteId,
          intensity: 4,
        }),
      ).rejects.toThrow();
    });

    it('should accept intensity = 1', async () => {
      await expect(
        db.insert(recipeTasteNotes).values({
          recipeVersionId,
          tasteNoteId,
          intensity: 1,
        }),
      ).resolves.toBeDefined();
    });

    it('should accept intensity = 3', async () => {
      await expect(
        db.insert(recipeTasteNotes).values({
          recipeVersionId,
          tasteNoteId,
          intensity: 3,
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('user_recipe_rating rating check', () => {
    it('should reject rating = 0', async () => {
      await expect(
        db.insert(userRecipeRatings).values({
          userId,
          recipeId,
          rating: 0,
        }),
      ).rejects.toThrow();
    });

    it('should reject rating = 11', async () => {
      await expect(
        db.insert(userRecipeRatings).values({
          userId,
          recipeId,
          rating: 11,
        }),
      ).rejects.toThrow();
    });

    it('should accept rating = 1', async () => {
      await expect(
        db.insert(userRecipeRatings).values({
          userId,
          recipeId,
          rating: 1,
        }),
      ).resolves.toBeDefined();
    });

    it('should accept rating = 10', async () => {
      await expect(
        db.insert(userRecipeRatings).values({
          userId,
          recipeId,
          rating: 10,
        }),
      ).resolves.toBeDefined();
    });
  });
});
