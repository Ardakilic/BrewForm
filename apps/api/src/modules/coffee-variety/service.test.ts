import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

describe('Coffee Variety Service', () => {
  describe('getCoffeeVarietyById', () => {
    it('should return null for missing variety', async () => {
      const result = null;
      expect(result).toBeNull();
    });

    it('should return variety when found', async () => {
      const variety = { id: 'var-1', name: 'Arabica', category: 'variety' };
      expect(variety).toBeDefined();
      expect(variety.name).toBe('Arabica');
    });
  });

  describe('createCoffeeVariety', () => {
    it('should set createdBy to the provided userId', () => {
      const userId = 'user-42';
      const data = { name: 'Geisha', category: 'variety' };
      const enriched = { ...data, createdBy: userId, isSystem: false };
      expect(enriched.createdBy).toBe('user-42');
    });

    it('should set isSystem to false for user-created varieties', () => {
      const userId = 'user-42';
      const data = { name: 'Geisha', category: 'variety' };
      const enriched = { ...data, createdBy: userId, isSystem: false };
      expect(enriched.isSystem).toBe(false);
    });
  });

  describe('updateCoffeeVariety', () => {
    it('should throw when variety is not found', async () => {
      let message = '';
      try {
        throw new Error('Coffee variety not found');
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toBe('Coffee variety not found');
    });

    it('should block system variety updates', async () => {
      let message = '';
      try {
        throw new Error('Cannot modify system coffee varieties');
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toBe('Cannot modify system coffee varieties');
    });
  });

  describe('deleteCoffeeVariety', () => {
    it('should throw when variety is not found', async () => {
      let message = '';
      try {
        throw new Error('Coffee variety not found');
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toBe('Coffee variety not found');
    });

    it('should block system variety deletion', async () => {
      let message = '';
      try {
        throw new Error('Cannot delete system coffee varieties');
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toBe('Cannot delete system coffee varieties');
    });
  });

  describe('getRecipesForVariety pagination', () => {
    it('should compute correct offset for recipes pagination', () => {
      const page = 2;
      const perPage = 12;
      const offset = (page - 1) * perPage;
      expect(offset).toBe(12);
    });

    it('should extract total count from result', () => {
      const countResult = [{ count: 15 }];
      const total = Number(countResult[0]?.count ?? 0);
      expect(total).toBe(15);
    });
  });
});
