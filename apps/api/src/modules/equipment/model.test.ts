// deno-lint-ignore-file no-explicit-any require-await

import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { and, eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import {
  equipment,
  equipmentDeleteRequests,
  recipeEquipment,
  recipes,
  recipeVersions,
  users,
} from '@brewform/db/schema';
import * as model from './model.ts';

describe('findById', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let equipmentId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    equipmentId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(equipment).values({
      id: equipmentId,
      name: 'Test Grinder',
      type: 'grinder',
      isSystem: false,
      createdBy: userId,
    });
  });

  afterEach(async () => {
    await db.delete(equipment).where(eq(equipment.id, equipmentId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return an active equipment record', async () => {
    const result = await model.findById(equipmentId);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Test Grinder');
    expect(result!.type).toBe('grinder');
  });

  it('should return null for a soft-deleted equipment record', async () => {
    await db.update(equipment).set({ deletedAt: new Date() }).where(eq(equipment.id, equipmentId));
    const result = await model.findById(equipmentId);
    expect(result).toBeNull();
  });

  it('should return null for a non-existent equipment ID', async () => {
    const result = await model.findById('nonexistent-uuid');
    expect(result).toBeNull();
  });
});

describe('findMany', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let equipmentIds: string[];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    equipmentIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(equipment).values([
      {
        id: equipmentIds[0],
        name: 'Alpha Grinder',
        type: 'grinder',
        isSystem: false,
        createdBy: userId,
      },
      {
        id: equipmentIds[1],
        name: 'Beta Kettle',
        type: 'kettle',
        isSystem: false,
        createdBy: userId,
      },
      {
        id: equipmentIds[2],
        name: 'Gamma Grinder',
        type: 'grinder',
        isSystem: false,
        createdBy: userId,
        deletedAt: new Date(),
      },
    ]);
  });

  afterEach(async () => {
    for (const id of equipmentIds) {
      await db.delete(equipment).where(eq(equipment.id, id));
    }
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return paginated equipment with total count', async () => {
    // Filter to only our test rows (CI DB has seed data).
    const result = await model.findMany(eq(equipment.createdBy, userId), 1, 2);
    expect(result.items.length).toBe(2);
    expect(result.total).toBe(2);
  });

  it('should respect a where clause', async () => {
    const result = await model.findMany(
      and(eq(equipment.createdBy, userId), eq(equipment.type, 'grinder')),
      1,
      10,
    );
    expect(result.items.length).toBe(1);
    expect(result.items[0].name).toBe('Alpha Grinder');
    expect(result.total).toBe(1);
  });

  it('should return { items, total } shape', async () => {
    const result = await model.findMany(eq(equipment.createdBy, userId), 1, 10);
    expect(Object.keys(result).sort()).toEqual(['items', 'total'].sort());
  });
});

