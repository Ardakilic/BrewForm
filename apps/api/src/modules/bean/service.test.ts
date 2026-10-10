import '../../test-setup.ts';
import { db } from '@brewform/db';
import { beans, users } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBean, deleteBean, getBean, listBeans, log, updateBean } from './service.ts';

describe('Bean Service Logic', () => {
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

    await db.delete(beans).where(eq(beans.userId, userId));
    await db.delete(beans).where(eq(beans.userId, otherUserId));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(users).where(eq(users.id, otherUserId));
  });

  describe('listBeans', () => {
    it('should log entry/exit and return paginated beans', async () => {
      await db.insert(beans).values({
        name: 'Bean One',
        userId,
      });

      const result = await listBeans(userId, 1, 10);

      expect(result.beans).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(
        1,
        { userId, page: 1, perPage: 10 },
        'listBeans started',
      );
      expect(debugSpy).toHaveBeenNthCalledWith(
        2,
        { userId, page: 1, perPage: 10, total: 1 },
        'listBeans completed',
      );
    });
  });

  describe('getBean', () => {
    it('should log entry/exit when bean is found', async () => {
      const [bean] = await db.insert(beans).values({ name: 'Bean One', userId }).returning();

      const result = await getBean(bean.id);

      expect(result.id).toBe(bean.id);
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { id: bean.id }, 'getBean started');
      expect(debugSpy).toHaveBeenNthCalledWith(2, { id: bean.id }, 'getBean completed');
    });

    it('should log error and throw BEAN_NOT_FOUND when bean does not exist', async () => {
      const missingId = crypto.randomUUID();

      await expect(getBean(missingId)).rejects.toThrow('BEAN_NOT_FOUND');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const errArg = errorSpy.mock.calls[0][0] as { err: Error; id: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('BEAN_NOT_FOUND');
      expect(errArg.id).toBe(missingId);
      expect(errorSpy.mock.calls[0][1]).toBe('getBean failed: bean not found');
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { id: missingId }, 'getBean started');
    });
  });

  describe('createBean', () => {
    it('should log entry/exit and persist bean for user', async () => {
      const result = await createBean(userId, { name: 'New Bean' });

      expect(result.name).toBe('New Bean');
      expect(result.userId).toBe(userId);
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { userId }, 'createBean started');
      expect(debugSpy).toHaveBeenNthCalledWith(
        2,
        { userId, beanId: result.id },
        'createBean completed',
      );
    });
  });

  describe('updateBean', () => {
    it('should log entry/exit when owner updates a bean', async () => {
      const [bean] = await db.insert(beans).values({ name: 'Bean One', userId }).returning();

      const result = await updateBean(userId, bean.id, { name: 'Updated Bean' });

      expect(result.name).toBe('Updated Bean');
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { userId, id: bean.id }, 'updateBean started');
      expect(debugSpy).toHaveBeenNthCalledWith(2, { userId, id: bean.id }, 'updateBean completed');
    });

    it('should log error and throw BEAN_NOT_FOUND when bean does not exist', async () => {
      const missingId = crypto.randomUUID();

      await expect(updateBean(userId, missingId, { name: 'X' })).rejects.toThrow('BEAN_NOT_FOUND');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const errArg = errorSpy.mock.calls[0][0] as { err: Error; id: string; userId: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('BEAN_NOT_FOUND');
      expect(errArg.id).toBe(missingId);
      expect(errArg.userId).toBe(userId);
      expect(errorSpy.mock.calls[0][1]).toBe('updateBean failed: bean not found');
      expect(debugSpy).toHaveBeenCalledTimes(1);
    });

    it('should log warn and throw FORBIDDEN when user does not own the bean', async () => {
      const [bean] = await db.insert(beans).values({ name: 'Bean One', userId }).returning();

      await expect(updateBean(otherUserId, bean.id, { name: 'Hacked' })).rejects.toThrow(
        'FORBIDDEN',
      );

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenNthCalledWith(
        1,
        { id: bean.id, userId: otherUserId, ownerId: userId },
        'updateBean failed: forbidden',
      );
    });
  });

  describe('deleteBean', () => {
    it('should log entry/exit when owner deletes a bean', async () => {
      const [bean] = await db.insert(beans).values({ name: 'Bean One', userId }).returning();

      await deleteBean(userId, bean.id);

      const [row] = await db
        .select({ deletedAt: beans.deletedAt })
        .from(beans)
        .where(eq(beans.id, bean.id));
      expect(row.deletedAt).not.toBeNull();
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(1, { userId, id: bean.id }, 'deleteBean started');
      expect(debugSpy).toHaveBeenNthCalledWith(2, { userId, id: bean.id }, 'deleteBean completed');
    });

    it('should log error and throw BEAN_NOT_FOUND when bean does not exist', async () => {
      const missingId = crypto.randomUUID();

      await expect(deleteBean(userId, missingId)).rejects.toThrow('BEAN_NOT_FOUND');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const errArg = errorSpy.mock.calls[0][0] as { err: Error; id: string; userId: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('BEAN_NOT_FOUND');
      expect(errArg.id).toBe(missingId);
      expect(errArg.userId).toBe(userId);
      expect(errorSpy.mock.calls[0][1]).toBe('deleteBean failed: bean not found');
      expect(debugSpy).toHaveBeenCalledTimes(1);
    });

    it('should log warn and throw FORBIDDEN when user does not own the bean', async () => {
      const [bean] = await db.insert(beans).values({ name: 'Bean One', userId }).returning();

      await expect(deleteBean(otherUserId, bean.id)).rejects.toThrow('FORBIDDEN');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenNthCalledWith(
        1,
        { id: bean.id, userId: otherUserId, ownerId: userId },
        'deleteBean failed: forbidden',
      );
    });
  });
});
