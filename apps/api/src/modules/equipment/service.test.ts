import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@brewform/db';
import {
  equipment,
  equipmentDeleteRequests,
  recipeEquipment,
  recipes,
  recipeVersions,
  users,
} from '@brewform/db/schema';
import * as service from './service.ts';
import { cacheProvider, setCacheProvider } from '../../utils/cache/singleton.ts';
import { type CacheProvider, InMemoryCacheProvider } from '../../utils/cache/index.ts';

describe('Equipment Service', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let otherUserId: string;
  let originalCache: CacheProvider;
  let cache: InMemoryCacheProvider;
  let equipmentIds: string[];
  let recipeIds: string[];
  let versionIds: string[];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    otherUserId = crypto.randomUUID();
    equipmentIds = [];
    recipeIds = [];
    versionIds = [];
    originalCache = cacheProvider;
    cache = new InMemoryCacheProvider();
    setCacheProvider(cache);
    await db.insert(users).values([
      {
        id: userId,
        email: `test-${userId}@example.com`,
        username: `testuser-${userId}`,
        passwordHash: 'hash',
      },
      {
        id: otherUserId,
        email: `test-${otherUserId}@example.com`,
        username: `testuser-${otherUserId}`,
        passwordHash: 'hash',
      },
    ]);
  });

  afterEach(async () => {
    setCacheProvider(originalCache);
    if (equipmentIds.length > 0) {
      await db.delete(recipeEquipment).where(inArray(recipeEquipment.equipmentId, equipmentIds));
      await db.delete(equipmentDeleteRequests).where(
        inArray(equipmentDeleteRequests.equipmentId, equipmentIds),
      );
    }
    if (versionIds.length > 0) {
      await db.delete(recipeVersions).where(inArray(recipeVersions.id, versionIds));
    }
    if (recipeIds.length > 0) {
      await db.delete(recipes).where(inArray(recipes.id, recipeIds));
    }
    if (equipmentIds.length > 0) {
      await db.delete(equipment).where(inArray(equipment.id, equipmentIds));
    }
    await db.delete(users).where(inArray(users.id, [userId, otherUserId]));
  });

  async function insertEquipmentRow(data: Partial<typeof equipment.$inferInsert> = {}) {
    const id = crypto.randomUUID();
    equipmentIds.push(id);
    const [row] = await db.insert(equipment).values({
      id,
      name: `Test Equipment ${id.slice(0, 8)}`,
      type: 'grinder',
      isSystem: false,
      createdBy: userId,
      ...data,
    }).returning();
    return row;
  }

  /**
   * Insert a recipe with the circular-FK dance (recipe -> version -> link
   * currentVersionId), optionally linking the version to an equipment row.
   */
  async function insertRecipeRow(visibility: 'public' | 'draft', linkEquipmentId?: string) {
    const recipeId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    recipeIds.push(recipeId);
    versionIds.push(versionId);
    await db.insert(recipes).values({
      id: recipeId,
      slug: `test-recipe-${recipeId}`,
      title: `Test Recipe ${recipeId.slice(0, 8)}`,
      authorId: userId,
      visibility,
    });
    await db.insert(recipeVersions).values({
      id: versionId,
      recipeId,
      versionNumber: 1,
      brewMethod: 'v60',
      drinkType: 'pour_over',
      preparationNotes: '',
    });
    await db.update(recipes).set({ currentVersionId: versionId }).where(eq(recipes.id, recipeId));
    if (linkEquipmentId) {
      await db.insert(recipeEquipment).values({
        recipeVersionId: versionId,
        equipmentId: linkEquipmentId,
      });
    }
    return recipeId;
  }

  describe('getEquipment', () => {
    it('should return the equipment record when it exists', async () => {
      const row = await insertEquipmentRow({ name: 'Comandante C40', brand: 'Comandante' });

      const result = await service.getEquipment(row.id);

      expect(result.id).toBe(row.id);
      expect(result.name).toBe('Comandante C40');
      expect(result.brand).toBe('Comandante');
      expect(result.createdBy).toBe(userId);
    });

    it('should throw EQUIPMENT_NOT_FOUND when the equipment does not exist', async () => {
      await expect(service.getEquipment(crypto.randomUUID())).rejects.toThrow(
        'EQUIPMENT_NOT_FOUND',
      );
    });

    it('should throw EQUIPMENT_NOT_FOUND for soft-deleted equipment', async () => {
      const row = await insertEquipmentRow({ deletedAt: new Date() });

      await expect(service.getEquipment(row.id)).rejects.toThrow('EQUIPMENT_NOT_FOUND');
    });
  });

  describe('getEquipmentById', () => {
    it('should load from the database and populate the cache on a miss', async () => {
      const row = await insertEquipmentRow({ name: 'Fellow Stagg' });

      const result = await service.getEquipmentById(row.id);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(row.id);
      expect(result!.name).toBe('Fellow Stagg');
      const cached = await cache.get<typeof equipment.$inferSelect>(['equipment-detail', row.id]);
      expect(cached).not.toBeNull();
      expect(cached!.id).toBe(row.id);
      expect(cached!.name).toBe('Fellow Stagg');
    });

    it('should serve the cached record on a hit without re-reading the database', async () => {
      const row = await insertEquipmentRow({ name: 'Cached Grinder' });
      await service.getEquipmentById(row.id);
      // Mutate the row behind the cache's back — a cache hit returns the stale snapshot.
      await db.update(equipment).set({ name: 'Mutated Grinder' }).where(eq(equipment.id, row.id));

      const result = await service.getEquipmentById(row.id);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Cached Grinder');
    });

    it('should return null and cache nothing when the equipment does not exist', async () => {
      const missingId = crypto.randomUUID();

      const result = await service.getEquipmentById(missingId);

      expect(result).toBeNull();
      const cached = await cache.get(['equipment-detail', missingId]);
      expect(cached).toBeNull();
    });
  });

  describe('listEquipmentWithFilters', () => {
    it('should return paginated results with a total count', async () => {
      const prefix = crypto.randomUUID().slice(0, 8);
      await insertEquipmentRow({ name: `${prefix} Alpha` });
      await insertEquipmentRow({ name: `${prefix} Beta` });
      await insertEquipmentRow({ name: `${prefix} Gamma` });

      const page1 = await service.listEquipmentWithFilters({
        search: prefix,
        page: 1,
        perPage: 2,
      });
      const page2 = await service.listEquipmentWithFilters({
        search: prefix,
        page: 2,
        perPage: 2,
      });

      expect(page1.items.length).toBe(2);
      expect(page2.items.length).toBe(1);
      expect(page1.total).toBe(3);
      expect(page2.total).toBe(3);
    });

    it('should filter by type when a type is provided', async () => {
      const prefix = crypto.randomUUID().slice(0, 8);
      const grinder = await insertEquipmentRow({ name: `${prefix} Grinder`, type: 'grinder' });
      await insertEquipmentRow({ name: `${prefix} Kettle`, type: 'kettle' });

      const result = await service.listEquipmentWithFilters({
        type: 'grinder',
        search: prefix,
        page: 1,
        perPage: 10,
      });

      const ours = result.items.filter((i) => equipmentIds.includes(i.id));
      expect(ours.length).toBe(1);
      expect(ours[0].id).toBe(grinder.id);
      expect(ours[0].type).toBe('grinder');
    });

    it('should match every type when no type filter is provided', async () => {
      const prefix = crypto.randomUUID().slice(0, 8);
      await insertEquipmentRow({ name: `${prefix} Grinder`, type: 'grinder' });
      await insertEquipmentRow({ name: `${prefix} Kettle`, type: 'kettle' });

      const result = await service.listEquipmentWithFilters({
        search: prefix,
        page: 1,
        perPage: 10,
      });

      const types = result.items.map((i) => i.type).sort();
      expect(types).toEqual(['grinder', 'kettle']);
    });

    it('should exclude soft-deleted equipment', async () => {
      const prefix = crypto.randomUUID().slice(0, 8);
      const deleted = await insertEquipmentRow({
        name: `${prefix} Deleted`,
        deletedAt: new Date(),
      });

      const result = await service.listEquipmentWithFilters({
        search: prefix,
        page: 1,
        perPage: 10,
      });

      expect(result.items.some((i) => i.id === deleted.id)).toBe(false);
      expect(result.total).toBe(0);
    });
  });

  describe('searchEquipment', () => {
    it('should return equipment matching the query by name', async () => {
      const row = await insertEquipmentRow({ name: 'Comandante C40' });

      const results = await service.searchEquipment('Comandante');

      expect(results.some((r) => r.id === row.id)).toBe(true);
    });

    it('should return equipment matching the query by brand or model', async () => {
      const prefix = crypto.randomUUID().slice(0, 8);
      const byBrand = await insertEquipmentRow({ name: 'Hand Grinder', brand: `Brand-${prefix}` });
      const byModel = await insertEquipmentRow({
        name: 'Espresso Machine',
        model: `Model-${prefix}`,
        type: 'espresso_machine',
      });

      const brandResults = await service.searchEquipment(`Brand-${prefix}`);
      const modelResults = await service.searchEquipment(`Model-${prefix}`);

      expect(brandResults.some((r) => r.id === byBrand.id)).toBe(true);
      expect(modelResults.some((r) => r.id === byModel.id)).toBe(true);
    });

    it('should exclude soft-deleted equipment', async () => {
      const prefix = crypto.randomUUID().slice(0, 8);
      await insertEquipmentRow({ name: `Deleted ${prefix}`, deletedAt: new Date() });

      const results = await service.searchEquipment(`Deleted ${prefix}`);

      expect(results.length).toBe(0);
    });
  });

  describe('createEquipment', () => {
    it('should persist the equipment with createdBy set to the requesting user', async () => {
      const id = crypto.randomUUID();
      equipmentIds.push(id);

      const result = await service.createEquipment(userId, {
        id,
        name: 'New Kettle',
        type: 'kettle',
        brand: 'Fellow',
        isSystem: false,
      });

      expect(result.id).toBe(id);
      expect(result.createdBy).toBe(userId);
      const [row] = await db.select().from(equipment).where(eq(equipment.id, id));
      expect(row.name).toBe('New Kettle');
      expect(row.createdBy).toBe(userId);
    });
  });

  describe('updateEquipment', () => {
    it('should update the record when the user is the creator', async () => {
      const row = await insertEquipmentRow({ name: 'Original Name' });

      const result = await service.updateEquipment(userId, row.id, { name: 'Updated Name' });

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Updated Name');
      const [fresh] = await db.select().from(equipment).where(eq(equipment.id, row.id));
      expect(fresh.name).toBe('Updated Name');
    });

    it('should throw EQUIPMENT_NOT_FOUND when the equipment does not exist', async () => {
      await expect(
        service.updateEquipment(userId, crypto.randomUUID(), { name: 'X' }),
      ).rejects.toThrow('EQUIPMENT_NOT_FOUND');
    });

    it('should throw FORBIDDEN when the user is not the creator', async () => {
      const row = await insertEquipmentRow({ name: 'Owned Grinder' });

      await expect(
        service.updateEquipment(otherUserId, row.id, { name: 'Hacked' }),
      ).rejects.toThrow('FORBIDDEN');

      const [fresh] = await db.select().from(equipment).where(eq(equipment.id, row.id));
      expect(fresh.name).toBe('Owned Grinder');
    });

    it('should invalidate the cached detail on update', async () => {
      const row = await insertEquipmentRow({ name: 'Before Update' });
      await service.getEquipmentById(row.id);
      expect(await cache.get(['equipment-detail', row.id])).not.toBeNull();

      await service.updateEquipment(userId, row.id, { name: 'After Update' });

      expect(await cache.get(['equipment-detail', row.id])).toBeNull();
      const fresh = await service.getEquipmentById(row.id);
      expect(fresh!.name).toBe('After Update');
    });
  });

  describe('deleteEquipment', () => {
    it('should soft-delete the record when the user is the creator', async () => {
      const row = await insertEquipmentRow();

      await service.deleteEquipment(userId, row.id);

      const [fresh] = await db.select().from(equipment).where(eq(equipment.id, row.id));
      expect(fresh.deletedAt).not.toBeNull();
      await expect(service.getEquipment(row.id)).rejects.toThrow('EQUIPMENT_NOT_FOUND');
    });

    it('should throw EQUIPMENT_NOT_FOUND when the equipment does not exist', async () => {
      await expect(service.deleteEquipment(userId, crypto.randomUUID())).rejects.toThrow(
        'EQUIPMENT_NOT_FOUND',
      );
    });

    it('should throw FORBIDDEN when the user is not the creator', async () => {
      const row = await insertEquipmentRow();

      await expect(service.deleteEquipment(otherUserId, row.id)).rejects.toThrow('FORBIDDEN');

      const [fresh] = await db.select().from(equipment).where(eq(equipment.id, row.id));
      expect(fresh.deletedAt).toBeNull();
    });

    it('should invalidate the cached detail on delete', async () => {
      const row = await insertEquipmentRow();
      await service.getEquipmentById(row.id);
      expect(await cache.get(['equipment-detail', row.id])).not.toBeNull();

      await service.deleteEquipment(userId, row.id);

      expect(await cache.get(['equipment-detail', row.id])).toBeNull();
      const result = await service.getEquipmentById(row.id);
      expect(result).toBeNull();
    });
  });

  describe('requestEquipmentDeletion', () => {
    it('should create a pending delete request with the given reason', async () => {
      const row = await insertEquipmentRow();

      const result = await service.requestEquipmentDeletion(row.id, userId, 'Duplicate entry');

      expect(result.equipmentId).toBe(row.id);
      expect(result.requestedById).toBe(userId);
      expect(result.reason).toBe('Duplicate entry');
      expect(result.status).toBe('pending');
    });

    it('should default the reason to null when omitted', async () => {
      const row = await insertEquipmentRow();

      const result = await service.requestEquipmentDeletion(row.id, userId);

      expect(result.reason).toBeNull();
    });

    it('should throw EQUIPMENT_NOT_FOUND when the equipment does not exist', async () => {
      await expect(
        service.requestEquipmentDeletion(crypto.randomUUID(), userId),
      ).rejects.toThrow('EQUIPMENT_NOT_FOUND');
    });
  });

  describe('getRecipesForEquipment', () => {
    it('should return only public recipes linked to the equipment', async () => {
      const row = await insertEquipmentRow();
      const linkedId = await insertRecipeRow('public', row.id);
      await insertRecipeRow('draft', row.id);
      await insertRecipeRow('public'); // public but not linked

      const result = await service.getRecipesForEquipment(row.id, 1, 10);

      expect(result.total).toBe(1);
      expect(result.data.length).toBe(1);
      expect(result.data[0].id).toBe(linkedId);
      expect(result.data[0].author.username).toBe(`testuser-${userId}`);
    });

    it('should paginate the recipe results', async () => {
      const row = await insertEquipmentRow();
      for (let i = 0; i < 3; i++) {
        await insertRecipeRow('public', row.id);
      }

      const page1 = await service.getRecipesForEquipment(row.id, 1, 2);
      const page2 = await service.getRecipesForEquipment(row.id, 2, 2);

      expect(page1.data.length).toBe(2);
      expect(page2.data.length).toBe(1);
      expect(page1.total).toBe(3);
      expect(page2.total).toBe(3);
    });

    it('should return an empty result when no recipes use the equipment', async () => {
      const row = await insertEquipmentRow();

      const result = await service.getRecipesForEquipment(row.id, 1, 10);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });
});
