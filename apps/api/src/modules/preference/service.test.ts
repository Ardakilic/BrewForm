import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { assertSpyCallArgs, assertSpyCalls, spy } from 'jsr:@std/testing/mock';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { userPreferences, users } from '@brewform/db/schema';
import { getPreferences, log, updatePreferences } from './service.ts';

describe('Preference Service Logic', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let debugSpy: ReturnType<typeof spy>;
  let errorSpy: ReturnType<typeof spy>;

  beforeEach(async () => {
    userId = crypto.randomUUID();

    debugSpy = spy(log, 'debug');
    errorSpy = spy(log, 'error');

    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    debugSpy.restore();
    errorSpy.restore();

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
      assertSpyCalls(debugSpy, 2);
      assertSpyCallArgs(debugSpy, 0, [{ userId }, 'getPreferences started']);
      assertSpyCallArgs(debugSpy, 1, [{ userId }, 'getPreferences completed']);
    });

    it('should log error and throw PREFERENCES_NOT_FOUND when none exist', async () => {
      await expect(getPreferences(userId)).rejects.toThrow('PREFERENCES_NOT_FOUND');

      assertSpyCalls(errorSpy, 1);
      const errArg = errorSpy.calls[0].args[0] as { err: Error; userId: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('PREFERENCES_NOT_FOUND');
      expect(errArg.userId).toBe(userId);
      expect(errorSpy.calls[0].args[1]).toBe('getPreferences failed: preferences not found');
      assertSpyCalls(debugSpy, 1);
      assertSpyCallArgs(debugSpy, 0, [{ userId }, 'getPreferences started']);
    });
  });

  describe('updatePreferences', () => {
    it('should log entry/exit when inserting preferences', async () => {
      const result = await updatePreferences(userId, { theme: 'dark' });

      expect(result.theme).toBe('dark');
      expect(result.userId).toBe(userId);
      assertSpyCalls(debugSpy, 2);
      assertSpyCallArgs(debugSpy, 0, [{ userId }, 'updatePreferences started']);
      assertSpyCallArgs(debugSpy, 1, [{ userId }, 'updatePreferences completed']);
    });

    it('should log entry/exit when updating existing preferences', async () => {
      await db.insert(userPreferences).values({ userId, theme: 'light' });

      const result = await updatePreferences(userId, { theme: 'dark' });

      expect(result.theme).toBe('dark');
      assertSpyCalls(debugSpy, 2);
      assertSpyCallArgs(debugSpy, 0, [{ userId }, 'updatePreferences started']);
      assertSpyCallArgs(debugSpy, 1, [{ userId }, 'updatePreferences completed']);
    });
  });
});
