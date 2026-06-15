import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { assertSpyCallArgs, assertSpyCalls, spy } from 'jsr:@std/testing/mock';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { beans, users } from '@brewform/db/schema';
import { createBean, deleteBean, getBean, listBeans, log, updateBean } from './service.ts';

describe('Bean Service Logic', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let otherUserId: string;
  let debugSpy: ReturnType<typeof spy>;
  let errorSpy: ReturnType<typeof spy>;
  let warnSpy: ReturnType<typeof spy>;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    otherUserId = crypto.randomUUID();

    debugSpy = spy(log, 'debug');
    errorSpy = spy(log, 'error');
    warnSpy = spy(log, 'warn');

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
    debugSpy.restore();
    errorSpy.restore();
    warnSpy.restore();

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
      assertSpyCalls(debugSpy, 2);
      assertSpyCallArgs(debugSpy, 0, [{ userId, page: 1, perPage: 10 }, 'listBeans started']);
      assertSpyCallArgs(debugSpy, 1, [
        { userId, page: 1, perPage: 10, total: 1 },
        'listBeans completed',
      ]);
    });
  });

  describe('getBean', () => {
    it('should log entry/exit when bean is found', async () => {
      const [bean] = await db.insert(beans).values({ name: 'Bean One', userId }).returning();

      const result = await getBean(bean.id);

      expect(result.id).toBe(bean.id);
      assertSpyCalls(debugSpy, 2);
      assertSpyCallArgs(debugSpy, 0, [{ id: bean.id }, 'getBean started']);
      assertSpyCallArgs(debugSpy, 1, [{ id: bean.id }, 'getBean completed']);
    });

    it('should log error and throw BEAN_NOT_FOUND when bean does not exist', async () => {
      const missingId = crypto.randomUUID();

      await expect(getBean(missingId)).rejects.toThrow('BEAN_NOT_FOUND');

      assertSpyCalls(errorSpy, 1);
      assertSpyCallArgs(errorSpy, 0, [{ id: missingId }, 'getBean failed: bean not found']);
      assertSpyCalls(debugSpy, 1);
      assertSpyCallArgs(debugSpy, 0, [{ id: missingId }, 'getBean started']);
    });
  });

  describe('createBean', () => {
    it('should log entry/exit and persist bean for user', async () => {
      const result = await createBean(userId, { name: 'New Bean' });

      expect(result.name).toBe('New Bean');
      expect(result.userId).toBe(userId);
      assertSpyCalls(debugSpy, 2);
      assertSpyCallArgs(debugSpy, 0, [{ userId }, 'createBean started']);
      assertSpyCallArgs(debugSpy, 1, [
        { userId, beanId: result.id },
        'createBean completed',
      ]);
    });
  });

  describe('updateBean', () => {
    it('should log entry/exit when owner updates a bean', async () => {
      const [bean] = await db.insert(beans).values({ name: 'Bean One', userId }).returning();

      const result = await updateBean(userId, bean.id, { name: 'Updated Bean' });

      expect(result.name).toBe('Updated Bean');
      assertSpyCalls(debugSpy, 2);
      assertSpyCallArgs(debugSpy, 0, [{ userId, id: bean.id }, 'updateBean started']);
      assertSpyCallArgs(debugSpy, 1, [{ userId, id: bean.id }, 'updateBean completed']);
    });

    it('should log error and throw BEAN_NOT_FOUND when bean does not exist', async () => {
      const missingId = crypto.randomUUID();

      await expect(updateBean(userId, missingId, { name: 'X' })).rejects.toThrow('BEAN_NOT_FOUND');

      assertSpyCalls(errorSpy, 1);
      assertSpyCallArgs(errorSpy, 0, [
        { id: missingId, userId },
        'updateBean failed: bean not found',
      ]);
      assertSpyCalls(debugSpy, 1);
    });

    it('should log warn and throw FORBIDDEN when user does not own the bean', async () => {
      const [bean] = await db.insert(beans).values({ name: 'Bean One', userId }).returning();

      await expect(updateBean(otherUserId, bean.id, { name: 'Hacked' })).rejects.toThrow(
        'FORBIDDEN',
      );

      assertSpyCalls(warnSpy, 1);
      assertSpyCallArgs(warnSpy, 0, [
        { id: bean.id, userId: otherUserId, ownerId: userId },
        'updateBean failed: forbidden',
      ]);
    });
  });

  describe('deleteBean', () => {
    it('should log entry/exit when owner deletes a bean', async () => {
      const [bean] = await db.insert(beans).values({ name: 'Bean One', userId }).returning();

      await deleteBean(userId, bean.id);

      const [row] = await db.select({ deletedAt: beans.deletedAt }).from(beans).where(
        eq(beans.id, bean.id),
      );
      expect(row.deletedAt).not.toBeNull();
      assertSpyCalls(debugSpy, 2);
      assertSpyCallArgs(debugSpy, 0, [{ userId, id: bean.id }, 'deleteBean started']);
      assertSpyCallArgs(debugSpy, 1, [{ userId, id: bean.id }, 'deleteBean completed']);
    });

    it('should log error and throw BEAN_NOT_FOUND when bean does not exist', async () => {
      const missingId = crypto.randomUUID();

      await expect(deleteBean(userId, missingId)).rejects.toThrow('BEAN_NOT_FOUND');

      assertSpyCalls(errorSpy, 1);
      assertSpyCallArgs(errorSpy, 0, [
        { id: missingId, userId },
        'deleteBean failed: bean not found',
      ]);
      assertSpyCalls(debugSpy, 1);
    });

    it('should log warn and throw FORBIDDEN when user does not own the bean', async () => {
      const [bean] = await db.insert(beans).values({ name: 'Bean One', userId }).returning();

      await expect(deleteBean(otherUserId, bean.id)).rejects.toThrow('FORBIDDEN');

      assertSpyCalls(warnSpy, 1);
      assertSpyCallArgs(warnSpy, 0, [
        { id: bean.id, userId: otherUserId, ownerId: userId },
        'deleteBean failed: forbidden',
      ]);
    });
  });
});
