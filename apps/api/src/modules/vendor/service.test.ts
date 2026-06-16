import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { assertSpyCallArgs, assertSpyCalls, spy } from 'jsr:@std/testing/mock';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { users, vendors } from '@brewform/db/schema';
import { createVendor, deleteVendor, getVendor, log, updateVendor } from './service.ts';
import * as model from './model.ts';

describe('Vendor Service Logic', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId1: string;
  let userId2: string;
  let debugSpy: ReturnType<typeof spy>;
  let errorSpy: ReturnType<typeof spy>;
  let warnSpy: ReturnType<typeof spy>;
  let infoSpy: ReturnType<typeof spy>;

  beforeEach(async () => {
    userId1 = crypto.randomUUID();
    userId2 = crypto.randomUUID();

    debugSpy = spy(log, 'debug');
    errorSpy = spy(log, 'error');
    warnSpy = spy(log, 'warn');
    infoSpy = spy(log, 'info');

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
    debugSpy.restore();
    errorSpy.restore();
    warnSpy.restore();
    infoSpy.restore();

    await db.delete(vendors).where(eq(vendors.createdBy, userId1));
    await db.delete(vendors).where(eq(vendors.createdBy, userId2));
    await db.delete(users).where(eq(users.id, userId1));
    await db.delete(users).where(eq(users.id, userId2));
  });

  describe('createVendor', () => {
    it('should persist createdBy when creating a vendor', async () => {
      const data = { name: 'Test Roaster', website: 'https://example.com' };
      const result = await createVendor(userId1, data);

      expect(result.createdBy).toBe(userId1);
      expect(result.name).toBe('Test Roaster');

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

    it('should throw FORBIDDEN and log warn for non-owner non-admin user', async () => {
      await expect(
        updateVendor(userId2, vendorId, { name: 'Hacked' }, false),
      ).rejects.toThrow('FORBIDDEN');

      assertSpyCalls(warnSpy, 1);
      assertSpyCallArgs(warnSpy, 0, [
        { id: vendorId, userId: userId2 },
        'updateVendor failed: forbidden (not creator and not admin)',
      ]);
    });

    it('should throw VENDOR_NOT_FOUND and log error when vendor does not exist', async () => {
      const missingId = crypto.randomUUID();

      await expect(
        updateVendor(userId1, missingId, { name: 'Missing' }, false),
      ).rejects.toThrow('VENDOR_NOT_FOUND');

      assertSpyCalls(errorSpy, 1);
      const errArg = errorSpy.calls[0].args[0] as { err: Error; id: string; userId: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('VENDOR_NOT_FOUND');
      expect(errArg.id).toBe(missingId);
      expect(errArg.userId).toBe(userId1);
      expect(errorSpy.calls[0].args[1]).toBe('updateVendor failed: vendor not found');
    });
  });

  describe('getVendor', () => {
    it('should throw VENDOR_NOT_FOUND and log error for missing vendor', async () => {
      const missingId = crypto.randomUUID();

      await expect(getVendor(missingId)).rejects.toThrow('VENDOR_NOT_FOUND');

      assertSpyCalls(errorSpy, 1);
      const errArg = errorSpy.calls[0].args[0] as { err: Error; id: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('VENDOR_NOT_FOUND');
      expect(errArg.id).toBe(missingId);
      expect(errorSpy.calls[0].args[1]).toBe('getVendor failed: vendor not found');
    });
  });

  describe('deleteVendor', () => {
    it('should throw VENDOR_NOT_FOUND and log error for missing vendor', async () => {
      const missingId = crypto.randomUUID();

      await expect(deleteVendor(missingId)).rejects.toThrow('VENDOR_NOT_FOUND');

      assertSpyCalls(errorSpy, 1);
      const errArg = errorSpy.calls[0].args[0] as { err: Error; id: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('VENDOR_NOT_FOUND');
      expect(errArg.id).toBe(missingId);
      expect(errorSpy.calls[0].args[1]).toBe('deleteVendor failed: vendor not found');
    });
  });
});
