import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  createCoffeeVariety,
  deleteCoffeeVariety,
  getCoffeeVarietyById,
  getRecipesForVariety,
  updateCoffeeVariety,
} from './service.ts';
import * as model from './model.ts';
import { cacheProvider, setCacheProvider } from '../../utils/cache/singleton.ts';
import type { CacheProvider } from '../../utils/cache/index.ts';

function createMockModel(overrides: Partial<typeof model> = {}): typeof model {
  return { ...model, ...overrides } as typeof model;
}

describe('Coffee Variety Service', () => {
  let originalCache: CacheProvider;

  beforeEach(() => {
    originalCache = cacheProvider;
    setCacheProvider({
      get: () => Promise.resolve(null),
      set: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      deleteByPrefix: () => Promise.resolve(),
    } as CacheProvider);
  });

  afterEach(() => {
    setCacheProvider(originalCache);
  });

  describe('getCoffeeVarietyById', () => {
    it('should return null for missing variety', async () => {
      const mockModel = createMockModel({
        findById: () => Promise.resolve(null),
      });
      const result = await getCoffeeVarietyById('nonexistent', { model: mockModel });
      expect(result).toBeNull();
    });

    it('should return variety when found', async () => {
      const variety = { id: 'var-1', name: 'Arabica', category: 'variety' } as any;
      const mockModel = createMockModel({
        findById: () => Promise.resolve(variety),
      });
      const result = await getCoffeeVarietyById('var-1', { model: mockModel });
      expect(result).toBeDefined();
      expect(result?.name).toBe('Arabica');
    });
  });

  describe('createCoffeeVariety', () => {
    it('should set createdBy to the provided userId', async () => {
      const userId = 'user-42';
      const data = { name: 'Geisha', category: 'variety' } as any;
      let capturedData: any;
      const mockModel = createMockModel({
        create: (d: any) => {
          capturedData = d;
          return Promise.resolve({ ...d, id: 'var-new' });
        },
      });
      await createCoffeeVariety(data, userId, { model: mockModel });
      expect(capturedData.createdBy).toBe('user-42');
    });

    it('should set isSystem to false for user-created varieties', async () => {
      const userId = 'user-42';
      const data = { name: 'Geisha', category: 'variety' } as any;
      let capturedData: any;
      const mockModel = createMockModel({
        create: (d: any) => {
          capturedData = d;
          return Promise.resolve({ ...d, id: 'var-new' });
        },
      });
      await createCoffeeVariety(data, userId, { model: mockModel });
      expect(capturedData.isSystem).toBe(false);
    });
  });

  describe('updateCoffeeVariety', () => {
    it('should throw when variety is not found', async () => {
      const mockModel = createMockModel({
        findById: () => Promise.resolve(null),
      });
      await expect(updateCoffeeVariety('nonexistent', {}, 'user-1', { model: mockModel }))
        .rejects.toThrow('COFFEE_VARIETY_NOT_FOUND');
    });

    it('should block system variety updates', async () => {
      const mockModel = createMockModel({
        findById: () => Promise.resolve({ id: 'var-1', isSystem: true } as any),
      });
      await expect(updateCoffeeVariety('var-1', {}, 'user-1', { model: mockModel }))
        .rejects.toThrow('SYSTEM_VARIETY_IMMUTABLE');
    });

    it('should throw FORBIDDEN when non-owner tries to update a user-created variety', async () => {
      const mockModel = createMockModel({
        findById: () =>
          Promise.resolve({ id: 'var-1', isSystem: false, createdBy: 'owner-1' } as any),
      });
      await expect(updateCoffeeVariety('var-1', {}, 'not-owner', { model: mockModel }))
        .rejects.toThrow('FORBIDDEN');
    });

    it('should allow owner to update their own variety', async () => {
      const mockModel = createMockModel({
        findById: () =>
          Promise.resolve({ id: 'var-1', isSystem: false, createdBy: 'owner-1' } as any),
        update: () => Promise.resolve({ id: 'var-1', name: 'Updated' } as any),
      });
      const result = await updateCoffeeVariety('var-1', { name: 'Updated' }, 'owner-1', {
        model: mockModel,
      });
      expect(result).toBeDefined();
    });

    it('should allow admin to update any user-created variety', async () => {
      const mockModel = createMockModel({
        findById: () =>
          Promise.resolve({ id: 'var-1', isSystem: false, createdBy: 'owner-1' } as any),
        update: () => Promise.resolve({ id: 'var-1', name: 'Updated' } as any),
      });
      const result = await updateCoffeeVariety('var-1', { name: 'Updated' }, 'admin-user', {
        model: mockModel,
      }, true);
      expect(result).toBeDefined();
    });

    it('should still throw SYSTEM_VARIETY_IMMUTABLE for system varieties regardless of admin status', async () => {
      const mockModel = createMockModel({
        findById: () => Promise.resolve({ id: 'var-1', isSystem: true, createdBy: null } as any),
      });
      await expect(updateCoffeeVariety('var-1', {}, 'admin-user', { model: mockModel }, true))
        .rejects.toThrow('SYSTEM_VARIETY_IMMUTABLE');
    });
  });

  describe('deleteCoffeeVariety', () => {
    it('should throw when variety is not found', async () => {
      const mockModel = createMockModel({
        findById: () => Promise.resolve(null),
      });
      await expect(deleteCoffeeVariety('nonexistent', 'user-1', { model: mockModel }))
        .rejects.toThrow('COFFEE_VARIETY_NOT_FOUND');
    });

    it('should block system variety deletion', async () => {
      const mockModel = createMockModel({
        findById: () => Promise.resolve({ id: 'var-1', isSystem: true } as any),
      });
      await expect(deleteCoffeeVariety('var-1', 'user-1', { model: mockModel }))
        .rejects.toThrow('SYSTEM_VARIETY_IMMUTABLE');
    });

    it('should throw FORBIDDEN when non-owner tries to delete a user-created variety', async () => {
      const mockModel = createMockModel({
        findById: () =>
          Promise.resolve({ id: 'var-1', isSystem: false, createdBy: 'owner-1' } as any),
      });
      await expect(deleteCoffeeVariety('var-1', 'not-owner', { model: mockModel }))
        .rejects.toThrow('FORBIDDEN');
    });

    it('should allow admin to delete any user-created variety', async () => {
      const mockModel = createMockModel({
        findById: () =>
          Promise.resolve({ id: 'var-1', isSystem: false, createdBy: 'owner-1' } as any),
        softDelete: () => Promise.resolve({ id: 'var-1' } as any),
      });
      const result = await deleteCoffeeVariety('var-1', 'admin-user', { model: mockModel }, true);
      expect(result).toBeDefined();
    });
  });

  describe('getRecipesForVariety pagination', () => {
    it('should pass correct arguments to the model', async () => {
      let capturedArgs: [string, number, number] | null = null;
      const mockModel = createMockModel({
        getRecipesUsingVariety: (varietyId, page, perPage) => {
          capturedArgs = [varietyId, page, perPage];
          return Promise.resolve({ data: [], total: 0 } as any);
        },
      });
      await getRecipesForVariety('var-1', 2, 12, { model: mockModel });
      expect(capturedArgs).toEqual(['var-1', 2, 12]);
    });

    it('should return total count from the model result', async () => {
      const mockModel = createMockModel({
        getRecipesUsingVariety: () => Promise.resolve({ data: [{ id: 'r1' }], total: 15 } as any),
      });
      const result = await getRecipesForVariety('var-1', 1, 12, { model: mockModel });
      expect(result.total).toBe(15);
    });
  });
});
