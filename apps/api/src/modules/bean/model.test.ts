// deno-lint-ignore-file no-explicit-any require-await

import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { beans, users } from '@brewform/db/schema';
import * as model from './model.ts';

/**
 * findById — Find a bean by ID. Returns null if the bean has been soft-deleted
 * (deletedAt set) or if no bean with the given ID exists.
 */
describe('findById', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let beanId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    beanId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(beans).values({
      id: beanId,
      name: 'Test Bean',
      userId,
    });
  });

  afterEach(async () => {
    await db.delete(beans).where(eq(beans.id, beanId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return an active bean record', async () => {
    const result = await model.findById(beanId);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Test Bean');
    expect(result!.userId).toBe(userId);
  });

  it('should return null for a soft-deleted bean', async () => {
    await db.update(beans).set({ deletedAt: new Date() }).where(eq(beans.id, beanId));
    const result = await model.findById(beanId);
    expect(result).toBeNull();
  });

  it('should return null for a non-existent bean ID', async () => {
    const result = await model.findById('nonexistent-uuid');
    expect(result).toBeNull();
  });
});

/**
 * findByUser — List paginated beans owned by a user, excluding soft-deleted
 * beans. Returns `{ beans, total }` with total reflecting the count of
 * non-deleted beans matching the userId filter.
 */
describe('findByUser', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let beanIds: string[];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    beanIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(beans).values([
      { id: beanIds[0], name: 'Alpha Bean', userId },
      { id: beanIds[1], name: 'Beta Bean', userId },
      { id: beanIds[2], name: 'Gamma Bean', userId, deletedAt: new Date() },
    ]);
  });

  afterEach(async () => {
    for (const id of beanIds) {
      await db.delete(beans).where(eq(beans.id, id));
    }
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return paginated beans for a user with total count', async () => {
    const result = await model.findByUser(userId, 1, 10);
    expect(result.beans.length).toBe(2);
    expect(result.total).toBe(2);
    const names = result.beans.map((b) => b.name).sort();
    expect(names).toEqual(['Alpha Bean', 'Beta Bean']);
  });

  it('should exclude soft-deleted beans', async () => {
    const result = await model.findByUser(userId, 1, 10);
    expect(result.beans.some((b) => b.id === beanIds[2])).toBe(false);
  });

  it('should return { beans, total } shape', async () => {
    const result = await model.findByUser(userId, 1, 10);
    expect(Object.keys(result).sort()).toEqual(['beans', 'total'].sort());
  });

  it('should paginate correctly', async () => {
    const page1 = await model.findByUser(userId, 1, 1);
    const page2 = await model.findByUser(userId, 2, 1);
    expect(page1.beans.length).toBe(1);
    expect(page2.beans.length).toBe(1);
    expect(page1.total).toBe(2);
    expect(page2.total).toBe(2);
    expect(page1.beans[0].id).not.toBe(page2.beans[0].id);
  });
});

/**
 * create — Insert a new bean row and return the inserted record.
 */
describe('create', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let beanId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    beanId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    await db.delete(beans).where(eq(beans.id, beanId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should insert a bean row and return it', async () => {
    const result = await model.create({
      id: beanId,
      name: 'New Bean',
      userId,
    });
    expect(result).not.toBeNull();
    expect(result.id).toBe(beanId);
    expect(result.name).toBe('New Bean');
    expect(result.userId).toBe(userId);
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
    const [row] = await db.select().from(beans).where(eq(beans.id, beanId));
    expect(row.name).toBe('New Bean');
  });
});

/**
 * update — Update a bean by ID. Only updates non-deleted beans (isNull(deletedAt)
 * guard). Returns null if the bean does not exist or has been soft-deleted.
 */
describe('update', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let beanId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    beanId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(beans).values({
      id: beanId,
      name: 'Original Bean',
      userId,
    });
  });

  afterEach(async () => {
    await db.delete(beans).where(eq(beans.id, beanId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should update an active bean record', async () => {
    const result = await model.update(beanId, { name: 'Updated Bean' });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Updated Bean');
    const [row] = await db.select().from(beans).where(eq(beans.id, beanId));
    expect(row.name).toBe('Updated Bean');
  });

  it('should return null when updating a soft-deleted bean', async () => {
    await db.update(beans).set({ deletedAt: new Date() }).where(eq(beans.id, beanId));
    const result = await model.update(beanId, { name: 'Mutated' });
    expect(result).toBeNull();
    // The name must not have changed — the isNull(deletedAt) guard blocks the update.
    const [row] = await db.select().from(beans).where(eq(beans.id, beanId));
    expect(row.name).toBe('Original Bean');
  });

  it('should return null for a non-existent bean ID', async () => {
    const result = await model.update('nonexistent-uuid', { name: 'Nope' });
    expect(result).toBeNull();
  });
});

/**
 * softDelete — Soft-delete a bean by setting its deletedAt timestamp. Only
 * affects non-deleted beans (isNull(deletedAt) guard). Returns null if the
 * bean is already deleted or does not exist.
 */
describe('softDelete', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let beanId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    beanId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(beans).values({
      id: beanId,
      name: 'Test Bean',
      userId,
    });
  });

  afterEach(async () => {
    await db.delete(beans).where(eq(beans.id, beanId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should soft-delete an active bean record', async () => {
    const result = await model.softDelete(beanId);
    expect(result).not.toBeNull();
    expect(result!.deletedAt).not.toBeNull();
  });

  it('should return null when deleting an already-deleted bean', async () => {
    await model.softDelete(beanId);
    const second = await model.softDelete(beanId);
    expect(second).toBeNull();
  });

  it('should not overwrite deletedAt on double-delete', async () => {
    const first = await model.softDelete(beanId);
    expect(first!.deletedAt).not.toBeNull();
    const firstDeletedAt = first!.deletedAt!.getTime();
    const second = await model.softDelete(beanId);
    expect(second).toBeNull();
    const [row] = await db.select().from(beans).where(eq(beans.id, beanId));
    expect(row.deletedAt!.getTime()).toBe(firstDeletedAt);
  });
});
