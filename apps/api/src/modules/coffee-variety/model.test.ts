import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { coffeeVarieties, recipes, recipeVersions, users } from '@brewform/db/schema';
import * as model from './model.ts';

describe('Coffee Variety Model', { sanitizeOps: false, sanitizeResources: false }, () => {
  describe('findMany pagination', () => {
    let userId: string;
    const varietyIds: string[] = [];

    beforeEach(async () => {
      userId = crypto.randomUUID();
      await db.insert(users).values({
        id: userId,
        email: `test-${userId}@example.com`,
        username: `testuser-${userId}`,
        passwordHash: 'hash',
      });

      for (let i = 1; i <= 3; i++) {
        const id = crypto.randomUUID();
        varietyIds.push(id);
        await db.insert(coffeeVarieties).values({
          id,
          name: `Pagination Variety ${i}`,
          category: 'variety',
          isSystem: false,
          createdBy: userId,
        });
      }
    });

    afterEach(async () => {
      await db.delete(coffeeVarieties).where(eq(coffeeVarieties.createdBy, userId));
      await db.delete(users).where(eq(users.id, userId));
      varietyIds.length = 0;
    });

    it('should return paginated results with correct total', async () => {
      const result = await model.findMany({ page: 1, perPage: 2 });
      expect(result.total).toBeGreaterThanOrEqual(3);
      expect(result.data.length).toBe(2);
    });

    it('should return next page with offset', async () => {
      const result = await model.findMany({ page: 2, perPage: 2 });
      expect(result.total).toBeGreaterThanOrEqual(3);
      expect(result.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('findMany filtering', () => {
    let userId: string;
    let varietyId1: string;
    let varietyId2: string;

    beforeEach(async () => {
      userId = crypto.randomUUID();
      varietyId1 = crypto.randomUUID();
      varietyId2 = crypto.randomUUID();

      await db.insert(users).values({
        id: userId,
        email: `test-${userId}@example.com`,
        username: `testuser-${userId}`,
        passwordHash: 'hash',
      });

      await db.insert(coffeeVarieties).values({
        id: varietyId1,
        name: 'FilterTest Arabica',
        category: 'variety',
        species: 'Coffea arabica',
        isSystem: false,
        createdBy: userId,
      });

      await db.insert(coffeeVarieties).values({
        id: varietyId2,
        name: 'FilterTest Robusta',
        category: 'processing',
        species: 'Coffea canephora',
        isSystem: false,
        createdBy: userId,
      });
    });

    afterEach(async () => {
      await db.delete(coffeeVarieties).where(eq(coffeeVarieties.createdBy, userId));
      await db.delete(users).where(eq(users.id, userId));
    });

    it('should filter by category when provided', async () => {
      const result = await model.findMany({ category: 'variety', page: 1, perPage: 1000 });
      expect(result.data.every((v) => v.category === 'variety')).toBe(true);
      expect(result.data.some((v) => v.id === varietyId1)).toBe(true);
    });

    it('should not filter by category when undefined', async () => {
      const result = await model.findMany({ page: 1, perPage: 1000 });
      const ids = result.data.map((v) => v.id);
      expect(ids).toContain(varietyId1);
      expect(ids).toContain(varietyId2);
    });

    it('should filter by search when provided', async () => {
      const result = await model.findMany({ search: 'FilterTest Arabica', page: 1, perPage: 10 });
      expect(result.data.some((v) => v.id === varietyId1)).toBe(true);
      expect(result.data.every((v) => v.name.includes('FilterTest Arabica'))).toBe(true);
    });

    it('should not filter by search when empty', async () => {
      const result = await model.findMany({ search: '', page: 1, perPage: 1000 });
      const ids = result.data.map((v) => v.id);
      expect(ids).toContain(varietyId1);
      expect(ids).toContain(varietyId2);
    });
  });

  describe('findById null filtering', () => {
    let userId: string;
    let varietyId: string;

    beforeEach(async () => {
      userId = crypto.randomUUID();
      varietyId = crypto.randomUUID();

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
    });

    afterEach(async () => {
      await db.delete(coffeeVarieties).where(eq(coffeeVarieties.id, varietyId));
      await db.delete(users).where(eq(users.id, userId));
    });

    it('should return the variety when it exists and is not deleted', async () => {
      const result = await model.findById(varietyId);
      expect(result).toBeDefined();
      expect(result!.id).toBe(varietyId);
    });

    it('should return null for soft-deleted records', async () => {
      await db.update(coffeeVarieties)
        .set({ deletedAt: new Date() })
        .where(eq(coffeeVarieties.id, varietyId));

      const result = await model.findById(varietyId);
      expect(result).toBeUndefined();
    });
  });

  describe('softDelete behavior', () => {
    let userId: string;
    let varietyId: string;

    beforeEach(async () => {
      userId = crypto.randomUUID();
      varietyId = crypto.randomUUID();

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
    });

    afterEach(async () => {
      await db.delete(coffeeVarieties).where(eq(coffeeVarieties.id, varietyId));
      await db.delete(users).where(eq(users.id, userId));
    });

    it('should set deletedAt and updatedAt on the record', async () => {
      const before = new Date();
      const result = await model.softDelete(varietyId);

      expect(result).toBeDefined();
      expect(result!.deletedAt).not.toBeNull();
      expect(result!.updatedAt).not.toBeNull();
      expect(result!.deletedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('create behavior', () => {
    let userId: string;

    beforeEach(async () => {
      userId = crypto.randomUUID();
      await db.insert(users).values({
        id: userId,
        email: `test-${userId}@example.com`,
        username: `testuser-${userId}`,
        passwordHash: 'hash',
      });
    });

    afterEach(async () => {
      await db.delete(coffeeVarieties).where(eq(coffeeVarieties.createdBy, userId));
      await db.delete(users).where(eq(users.id, userId));
    });

    it('should insert and return the created variety', async () => {
      const data = {
        name: 'Arabica',
        category: 'variety' as const,
        isSystem: false,
        createdBy: userId,
      };

      const result = await model.create(data);
      expect(result).toBeDefined();
      expect(result.name).toBe('Arabica');
      expect(result.category).toBe('variety');
      expect(result.id).toBeDefined();
    });
  });

  describe('update behavior', () => {
    let userId: string;
    let varietyId: string;

    beforeEach(async () => {
      userId = crypto.randomUUID();
      varietyId = crypto.randomUUID();

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
    });

    afterEach(async () => {
      await db.delete(coffeeVarieties).where(eq(coffeeVarieties.id, varietyId));
      await db.delete(users).where(eq(users.id, userId));
    });

    it('should update and set updatedAt', async () => {
      const before = new Date();
      const result = await model.update(varietyId, { name: 'Updated Name' });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Updated Name');
      expect(result!.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should not update soft-deleted records', async () => {
      await db.update(coffeeVarieties)
        .set({ deletedAt: new Date() })
        .where(eq(coffeeVarieties.id, varietyId));

      const result = await model.update(varietyId, { name: 'Updated Name' });
      expect(result).toBeUndefined();
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