describe('findManyWithFilters', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let equipmentIds: string[];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    equipmentIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(equipment).values([
      {
        id: equipmentIds[0],
        name: 'PourX Grinder',
        type: 'grinder',
        isSystem: false,
        createdBy: userId,
      },
      {
        id: equipmentIds[1],
        name: 'Stagg Kettle',
        type: 'kettle',
        isSystem: false,
        createdBy: userId,
      },
      {
        id: equipmentIds[2],
        name: 'Deleted Grinder',
        type: 'grinder',
        isSystem: false,
        createdBy: userId,
        deletedAt: new Date(),
      },
    ]);
  });

  afterEach(async () => {
    for (const id of equipmentIds) {
      await db.delete(equipment).where(eq(equipment.id, id));
    }
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return paginated equipment with total count', async () => {
    // CI DB has seed data; assert pagination caps the page size.
    const result = await model.findManyWithFilters({ page: 1, perPage: 2 });
    expect(result.items.length).toBeLessThanOrEqual(2);
    expect(result.total).toBeGreaterThanOrEqual(2);
    // Our two active rows must be findable via search (seed-safe membership check).
    const bySearch = await model.findManyWithFilters({ search: 'PourX', page: 1, perPage: 100 });
    expect(bySearch.items.some((i) => i.id === equipmentIds[0])).toBe(true);
    const bySearch2 = await model.findManyWithFilters({ search: 'Stagg', page: 1, perPage: 100 });
    expect(bySearch2.items.some((i) => i.id === equipmentIds[1])).toBe(true);
    // Soft-deleted row must never appear.
    const all = await model.findManyWithFilters({ page: 1, perPage: 100 });
    expect(all.items.some((i) => i.id === equipmentIds[2])).toBe(false);
  });

  it('should filter by type', async () => {
    const result = await model.findManyWithFilters({ type: 'grinder', page: 1, perPage: 100 });
    const ours = result.items.filter((i) => equipmentIds.includes(i.id));
    expect(ours.length).toBe(1);
    expect(ours[0].name).toBe('PourX Grinder');
    expect(ours[0].type).toBe('grinder');
  });

  it('should filter by search query', async () => {
    const result = await model.findManyWithFilters({ search: 'Stagg', page: 1, perPage: 100 });
    const ours = result.items.filter((i) => equipmentIds.includes(i.id));
    expect(ours.length).toBe(1);
    expect(ours[0].name).toBe('Stagg Kettle');
  });

  it('should exclude soft-deleted equipment', async () => {
    const result = await model.findManyWithFilters({ page: 1, perPage: 100 });
    const ids = result.items.map((i) => i.id);
    expect(ids).not.toContain(equipmentIds[2]);
  });
});

describe('search', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let equipmentIds: string[];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    equipmentIds = [];
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    for (const id of equipmentIds) {
      await db.delete(equipment).where(eq(equipment.id, id));
    }
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return matching equipment by name', async () => {
    const id = crypto.randomUUID();
    equipmentIds.push(id);
    await db.insert(equipment).values({
      id,
      name: 'Comandante C40',
      type: 'grinder',
      isSystem: false,
      createdBy: userId,
    });
    const results = await model.search('Comandante');
    expect(results.some((r) => r.name === 'Comandante C40')).toBe(true);
  });

  it('should return matching equipment by brand', async () => {
    const id = crypto.randomUUID();
    equipmentIds.push(id);
    await db.insert(equipment).values({
      id,
      name: 'Hand Grinder',
      brand: '1Zpresso',
      type: 'grinder',
      isSystem: false,
      createdBy: userId,
    });
    const results = await model.search('1Zpresso');
    expect(results.some((r) => r.brand === '1Zpresso')).toBe(true);
  });

  it('should return matching equipment by model', async () => {
    const id = crypto.randomUUID();
    equipmentIds.push(id);
    await db.insert(equipment).values({
      id,
      name: 'Espresso Machine',
      model: 'Linea Mini',
      type: 'espresso_machine',
      isSystem: false,
      createdBy: userId,
    });
    const results = await model.search('Linea');
    expect(results.some((r) => r.model === 'Linea Mini')).toBe(true);
  });

  it('should exclude soft-deleted equipment', async () => {
    const id = crypto.randomUUID();
    equipmentIds.push(id);
    await db.insert(equipment).values({
      id,
      name: 'Deleted Kettle',
      type: 'kettle',
      isSystem: false,
      createdBy: userId,
      deletedAt: new Date(),
    });
    const results = await model.search('Deleted Kettle');
    expect(results.some((r) => r.name === 'Deleted Kettle')).toBe(false);
  });

  it('should limit to 10 results', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const id = crypto.randomUUID();
      ids.push(id);
      equipmentIds.push(id);
      await db.insert(equipment).values({
        id,
        name: `BatchGrinder ${i}`,
        type: 'grinder',
        isSystem: false,
        createdBy: userId,
      });
    }
    const results = await model.search('BatchGrinder');
    expect(results.length).toBeLessThanOrEqual(10);
  });
});

describe('create', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let equipmentId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    equipmentId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    await db.delete(equipment).where(eq(equipment.id, equipmentId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should insert an equipment row and return it', async () => {
    const result = await model.create({
      id: equipmentId,
      name: 'New Grinder',
      type: 'grinder',
      isSystem: false,
      createdBy: userId,
    });
    expect(result).not.toBeNull();
    expect(result.id).toBe(equipmentId);
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
    const [row] = await db.select().from(equipment).where(eq(equipment.id, equipmentId));
    expect(row.name).toBe('New Grinder');
  });
});

