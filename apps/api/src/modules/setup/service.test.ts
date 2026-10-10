import '../../test-setup.ts';
import { db } from '@brewform/db';
import { setups, users } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSetup,
  deleteSetup,
  getSetup,
  listSetups,
  log,
  setDefault,
  updateSetup,
} from './service.ts';

describe('Setup Service Logic', () => {
  let userId: string;
  let otherUserId: string;
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    otherUserId = crypto.randomUUID();

    debugSpy = vi.spyOn(log, 'debug');
    errorSpy = vi.spyOn(log, 'error');
    warnSpy = vi.spyOn(log, 'warn');

    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(users).values({
      id: otherUserId,
      email: `test-${otherUserId}@example.com`,
      username: `testuser-${otherUserId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    debugSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();

    await db.delete(setups).where(eq(setups.userId, userId));
    await db.delete(setups).where(eq(setups.userId, otherUserId));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(users).where(eq(users.id, otherUserId));
  });

  describe('listSetups', () => {
    it('should log entry/exit and return paginated setups', async () => {
      await db.insert(setups).values({ name: 'Setup One', userId });

      const result = await listSetups(userId, 1, 10);

      expect(result.setups).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(
        1,
        { userId, page: 1, perPage: 10 },
        'listSetups started',
      );
      expect(debugSpy).toHaveBeenNthCalledWith(
        2,
        { userId, page: 1, perPage: 10, total: 1 },
        'listSetups completed',
      );
    });
  });

  describe('getSetup', () => {
    it('should log entry/exit when setup is found', async () => {
      const [setup] = await db.insert(setups).values({ name: 'Setup One', userId }).returning();

      const result = await getSetup(setup.id);

      expect(result.id).toBe(setup.id);
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { id: setup.id }, 'getSetup started');
      expect(debugSpy).toHaveBeenNthCalledWith(2, { id: setup.id }, 'getSetup completed');
    });

    it('should log error and throw SETUP_NOT_FOUND when setup does not exist', async () => {
      const missingId = crypto.randomUUID();

      await expect(getSetup(missingId)).rejects.toThrow('SETUP_NOT_FOUND');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const errArg = errorSpy.mock.calls[0][0] as { err: Error; id: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('SETUP_NOT_FOUND');
      expect(errArg.id).toBe(missingId);
      expect(errorSpy.mock.calls[0][1]).toBe('getSetup failed: setup not found');
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { id: missingId }, 'getSetup started');
    });
  });

  describe('createSetup', () => {
    it('should log entry/exit and debug clearDefault when creating a default setup', async () => {
      await db.insert(setups).values({ name: 'Existing Default', userId, isDefault: true });

      const result = await createSetup(userId, { name: 'New Default', isDefault: true });

      expect(result.isDefault).toBe(true);
      expect(debugSpy).toHaveBeenCalledTimes(3);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { userId }, 'createSetup started');
      expect(debugSpy).toHaveBeenNthCalledWith(
        2,
        { userId },
        'createSetup clearing defaults for user',
      );
      expect(debugSpy).toHaveBeenNthCalledWith(
        3,
        { userId, setupId: result.id },
        'createSetup completed',
      );

      const rows = await db
        .select({ isDefault: setups.isDefault })
        .from(setups)
        .where(eq(setups.userId, userId));
      expect(rows.filter((r) => r.isDefault).length).toBe(1);
    });

    it('should not clear defaults when creating a non-default setup', async () => {
      const result = await createSetup(userId, { name: 'Non-Default', isDefault: false });

      expect(result.isDefault).toBe(false);
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { userId }, 'createSetup started');
      expect(debugSpy).toHaveBeenNthCalledWith(
        2,
        { userId, setupId: result.id },
        'createSetup completed',
      );
    });
  });

  describe('updateSetup', () => {
    it('should log entry/exit when owner updates a setup', async () => {
      const [setup] = await db.insert(setups).values({ name: 'Setup One', userId }).returning();

      const result = await updateSetup(userId, setup.id, { name: 'Updated Setup' });

      expect(result.name).toBe('Updated Setup');
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { userId, id: setup.id }, 'updateSetup started');
      expect(debugSpy).toHaveBeenNthCalledWith(
        2,
        { userId, id: setup.id },
        'updateSetup completed',
      );
    });

    it('should log debug clearDefault when promoting setup to default', async () => {
      const [setup] = await db.insert(setups).values({ name: 'Setup One', userId }).returning();
      await db.insert(setups).values({ name: 'Existing Default', userId, isDefault: true });

      await updateSetup(userId, setup.id, { isDefault: true });

      expect(debugSpy).toHaveBeenCalledTimes(3);
      expect(debugSpy).toHaveBeenNthCalledWith(
        2,
        { userId },
        'updateSetup clearing defaults for user',
      );
    });

    it('should log error and throw SETUP_NOT_FOUND when setup does not exist', async () => {
      const missingId = crypto.randomUUID();

      await expect(updateSetup(userId, missingId, { name: 'X' })).rejects.toThrow(
        'SETUP_NOT_FOUND',
      );

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const errArg = errorSpy.mock.calls[0][0] as { err: Error; id: string; userId: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('SETUP_NOT_FOUND');
      expect(errArg.id).toBe(missingId);
      expect(errArg.userId).toBe(userId);
      expect(errorSpy.mock.calls[0][1]).toBe('updateSetup failed: setup not found');
      expect(debugSpy).toHaveBeenCalledTimes(1);
    });

    it('should log warn and throw FORBIDDEN when user does not own the setup', async () => {
      const [setup] = await db.insert(setups).values({ name: 'Setup One', userId }).returning();

      await expect(updateSetup(otherUserId, setup.id, { name: 'Hacked' })).rejects.toThrow(
        'FORBIDDEN',
      );

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenNthCalledWith(
        1,
        { id: setup.id, userId: otherUserId, ownerId: userId },
        'updateSetup failed: forbidden',
      );
    });
  });

  describe('deleteSetup', () => {
    it('should log entry/exit when owner deletes a setup', async () => {
      const [setup] = await db.insert(setups).values({ name: 'Setup One', userId }).returning();

      await deleteSetup(userId, setup.id);

      const [row] = await db
        .select({ deletedAt: setups.deletedAt })
        .from(setups)
        .where(eq(setups.id, setup.id));
      expect(row.deletedAt).not.toBeNull();
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { userId, id: setup.id }, 'deleteSetup started');
      expect(debugSpy).toHaveBeenNthCalledWith(
        2,
        { userId, id: setup.id },
        'deleteSetup completed',
      );
    });

    it('should log error and throw SETUP_NOT_FOUND when setup does not exist', async () => {
      const missingId = crypto.randomUUID();

      await expect(deleteSetup(userId, missingId)).rejects.toThrow('SETUP_NOT_FOUND');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const errArg = errorSpy.mock.calls[0][0] as { err: Error; id: string; userId: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('SETUP_NOT_FOUND');
      expect(errArg.id).toBe(missingId);
      expect(errArg.userId).toBe(userId);
      expect(errorSpy.mock.calls[0][1]).toBe('deleteSetup failed: setup not found');
      expect(debugSpy).toHaveBeenCalledTimes(1);
    });

    it('should log warn and throw FORBIDDEN when user does not own the setup', async () => {
      const [setup] = await db.insert(setups).values({ name: 'Setup One', userId }).returning();

      await expect(deleteSetup(otherUserId, setup.id)).rejects.toThrow('FORBIDDEN');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenNthCalledWith(
        1,
        { id: setup.id, userId: otherUserId, ownerId: userId },
        'deleteSetup failed: forbidden',
      );
    });
  });

  describe('setDefault', () => {
    it('should log entry/exit and debug clearDefault when setting default', async () => {
      const [setup] = await db.insert(setups).values({ name: 'Setup One', userId }).returning();

      const result = await setDefault(userId, setup.id);

      expect(result!.isDefault).toBe(true);
      expect(debugSpy).toHaveBeenCalledTimes(3);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { userId, id: setup.id }, 'setDefault started');
      expect(debugSpy).toHaveBeenNthCalledWith(
        2,
        { userId },
        'setDefault clearing defaults for user',
      );
      expect(debugSpy).toHaveBeenNthCalledWith(3, { userId, id: setup.id }, 'setDefault completed');
    });

    it('should log error and throw SETUP_NOT_FOUND when setup does not exist', async () => {
      const missingId = crypto.randomUUID();

      await expect(setDefault(userId, missingId)).rejects.toThrow('SETUP_NOT_FOUND');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const errArg = errorSpy.mock.calls[0][0] as { err: Error; id: string; userId: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('SETUP_NOT_FOUND');
      expect(errArg.id).toBe(missingId);
      expect(errArg.userId).toBe(userId);
      expect(errorSpy.mock.calls[0][1]).toBe('setDefault failed: setup not found');
      expect(debugSpy).toHaveBeenCalledTimes(1);
    });

    it('should log warn and throw FORBIDDEN when user does not own the setup', async () => {
      const [setup] = await db.insert(setups).values({ name: 'Setup One', userId }).returning();

      await expect(setDefault(otherUserId, setup.id)).rejects.toThrow('FORBIDDEN');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenNthCalledWith(
        1,
        { id: setup.id, userId: otherUserId, ownerId: userId },
        'setDefault failed: forbidden',
      );
    });
  });
});
