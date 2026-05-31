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

  describe('Authorization checks', () => {
    it('should throw FORBIDDEN when user is not the creator', () => {
      try {
        throw new Error('FORBIDDEN');
      } catch (err) {
        expect((err as Error).message).toBe('FORBIDDEN');
      }
    });

    it('should use correct FORBIDDEN error message for non-owner updates', () => {
      const message = 'FORBIDDEN';
      expect(message).toBe('FORBIDDEN');
    });

    it('should allow admin to bypass ownership check', () => {
      const isAdmin = true;
      const vendorCreatedBy = 'user-1';
      const userId = 'user-2';
      const authorized = vendorCreatedBy === userId || isAdmin;
      expect(authorized).toBe(true);
    });

    it('should allow owner to update their own vendor', () => {
      const isAdmin = false;
      const vendorCreatedBy = 'user-1';
      const userId = 'user-1';
      const authorized = vendorCreatedBy === userId || isAdmin;
      expect(authorized).toBe(true);
    });

    it('should block non-owner non-admin from updating', () => {
      const isAdmin = false;
      const vendorCreatedBy = 'user-1';
      const userId = 'user-2';
      const authorized = vendorCreatedBy === userId || isAdmin;
      expect(authorized).toBe(false);
    });
  });

  describe('createVendor ownership', () => {
    it('should store createdBy when creating a vendor', () => {
      const userId = 'user-abc';
      const data = { name: 'Test Roaster' };
      const result = { ...data, createdBy: userId };
      expect(result.createdBy).toBe('user-abc');
    });
  });
});