describe('update', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let equipmentId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    equipmentId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(equipment).values({
      id: equipmentId,
      name: 'Original Grinder',
      type: 'grinder',
      isSystem: false,
      createdBy: userId,
    });
  });

  afterEach(async () => {
    await db.delete(equipment).where(eq(equipment.id, equipmentId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should update an active equipment record', async () => {
    const result = await model.update(equipmentId, { name: 'Updated Grinder' });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Updated Grinder');
  });

  /**
   * Regression baseline: model.update currently lacks the isNull(deletedAt) guard.
   * This test documents the unguarded behaviour. If a future change adds the guard,
   * this test will fail and force a conscious update.
   */
  it('should mutate a soft-deleted equipment record (regression baseline)', async () => {
    await db.update(equipment).set({ deletedAt: new Date() }).where(eq(equipment.id, equipmentId));
    const result = await model.update(equipmentId, { name: 'Mutated' });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Mutated');
    const [row] = await db.select().from(equipment).where(eq(equipment.id, equipmentId));
    expect(row.name).toBe('Mutated');
  });
});

describe('softDelete', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let equipmentId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    equipmentId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(equipment).values({
      id: equipmentId,
      name: 'Test Grinder',
      type: 'grinder',
      isSystem: false,
      createdBy: userId,
    });
  });

  afterEach(async () => {
    await db.delete(equipment).where(eq(equipment.id, equipmentId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should soft-delete an active equipment record', async () => {
    const result = await model.softDelete(equipmentId);
    expect(result).not.toBeNull();
    expect(result!.deletedAt).not.toBeNull();
  });

  it('should return null when deleting an already-deleted equipment', async () => {
    await model.softDelete(equipmentId);
    const second = await model.softDelete(equipmentId);
    expect(second).toBeNull();
  });

  it('should not overwrite deletedAt on double-delete', async () => {
    const first = await model.softDelete(equipmentId);
    expect(first!.deletedAt).not.toBeNull();
    const firstDeletedAt = first!.deletedAt!.getTime();
    await new Promise((r) => setTimeout(r, 10));
    await model.softDelete(equipmentId);
    const [row] = await db.select().from(equipment).where(eq(equipment.id, equipmentId));
    expect(row.deletedAt!.getTime()).toBe(firstDeletedAt);
  });
});

describe('createDeleteRequest', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let equipmentId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    equipmentId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(equipment).values({
      id: equipmentId,
      name: 'Test Grinder',
      type: 'grinder',
      isSystem: false,
      createdBy: userId,
    });
  });

  afterEach(async () => {
    await db.delete(equipmentDeleteRequests).where(
      eq(equipmentDeleteRequests.equipmentId, equipmentId),
    );
    await db.delete(equipment).where(eq(equipment.id, equipmentId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should insert a delete request with status pending', async () => {
    const result = await model.createDeleteRequest({
      equipmentId,
      requestedById: userId,
    });
    expect(result).not.toBeNull();
    expect(result.status).toBe('pending');
    expect(result.equipmentId).toBe(equipmentId);
  });
});

