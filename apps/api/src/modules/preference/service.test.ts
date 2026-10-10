import '../../test-setup.ts';
import { db } from '@brewform/db';
import { userPreferences, users } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPreferences, log, updatePreferences } from './service.ts';

describe('Preference Service Logic', () => {
  let userId: string;
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    userId = crypto.randomUUID();

    debugSpy = vi.spyOn(log, 'debug');
    errorSpy = vi.spyOn(log, 'error');

    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    debugSpy.mockRestore();
    errorSpy.mockRestore();

    await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  describe('getPreferences', () => {
    it('should log entry/exit when preferences are found', async () => {
      await db.insert(userPreferences).values({
        userId,
        unitSystem: 'imperial',
      });

      const result = await getPreferences(userId);

      expect(result.unitSystem).toBe('imperial');
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { userId }, 'getPreferences started');
      expect(debugSpy).toHaveBeenNthCalledWith(2, { userId }, 'getPreferences completed');
    });

    it('should log error and throw PREFERENCES_NOT_FOUND when none exist', async () => {
      await expect(getPreferences(userId)).rejects.toThrow('PREFERENCES_NOT_FOUND');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const errArg = errorSpy.mock.calls[0][0] as { err: Error; userId: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('PREFERENCES_NOT_FOUND');
      expect(errArg.userId).toBe(userId);
      expect(errorSpy.mock.calls[0][1]).toBe('getPreferences failed: preferences not found');
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { userId }, 'getPreferences started');
    });
  });

  describe('updatePreferences', () => {
    it('should log entry/exit when inserting preferences', async () => {
      const result = await updatePreferences(userId, { theme: 'dark' });

      expect(result.theme).toBe('dark');
      expect(result.userId).toBe(userId);
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { userId }, 'updatePreferences started');
      expect(debugSpy).toHaveBeenNthCalledWith(2, { userId }, 'updatePreferences completed');
    });

    it('should log entry/exit when updating existing preferences', async () => {
      await db.insert(userPreferences).values({ userId, theme: 'light' });

      const result = await updatePreferences(userId, { theme: 'dark' });

      expect(result.theme).toBe('dark');
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { userId }, 'updatePreferences started');
      expect(debugSpy).toHaveBeenNthCalledWith(2, { userId }, 'updatePreferences completed');
    });
  });
});
