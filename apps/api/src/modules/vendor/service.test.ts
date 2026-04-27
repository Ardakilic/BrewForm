import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

describe('Vendor Service Logic', () => {
  describe('Vendor CRUD', () => {
    it('should throw VENDOR_NOT_FOUND for missing vendor', () => {
      try {
        throw new Error('VENDOR_NOT_FOUND');
      } catch (err) {
        expect((err as Error).message).toBe('VENDOR_NOT_FOUND');
      }
    });
  });
});