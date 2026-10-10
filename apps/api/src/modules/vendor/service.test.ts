import '../../test-setup.ts';
import { db } from '@brewform/db';
import { users, vendors } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as model from './model.ts';
import { createVendor, deleteVendor, getVendor, log, updateVendor } from './service.ts';

describe('Vendor Service Logic', () => {
  let userId1: string;
  let userId2: string;
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    userId1 = crypto.randomUUID();
    userId2 = crypto.randomUUID();

    debugSpy = vi.spyOn(log, 'debug');
    errorSpy = vi.spyOn(log, 'error');
    warnSpy = vi.spyOn(log, 'warn');
    infoSpy = vi.spyOn(log, 'info');

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
    debugSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();

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
      await expect(updateVendor(userId2, vendorId, { name: 'Hacked' }, false)).rejects.toThrow(
        'FORBIDDEN',
      );

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenNthCalledWith(
        1,
        { id: vendorId, userId: userId2 },
        'updateVendor failed: forbidden (not creator and not admin)',
      );
    });

    it('should throw VENDOR_NOT_FOUND and log error when vendor does not exist', async () => {
      const missingId = crypto.randomUUID();

      await expect(updateVendor(userId1, missingId, { name: 'Missing' }, false)).rejects.toThrow(
        'VENDOR_NOT_FOUND',
      );

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const errArg = errorSpy.mock.calls[0][0] as { err: Error; id: string; userId: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('VENDOR_NOT_FOUND');
      expect(errArg.id).toBe(missingId);
      expect(errArg.userId).toBe(userId1);
      expect(errorSpy.mock.calls[0][1]).toBe('updateVendor failed: vendor not found');
    });
  });

  describe('getVendor', () => {
    it('should throw VENDOR_NOT_FOUND and log error for missing vendor', async () => {
      const missingId = crypto.randomUUID();

      await expect(getVendor(missingId)).rejects.toThrow('VENDOR_NOT_FOUND');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const errArg = errorSpy.mock.calls[0][0] as { err: Error; id: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('VENDOR_NOT_FOUND');
      expect(errArg.id).toBe(missingId);
      expect(errorSpy.mock.calls[0][1]).toBe('getVendor failed: vendor not found');
    });
  });

  describe('deleteVendor', () => {
    it('should throw VENDOR_NOT_FOUND and log error for missing vendor', async () => {
      const missingId = crypto.randomUUID();

      await expect(deleteVendor(missingId)).rejects.toThrow('VENDOR_NOT_FOUND');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const errArg = errorSpy.mock.calls[0][0] as { err: Error; id: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('VENDOR_NOT_FOUND');
      expect(errArg.id).toBe(missingId);
      expect(errorSpy.mock.calls[0][1]).toBe('deleteVendor failed: vendor not found');
    });
  });
});
