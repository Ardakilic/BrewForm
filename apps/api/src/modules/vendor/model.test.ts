// deno-lint-ignore-file no-explicit-any require-await

import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { users, vendors } from '@brewform/db/schema';
import * as model from './model.ts';

describe('findById', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let vendorId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    vendorId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(vendors).values({
      id: vendorId,
      name: 'Test Roaster',
      createdBy: userId,
    });
  });

  afterEach(async () => {
    await db.delete(vendors).where(eq(vendors.id, vendorId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return an active vendor record', async () => {
    const result = await model.findById(vendorId);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Test Roaster');
  });

  it('should return null for a soft-deleted vendor record', async () => {
    await db.update(vendors).set({ deletedAt: new Date() }).where(eq(vendors.id, vendorId));
    const result = await model.findById(vendorId);
    expect(result).toBeNull();
  });

  it('should return null for a non-existent vendor ID', async () => {
    const result = await model.findById('nonexistent-uuid');
    expect(result).toBeNull();
  });
});

describe('findMany', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let vendorIds: string[];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    vendorIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(vendors).values([
      { id: vendorIds[0], name: 'Alpha Roaster', createdBy: userId },
      { id: vendorIds[1], name: 'Beta Roaster', createdBy: userId },
      { id: vendorIds[2], name: 'Gamma Roaster', createdBy: userId, deletedAt: new Date() },
    ]);
  });

  afterEach(async () => {
    for (const id of vendorIds) {
      await db.delete(vendors).where(eq(vendors.id, id));
    }
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return paginated vendors with total count, excluding soft-deleted', async () => {
    const result = await model.findMany(1, 10);
    expect(result.vendors.length).toBe(2);
    expect(result.total).toBe(2);
    const names = result.vendors.map((v) => v.name);
    expect(names).not.toContain('Gamma Roaster');
  });

  it('should return { vendors, total } shape (not items)', async () => {
    const result = await model.findMany(1, 10);
    expect(Object.keys(result).sort()).toEqual(['total', 'vendors'].sort());
  });
});

describe('search', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let vendorIds: string[];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    vendorIds = [];
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    for (const id of vendorIds) {
      await db.delete(vendors).where(eq(vendors.id, id));
    }
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return matching vendors by name (LIKE match)', async () => {
    const id = crypto.randomUUID();
    vendorIds.push(id);
    await db.insert(vendors).values({ id, name: 'Blue Bottle Coffee', createdBy: userId });
    const results = await model.search('Blue Bottle');
    expect(results.some((r) => r.name === 'Blue Bottle Coffee')).toBe(true);
  });

  it('should exclude soft-deleted vendors', async () => {
    const id = crypto.randomUUID();
    vendorIds.push(id);
    await db.insert(vendors).values({
      id,
      name: 'Deleted Roaster',
      createdBy: userId,
      deletedAt: new Date(),
    });
    const results = await model.search('Deleted Roaster');
    expect(results.some((r) => r.name === 'Deleted Roaster')).toBe(false);
  });

  it('should limit to 10 results', async () => {
    for (let i = 0; i < 12; i++) {
      const id = crypto.randomUUID();
      vendorIds.push(id);
      await db.insert(vendors).values({ id, name: `BatchRoaster ${i}`, createdBy: userId });
    }
    const results = await model.search('BatchRoaster');
    expect(results.length).toBeLessThanOrEqual(10);
  });
});

describe('create', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let vendorId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    vendorId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    await db.delete(vendors).where(eq(vendors.id, vendorId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should insert a vendor with createdBy and return it', async () => {
    const result = await model.create({
      id: vendorId,
      name: 'New Roaster',
      createdBy: userId,
    });
    expect(result).not.toBeNull();
    expect(result.id).toBe(vendorId);
    expect(result.createdBy).toBe(userId);
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
    expect(row.name).toBe('New Roaster');
  });
});

describe('update', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let vendorId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    vendorId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(vendors).values({
      id: vendorId,
      name: 'Original Roaster',
      createdBy: userId,
    });
  });

  afterEach(async () => {
    await db.delete(vendors).where(eq(vendors.id, vendorId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should update an active vendor', async () => {
    const result = await model.update(vendorId, { name: 'Updated Roaster' });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Updated Roaster');
  });

  /**
   * Regression baseline: model.update currently lacks the isNull(deletedAt) guard.
   * This test documents the unguarded behaviour. If a future change adds the guard,
   * this test will fail and force a conscious update.
   */
  it('should mutate a soft-deleted vendor (regression baseline)', async () => {
    await db.update(vendors).set({ deletedAt: new Date() }).where(eq(vendors.id, vendorId));
    const result = await model.update(vendorId, { name: 'Mutated' });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Mutated');
    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
    expect(row.name).toBe('Mutated');
  });
});

describe('softDelete', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let vendorId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    vendorId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(vendors).values({
      id: vendorId,
      name: 'Test Roaster',
      createdBy: userId,
    });
  });

  afterEach(async () => {
    await db.delete(vendors).where(eq(vendors.id, vendorId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should soft-delete an active vendor', async () => {
    const result = await model.softDelete(vendorId);
    expect(result).not.toBeNull();
    expect(result!.deletedAt).not.toBeNull();
  });

  it('should return null when deleting an already-deleted vendor', async () => {
    await model.softDelete(vendorId);
    const second = await model.softDelete(vendorId);
    expect(second).toBeNull();
  });

  it('should not overwrite deletedAt on double-delete', async () => {
    const first = await model.softDelete(vendorId);
    expect(first!.deletedAt).not.toBeNull();
    const firstDeletedAt = first!.deletedAt!.getTime();
    await new Promise((r) => setTimeout(r, 10));
    await model.softDelete(vendorId);
    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
    expect(row.deletedAt!.getTime()).toBe(firstDeletedAt);
  });
});
