import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { users, vendors } from '@brewform/db/schema';
import { createVendor, getVendor, updateVendor } from './service.ts';
import * as model from './model.ts';

describe('Vendor Service Logic', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId1: string;
  let userId2: string;

  beforeEach(async () => {
    userId1 = crypto.randomUUID();
    userId2 = crypto.randomUUID();

    await db.insert(users).values({
      id: userId1,
      email: `test-${userId1}@example.com`,
      username: `testuser-${userId1}`,
      passwordHash: 'hash',
    });

    await db.insert(users).values({
      id: userId2,
      email: `test-${userId2}@example.com`,
      username: `testuser-${userId2}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    await db.delete(vendors).where(eq(vendors.createdBy, userId1));
    await db.delete(vendors).where(eq(vendors.createdBy, userId2));
    await db.delete(users).where(eq(users.id, userId1));
    await db.delete(users).where(eq(users.id, userId2));
  });

  describe('createVendor', () => {
    it('should persist createdBy when creating a vendor', async () => {
      const data = { name: 'Test Roaster', website: 'https://example.com' };
      const result = await createVendor(userId1, data);

      // Verify the returned record carries createdBy
      expect(result.createdBy).toBe(userId1);
      expect(result.name).toBe('Test Roaster');

      // Verify by reading back from the database via model helpers
      // (tests service → model → database flow end-to-end)
      const persisted = await model.findById(result.id);
      expect(persisted).not.toBeNull();
      expect(persisted!.createdBy).toBe(userId1);
      expect(persisted!.name).toBe('Test Roaster');
    });
  });

  describe('updateVendor', () => {
    let vendorId: string;

    beforeEach(async () => {
      const result = await createVendor(userId1, { name: 'Original Roaster' });
      vendorId = result.id;
    });

    it('should allow owner (isAdmin=false) to update their own vendor', async () => {
      const updated = await updateVendor(userId1, vendorId, { name: 'Updated Roaster' }, false);
      expect(updated.name).toBe('Updated Roaster');

      // Verify persistence via model read-back
      const persisted = await model.findById(vendorId);
      expect(persisted).not.toBeNull();
      expect(persisted!.name).toBe('Updated Roaster');
    });

    it('should allow admin (isAdmin=true) to update any vendor', async () => {
      const updated = await updateVendor(userId2, vendorId, { name: 'Admin Updated' }, true);
      expect(updated.name).toBe('Admin Updated');

      const persisted = await model.findById(vendorId);
      expect(persisted).not.toBeNull();
      expect(persisted!.name).toBe('Admin Updated');
    });

    it('should throw FORBIDDEN for non-owner non-admin user', async () => {
      await expect(
        updateVendor(userId2, vendorId, { name: 'Hacked' }, false),
      ).rejects.toThrow('FORBIDDEN');
    });
  });

  describe('Vendor CRUD', () => {
    it('should throw VENDOR_NOT_FOUND for missing vendor', async () => {
      await expect(getVendor(crypto.randomUUID())).rejects.toThrow('VENDOR_NOT_FOUND');
    });
  });
});