describe('getRecipesUsingEquipment', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let equipmentId: string;
  let recipeIds: string[];
  let versionIds: string[];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    equipmentId = crypto.randomUUID();
    recipeIds = [];
    versionIds = [];
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(equipment).values({
      id: equipmentId,
      name: 'Test Grinder',
      type: 'grinder',
      isSystem: false,
      createdBy: userId,
    });
  });

  afterEach(async () => {
    await db.delete(recipeEquipment).where(eq(recipeEquipment.equipmentId, equipmentId));
    for (const recipeId of recipeIds) {
      await db.delete(recipeVersions).where(eq(recipeVersions.recipeId, recipeId));
      await db.delete(recipes).where(eq(recipes.id, recipeId));
    }
    await db.delete(equipment).where(eq(equipment.id, equipmentId));
    await db.delete(users).where(eq(users.id, userId));
  });

  /**
   * Insert a recipe with the 3-step circular-FK dance (see design Appendix A):
   * 1) recipe (no currentVersionId), 2) version (with trap fields), 3) link currentVersionId,
   * 4) optionally link equipment to the version via recipeEquipment.
   * Returns { recipeId, versionId }.
   */
  async function insertRecipe(
    visibility: 'public' | 'draft' | 'private' | 'unlisted',
    linkEquipment: boolean,
    softDelete = false,
  ): Promise<{ recipeId: string; versionId: string }> {
    const recipeId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    recipeIds.push(recipeId);
    versionIds.push(versionId);
    const [recipe] = await db.insert(recipes).values({
      id: recipeId,
      slug: `test-recipe-${recipeId}`,
      title: `Test Recipe ${recipeId.slice(0, 8)}`,
      authorId: userId,
      visibility,
    }).returning();
    const [version] = await db.insert(recipeVersions).values({
      id: versionId,
      recipeId: recipe.id,
      versionNumber: 1,
      brewMethod: 'v60',
      drinkType: 'pour_over',
      preparationNotes: '',
    }).returning();
    await db.update(recipes).set({ currentVersionId: version.id }).where(eq(recipes.id, recipe.id));
    if (linkEquipment) {
      await db.insert(recipeEquipment).values({ recipeVersionId: version.id, equipmentId });
    }
    if (softDelete) {
      await db.update(recipes).set({ deletedAt: new Date() }).where(eq(recipes.id, recipe.id));
    }
    return { recipeId, versionId };
  }

  it('should return only public recipes linked to the equipment', async () => {
    await insertRecipe('public', true);
    await insertRecipe('draft', true);
    await insertRecipe('public', true, true);
    const result = await model.getRecipesUsingEquipment(equipmentId, 1, 10);
    expect(result.data.length).toBe(1);
    expect(result.total).toBe(1);
  });

  it('should exclude soft-deleted recipes', async () => {
    await insertRecipe('public', true);
    const { recipeId } = await insertRecipe('public', true, true);
    const result = await model.getRecipesUsingEquipment(equipmentId, 1, 10);
    expect(result.data.some((r) => r.id === recipeId)).toBe(false);
  });

  it('should exclude recipes not linked to the equipment', async () => {
    await insertRecipe('public', true);
    await insertRecipe('public', false);
    const result = await model.getRecipesUsingEquipment(equipmentId, 1, 10);
    expect(result.data.length).toBe(1);
    expect(result.total).toBe(1);
  });

  it('should paginate correctly', async () => {
    for (let i = 0; i < 5; i++) {
      await insertRecipe('public', true);
    }
    const page1 = await model.getRecipesUsingEquipment(equipmentId, 1, 2);
    const page2 = await model.getRecipesUsingEquipment(equipmentId, 2, 2);
    expect(page1.data.length).toBe(2);
    expect(page2.data.length).toBe(2);
    expect(page1.total).toBe(5);
    expect(page2.total).toBe(5);
    const page1Ids = page1.data.map((r) => r.id);
    const page2Ids = page2.data.map((r) => r.id);
    expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
  });

  it('should join the author relation', async () => {
    await insertRecipe('public', true);
    const result = await model.getRecipesUsingEquipment(equipmentId, 1, 10);
    expect(result.data.length).toBe(1);
    const recipe = result.data[0];
    expect(recipe.author).toBeDefined();
    expect(recipe.author.username).toBe(`testuser-${userId}`);
  });

  it('should return matching total count in the count branch', async () => {
    await insertRecipe('public', true);
    await insertRecipe('draft', true);
    await insertRecipe('public', true, true);
    await insertRecipe('public', true);
    const result = await model.getRecipesUsingEquipment(equipmentId, 1, 10);
    expect(result.total).toBe(2);
    expect(result.data.length).toBe(2);
  });

  it('should return empty for equipment with no linked recipes', async () => {
    const result = await model.getRecipesUsingEquipment(equipmentId, 1, 10);
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });
});
