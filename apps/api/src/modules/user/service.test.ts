import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { assertSpyCallArgs, assertSpyCalls, spy } from 'jsr:@std/testing/mock';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { users } from '@brewform/db/schema';
import { deleteAccount, getProfile, getPublicProfile, log, updateProfile } from './service.ts';

describe('User Service', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let username: string;
  let debugSpy: ReturnType<typeof spy>;
  let errorSpy: ReturnType<typeof spy>;
  let warnSpy: ReturnType<typeof spy>;
  let infoSpy: ReturnType<typeof spy>;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    username = `testuser-${userId}`;

    debugSpy = spy(log, 'debug');
    errorSpy = spy(log, 'error');
    warnSpy = spy(log, 'warn');
    infoSpy = spy(log, 'info');

    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    debugSpy.restore();
    errorSpy.restore();
    warnSpy.restore();
    infoSpy.restore();

    await db.delete(users).where(eq(users.id, userId));
  });

  describe('getProfile', () => {
    it('should log entry/exit when user is found', async () => {
      const result = await getProfile(userId);

      expect(result.id).toBe(userId);
      expect(result.username).toBe(username);
      assertSpyCalls(debugSpy, 2);
      assertSpyCallArgs(debugSpy, 0, [{ userId }, 'getProfile started']);
      assertSpyCallArgs(debugSpy, 1, [{ userId }, 'getProfile completed']);
    });

    it('should log error and throw USER_NOT_FOUND when user does not exist', async () => {
      const missingId = crypto.randomUUID();

      await expect(getProfile(missingId)).rejects.toThrow('USER_NOT_FOUND');

      assertSpyCalls(errorSpy, 1);
      const errArg = errorSpy.calls[0].args[0] as { err: Error; userId: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('USER_NOT_FOUND');
      expect(errArg.userId).toBe(missingId);
      expect(errorSpy.calls[0].args[1]).toBe('getProfile failed: user not found');
      assertSpyCalls(debugSpy, 1);
      assertSpyCallArgs(debugSpy, 0, [{ userId: missingId }, 'getProfile started']);
    });
  });

  describe('getPublicProfile', () => {
    it('should log entry/exit when username is found', async () => {
      const result = await getPublicProfile(username);

      expect(result.username).toBe(username);
      expect(result.isFollowing).toBe(false);
      assertSpyCalls(debugSpy, 2);
      assertSpyCallArgs(debugSpy, 0, [
        { username, requesterId: undefined },
        'getPublicProfile started',
      ]);
      assertSpyCallArgs(debugSpy, 1, [
        { username, requesterId: undefined },
        'getPublicProfile completed',
      ]);
    });

    it('should include requesterId in logs when provided', async () => {
      const result = await getPublicProfile(username, userId);

      expect(result.isFollowing).toBe(false);
      assertSpyCallArgs(debugSpy, 0, [
        { username, requesterId: userId },
        'getPublicProfile started',
      ]);
      assertSpyCallArgs(debugSpy, 1, [
        { username, requesterId: userId },
        'getPublicProfile completed',
      ]);
    });

    it('should log error and throw USER_NOT_FOUND when username does not exist', async () => {
      const missingUsername = `missing-${crypto.randomUUID()}`;

      await expect(getPublicProfile(missingUsername)).rejects.toThrow('USER_NOT_FOUND');

      assertSpyCalls(errorSpy, 1);
      const errArg = errorSpy.calls[0].args[0] as { err: Error; username: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('USER_NOT_FOUND');
      expect(errArg.username).toBe(missingUsername);
      expect(errorSpy.calls[0].args[1]).toBe('getPublicProfile failed: user not found');
      assertSpyCalls(debugSpy, 1);
      assertSpyCallArgs(debugSpy, 0, [
        { username: missingUsername, requesterId: undefined },
        'getPublicProfile started',
      ]);
    });
  });

  describe('updateProfile', () => {
    it('should log entry/exit when user is updated', async () => {
      const result = await updateProfile(userId, { displayName: 'Updated Name' });

      expect(result.displayName).toBe('Updated Name');
      assertSpyCalls(debugSpy, 2);
      assertSpyCallArgs(debugSpy, 0, [{ userId }, 'updateProfile started']);
      assertSpyCallArgs(debugSpy, 1, [{ userId }, 'updateProfile completed']);
    });

    it('should log error and throw USER_NOT_FOUND when user does not exist', async () => {
      const missingId = crypto.randomUUID();

      await expect(updateProfile(missingId, { displayName: 'X' })).rejects.toThrow(
        'USER_NOT_FOUND',
      );

      assertSpyCalls(errorSpy, 1);
      const errArg = errorSpy.calls[0].args[0] as { err: Error; userId: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('USER_NOT_FOUND');
      expect(errArg.userId).toBe(missingId);
      expect(errorSpy.calls[0].args[1]).toBe('updateProfile failed: user not found');
      assertSpyCalls(debugSpy, 1);
      assertSpyCallArgs(debugSpy, 0, [{ userId: missingId }, 'updateProfile started']);
    });
  });

  describe('deleteAccount', () => {
    it('should log entry/exit when account is soft-deleted', async () => {
      await deleteAccount(userId);

      const [row] = await db.select({ deletedAt: users.deletedAt }).from(users).where(
        eq(users.id, userId),
      );
      expect(row.deletedAt).not.toBeNull();
      assertSpyCalls(debugSpy, 2);
      assertSpyCallArgs(debugSpy, 0, [{ userId }, 'deleteAccount started']);
      assertSpyCallArgs(debugSpy, 1, [{ userId }, 'deleteAccount completed']);
    });
  });
});
