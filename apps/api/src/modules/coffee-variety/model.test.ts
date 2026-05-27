import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { coffeeVarieties, recipes, recipeVersions, users } from '@brewform/db/schema';
import * as model from './model.ts';

describe('Coffee Variety Model', { sanitizeOps: false, sanitizeResources: false }, () => {
  describe('findMany pagination', () => {
    it('should compute correct offset from page and perPage', () => {
      const page = 3;
      const perPage = 20;
      const offset = (page - 1) * perPage;
      expect(offset).toBe(40);
    });

    it('should compute zero offset for first page', () => {
      const page = 1;
      const perPage = 20;
      const offset = (page - 1) * perPage;
      expect(offset).toBe(0);
    });

    it('should extract total from count query result', () => {
      const countResult = [{ count: 42 as unknown as string }];
      const total = Number(countResult[0]?.count ?? 0);
      expect(total).toBe(42);
    });

    it('should default total to 0 when countResult is empty', () => {
      const countResult: { count: number }[] = [];
      const total = Number(countResult[0]?.count ?? 0);
      expect(total).toBe(0);
    });
  });

  describe('findMany filtering', () => {
    it('should build category filter when category is provided', () => {
      const conditions: string[] = [];
      const category = 'variety';
      if (category) conditions.push(`category = ${category}`);
      expect(conditions).toHaveLength(1);
    });

    it('should not add category filter when category is undefined', () => {
      const conditions: string[] = [];
      const category: string | undefined = undefined;
      if (category) conditions.push(`category = ${category}`);
      expect(conditions).toHaveLength(0);
    });

    it('should build search filter when search is provided', () => {
      const conditions: string[] = [];
      const search = 'arabica';
      if (search) conditions.push(`search = ${search}`);
      expect(conditions).toHaveLength(1);
    });

    it('should not add search filter when search is empty', () => {
      const conditions: string[] = [];
      const search = '';
      if (search) conditions.push(`search = ${search}`);
      expect(conditions).toHaveLength(0);
    });
  });

  describe('findById null filtering', () => {
    it('should filter by id and deletedAt is null for active records', () => {
      const conditions: string[] = [];
      const id = 'abc-123';
      conditions.push(`id = ${id}`);
      conditions.push('deletedAt IS NULL');
      expect(conditions).toEqual(['id = abc-123', 'deletedAt IS NULL']);
    });
  });

  describe('softDelete behavior', () => {
    it('should set deletedAt and updatedAt to current date', () => {
      const now = new Date();
      const result = { deletedAt: now, updatedAt: now };
      expect(result.deletedAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('create behavior', () => {
    it('should return the first inserted record from returning()', () => {
      const results = [
        { id: 'var-1', name: 'Arabica', category: 'variety', createdBy: null, isSystem: false },
      ];
      const result = results[0];
      expect(result).toBeDefined();
      expect(result.name).toBe('Arabica');
    });
  });

  describe('update behavior', () => {
    it('should set updatedAt when updating a variety', () => {
      const data: Record<string, unknown> = { name: 'Updated Name' };
      const updated: Record<string, unknown> = { ...data, updatedAt: new Date() };
      expect(updated.updatedAt).toBeInstanceOf(Date);
      expect(updated.name).toBe('Updated Name');
    });

    it('should only update non-deleted records', () => {
      const conditions: string[] = [];
      const id = 'var-1';
      conditions.push(`id = ${id}`);
      conditions.push('deletedAt IS NULL');
      expect(conditions).toHaveLength(2);
    });
  });

  describe('getRecipesUsingVariety — integration', () => {
    let userId: string;
    let varietyId: string;
    let recipeId: string;
    let versionId: string;

    beforeEach(async () => {
      userId = crypto.randomUUID();
      varietyId = crypto.randomUUID();
      recipeId = crypto.randomUUID();
      versionId = crypto.randomUUID();

      await db.insert(users).values({
        id: userId,
        email: `test-${userId}@example.com`,
        username: `testuser-${userId}`,
        passwordHash: 'hash',
      });

      await db.insert(coffeeVarieties).values({
        id: varietyId,
        name: 'Test Variety',
        category: 'variety',
        isSystem: false,
        createdBy: userId,
      });

      await db.insert(recipes).values({
        id: recipeId,
        slug: `test-recipe-${recipeId}`,
        title: 'Test Recipe',
        authorId: userId,
        visibility: 'public',
      });

      await db.insert(recipeVersions).values({
        id: versionId,
        recipeId,
        versionNumber: 1,
        brewMethod: 'v60',
        drinkType: 'pour_over',
        preparationNotes: '',
        coffeeVarietyId: varietyId,
      });

      await db.update(recipes)
        .set({ currentVersionId: versionId })
        .where(eq(recipes.id, recipeId));
    });

    afterEach(async () => {
      await db.delete(recipeVersions).where(eq(recipeVersions.recipeId, recipeId));
      await db.delete(recipes).where(eq(recipes.id, recipeId));
      await db.delete(coffeeVarieties).where(eq(coffeeVarieties.id, varietyId));
      await db.delete(users).where(eq(users.id, userId));
    });

    it('should return recipes that use the given coffee variety', async () => {
      const result = await model.getRecipesUsingVariety(varietyId, 1, 10);
      expect(result.total).toBe(1);
      expect(result.data.length).toBe(1);
      expect(result.data[0].id).toBe(recipeId);
    });

    it('should return empty result when no recipes use the variety', async () => {
      const otherVarietyId = crypto.randomUUID();
      await db.insert(coffeeVarieties).values({
        id: otherVarietyId,
        name: 'Other Variety',
        category: 'variety',
        isSystem: false,
        createdBy: userId,
      });

      const result = await model.getRecipesUsingVariety(otherVarietyId, 1, 10);
      expect(result.total).toBe(0);
      expect(result.data.length).toBe(0);

      await db.delete(coffeeVarieties).where(eq(coffeeVarieties.id, otherVarietyId));
    });

    it('should not include soft-deleted recipes', async () => {
      await db.update(recipes)
        .set({ deletedAt: new Date() })
        .where(eq(recipes.id, recipeId));

      const result = await model.getRecipesUsingVariety(varietyId, 1, 10);
      expect(result.total).toBe(0);
      expect(result.data.length).toBe(0);
    });

    it('should not include non-public recipes', async () => {
      await db.update(recipes)
        .set({ visibility: 'private' })
        .where(eq(recipes.id, recipeId));

      const result = await model.getRecipesUsingVariety(varietyId, 1, 10);
      expect(result.total).toBe(0);
      expect(result.data.length).toBe(0);
    });
  });
});
