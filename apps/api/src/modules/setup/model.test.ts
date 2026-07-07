// deno-lint-ignore-file no-explicit-any require-await

import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { setups, users } from '@brewform/db/schema';
import * as model from './model.ts';

/**
 * findById — Find a setup by ID. Returns null if the setup has been soft-deleted
 * (deletedAt set) or if no setup with the given ID exists.
 */
describe('findById', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let setupId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    setupId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(setups).values({
      id: setupId,
      name: 'Test Setup',
      userId,
    });
  });

  afterEach(async () => {
    await db.delete(setups).where(eq(setups.id, setupId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return an active setup record', async () => {
    const result = await model.findById(setupId);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Test Setup');
    expect(result!.userId).toBe(userId);
  });

  it('should return null for a soft-deleted setup', async () => {
    await db.update(setups).set({ deletedAt: new Date() }).where(eq(setups.id, setupId));
    const result = await model.findById(setupId);
    expect(result).toBeNull();
  });

  it('should return null for a non-existent setup ID', async () => {
    const result = await model.findById('nonexistent-uuid');
    expect(result).toBeNull();
  });
});

/**
 * findByUser — List paginated setups owned by a user, excluding soft-deleted
 * setups. Returns `{ setups, total }` with total reflecting the count of
 * non-deleted setups matching the userId filter.
 */
describe('findByUser', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let setupIds: string[];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    setupIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(setups).values([
      { id: setupIds[0], name: 'Alpha Setup', userId },
      { id: setupIds[1], name: 'Beta Setup', userId },
      { id: setupIds[2], name: 'Gamma Setup', userId, deletedAt: new Date() },
    ]);
  });

  afterEach(async () => {
    for (const id of setupIds) {
      await db.delete(setups).where(eq(setups.id, id));
    }
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return paginated setups for a user with total count', async () => {
    const result = await model.findByUser(userId, 1, 10);
    expect(result.setups.length).toBe(2);
    expect(result.total).toBe(2);
    const names = result.setups.map((s) => s.name).sort();
    expect(names).toEqual(['Alpha Setup', 'Beta Setup']);
  });

  it('should exclude soft-deleted setups', async () => {
    const result = await model.findByUser(userId, 1, 10);
    expect(result.setups.some((s) => s.id === setupIds[2])).toBe(false);
  });

  it('should return { setups, total } shape', async () => {
    const result = await model.findByUser(userId, 1, 10);
    expect(Object.keys(result).sort()).toEqual(['setups', 'total'].sort());
  });

  it('should paginate correctly', async () => {
    const page1 = await model.findByUser(userId, 1, 1);
    const page2 = await model.findByUser(userId, 2, 1);
    expect(page1.setups.length).toBe(1);
    expect(page2.setups.length).toBe(1);
    expect(page1.total).toBe(2);
    expect(page2.total).toBe(2);
    expect(page1.setups[0].id).not.toBe(page2.setups[0].id);
  });
});

/**
 * create — Insert a new setup row and return the inserted record.
 */
describe('create', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let setupId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    setupId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    await db.delete(setups).where(eq(setups.id, setupId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should insert a setup row and return it', async () => {
    const result = await model.create({
      id: setupId,
      name: 'New Setup',
      userId,
      grinder: 'Comandante C40',
    });
    expect(result).not.toBeNull();
    expect(result.id).toBe(setupId);
    expect(result.name).toBe('New Setup');
    expect(result.userId).toBe(userId);
    expect(result.grinder).toBe('Comandante C40');
    expect(result.createdAt).toBeDefined();
    const [row] = await db.select().from(setups).where(eq(setups.id, setupId));
    expect(row.name).toBe('New Setup');
  });
});

/**
 * update — Update a setup by ID. Returns null if not found.
 *
 * NOTE: Unlike findById/findByUser/softDelete, update does NOT include the
 * isNull(deletedAt) guard — it will happily mutate a soft-deleted setup. This
 * is documented as a regression baseline below.
 */
describe('update', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let setupId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    setupId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(setups).values({
      id: setupId,
      name: 'Original Setup',
      userId,
    });
  });

  afterEach(async () => {
    await db.delete(setups).where(eq(setups.id, setupId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should update an active setup record', async () => {
    const result = await model.update(setupId, { name: 'Updated Setup' });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Updated Setup');
    const [row] = await db.select().from(setups).where(eq(setups.id, setupId));
    expect(row.name).toBe('Updated Setup');
  });

  /**
   * Regression baseline: model.update currently lacks the isNull(deletedAt) guard.
   * This test documents the unguarded behaviour. If a future change adds the guard,
   * this test will fail and force a conscious update.
   */
  it('should mutate a soft-deleted setup record (regression baseline)', async () => {
    await db.update(setups).set({ deletedAt: new Date() }).where(eq(setups.id, setupId));
    const result = await model.update(setupId, { name: 'Mutated' });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Mutated');
    const [row] = await db.select().from(setups).where(eq(setups.id, setupId));
    expect(row.name).toBe('Mutated');
  });

  it('should return null for a non-existent setup ID', async () => {
    const result = await model.update('nonexistent-uuid', { name: 'Nope' });
    expect(result).toBeNull();
  });
});

/**
 * softDelete — Soft-delete a setup by setting its deletedAt timestamp. Only
 * affects non-deleted setups (isNull(deletedAt) guard). Returns null if the
 * setup is already deleted or does not exist.
 */
describe('softDelete', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let setupId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    setupId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(setups).values({
      id: setupId,
      name: 'Test Setup',
      userId,
    });
  });

  afterEach(async () => {
    await db.delete(setups).where(eq(setups.id, setupId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should soft-delete an active setup record', async () => {
    const result = await model.softDelete(setupId);
    expect(result).not.toBeNull();
    expect(result!.deletedAt).not.toBeNull();
  });

  it('should return null when deleting an already-deleted setup', async () => {
    await model.softDelete(setupId);
    const second = await model.softDelete(setupId);
    expect(second).toBeNull();
  });

  it('should not overwrite deletedAt on double-delete', async () => {
    const first = await model.softDelete(setupId);
    expect(first!.deletedAt).not.toBeNull();
    const firstDeletedAt = first!.deletedAt!.getTime();
    const second = await model.softDelete(setupId);
    expect(second).toBeNull();
    const [row] = await db.select().from(setups).where(eq(setups.id, setupId));
    expect(row.deletedAt!.getTime()).toBe(firstDeletedAt);
  });
});
