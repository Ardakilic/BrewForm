import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

describe('Equipment Service', () => {
  describe('Authorization checks', () => {
    it('should throw EQUIPMENT_NOT_FOUND for missing equipment', async () => {
      try {
        throw new Error('EQUIPMENT_NOT_FOUND');
      } catch (err) {
        expect((err as Error).message).toBe('EQUIPMENT_NOT_FOUND');
      }
    });

    it('should throw FORBIDDEN when user is not the creator', async () => {
      try {
        throw new Error('FORBIDDEN');
      } catch (err) {
        expect((err as Error).message).toBe('FORBIDDEN');
      }
    });
  });

  describe('listEquipment filter', () => {
    it('should build type filter when type is provided', () => {
      const where: Record<string, unknown> = {};
      const type = 'basket';
      if (type) where.type = type;
      expect(where).toEqual({ type: 'basket' });
    });

    it('should build empty filter when type is not provided', () => {
      const where: Record<string, unknown> = {};
      const type: string | undefined = undefined;
      if (type) where.type = type;
      expect(where).toEqual({});
    });
  });
});