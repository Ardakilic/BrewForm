import '../../test-setup.ts';
import { db } from '@brewform/db';
import { users } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as recipeNoteService from '../recipe-note/service.ts';
import { NoteFixtures } from '../recipe-note/test-helpers.ts';
import { deleteAccount, getProfile, getPublicProfile, log, updateProfile } from './service.ts';

describe('User Service', () => {
  let userId: string;
  let username: string;
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    username = `testuser-${userId}`;

    debugSpy = vi.spyOn(log, 'debug');
    errorSpy = vi.spyOn(log, 'error');
    warnSpy = vi.spyOn(log, 'warn');
    infoSpy = vi.spyOn(log, 'info');

    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    debugSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();

    await db.delete(users).where(eq(users.id, userId));
  });

  describe('getProfile', () => {
    it('should log entry/exit when user is found', async () => {
      const result = await getProfile(userId);

      expect(result.id).toBe(userId);
      expect(result.username).toBe(username);
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { userId }, 'getProfile started');
      expect(debugSpy).toHaveBeenNthCalledWith(2, { userId }, 'getProfile completed');
    });

    it('should log error and throw USER_NOT_FOUND when user does not exist', async () => {
      const missingId = crypto.randomUUID();

      await expect(getProfile(missingId)).rejects.toThrow('USER_NOT_FOUND');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const errArg = errorSpy.mock.calls[0][0] as { err: Error; userId: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('USER_NOT_FOUND');
      expect(errArg.userId).toBe(missingId);
      expect(errorSpy.mock.calls[0][1]).toBe('getProfile failed: user not found');
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { userId: missingId }, 'getProfile started');
    });
  });

  describe('getPublicProfile', () => {
    it('should log entry/exit when username is found', async () => {
      const result = await getPublicProfile(username);

      expect(result.username).toBe(username);
      expect(result.isFollowing).toBe(false);
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(
        1,
        { username, requesterId: undefined },
        'getPublicProfile started',
      );
      expect(debugSpy).toHaveBeenNthCalledWith(
        2,
        { username, requesterId: undefined },
        'getPublicProfile completed',
      );
    });

    it('should include requesterId in logs when provided', async () => {
      const result = await getPublicProfile(username, userId);

      expect(result.isFollowing).toBe(false);
      expect(debugSpy).toHaveBeenNthCalledWith(
        1,
        { username, requesterId: userId },
        'getPublicProfile started',
      );
      expect(debugSpy).toHaveBeenNthCalledWith(
        2,
        { username, requesterId: userId },
        'getPublicProfile completed',
      );
    });

    it('should log error and throw USER_NOT_FOUND when username does not exist', async () => {
      const missingUsername = `missing-${crypto.randomUUID()}`;

      await expect(getPublicProfile(missingUsername)).rejects.toThrow('USER_NOT_FOUND');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const errArg = errorSpy.mock.calls[0][0] as { err: Error; username: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('USER_NOT_FOUND');
      expect(errArg.username).toBe(missingUsername);
      expect(errorSpy.mock.calls[0][1]).toBe('getPublicProfile failed: user not found');
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(debugSpy).toHaveBeenNthCalledWith(
        1,
        { username: missingUsername, requesterId: undefined },
        'getPublicProfile started',
      );
    });
  });

  describe('updateProfile', () => {
    it('should log entry/exit when user is updated', async () => {
      const result = await updateProfile(userId, { displayName: 'Updated Name' });

      expect(result.displayName).toBe('Updated Name');
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { userId }, 'updateProfile started');
      expect(debugSpy).toHaveBeenNthCalledWith(2, { userId }, 'updateProfile completed');
    });

    it('should log error and throw USER_NOT_FOUND when user does not exist', async () => {
      const missingId = crypto.randomUUID();

      await expect(updateProfile(missingId, { displayName: 'X' })).rejects.toThrow(
        'USER_NOT_FOUND',
      );

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const errArg = errorSpy.mock.calls[0][0] as { err: Error; userId: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('USER_NOT_FOUND');
      expect(errArg.userId).toBe(missingId);
      expect(errorSpy.mock.calls[0][1]).toBe('updateProfile failed: user not found');
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { userId: missingId }, 'updateProfile started');
    });
  });

  describe('deleteAccount', () => {
    it('should log entry/exit when account is soft-deleted', async () => {
      await deleteAccount(userId);

      const [row] = await db
        .select({ deletedAt: users.deletedAt })
        .from(users)
        .where(eq(users.id, userId));
      expect(row.deletedAt).not.toBeNull();
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { userId }, 'deleteAccount started');
      expect(debugSpy).toHaveBeenNthCalledWith(2, { userId }, 'deleteAccount completed');
    });
  });
});

describe('User Service — deleteAccount scrubs private recipe notes', () => {
  const fixtures = new NoteFixtures();

  afterEach(async () => {
    await fixtures.cleanup();
  });

  it("soft-deletes and scrubs every private note of the user and leaves other users' notes", async () => {
    const author = await fixtures.user('delete-account-author');
    const leaving = await fixtures.user('delete-account-user');
    const staying = await fixtures.user('delete-account-other');
    const recipes = await Promise.all([1, 2, 3].map(() => fixtures.recipe(author.id)));
    for (const { recipe } of recipes) {
      await recipeNoteService.saveMyNote(leaving.id, recipe.id, `private on ${recipe.id}`, false);
    }
    await recipeNoteService.saveMyNote(staying.id, recipes[0].recipe.id, 'still here', false);

    await deleteAccount(leaving.id);

    for (const { recipe } of recipes) {
      const [row] = await fixtures.noteRows(leaving.id, recipe.id);
      expect(row.deletedAt).toBeInstanceOf(Date);
      expect(row.notes).toBe('');
    }
    const [kept] = await fixtures.noteRows(staying.id, recipes[0].recipe.id);
    expect(kept.notes).toBe('still here');
    expect(kept.deletedAt).toBeNull();
  });

  it('calls the recipe-note service before soft-deleting the user row', async () => {
    const user = await fixtures.user('delete-account-order');
    const notesSpy = vi
      .spyOn(recipeNoteService, 'deleteAllNotesForUser')
      .mockRejectedValueOnce(new Error('notes cleanup failed'));

    await expect(deleteAccount(user.id)).rejects.toThrow('notes cleanup failed');

    expect(notesSpy).toHaveBeenCalledWith(user.id);
    const [row] = await db
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, user.id));
    expect(row.deletedAt).toBeNull();
    notesSpy.mockRestore();
  });
});
