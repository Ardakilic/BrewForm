// deno-lint-ignore-file no-explicit-any require-await

import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { users, vendors } from '@brewform/db/schema';
import * as model from './model.ts';

/**
 * Insert a test user and return its id. Pairs with `cleanupTestUser`.
 * Centralises the boilerplate email/username/passwordHash insert shape used
 * across every describe block in this file.
 */
async function createTestUser(): Promise<string> {
  const userId = crypto.randomUUID();
  await db.insert(users).values({
    id: userId,
    email: `test-${userId}@example.com`,
    username: `testuser-${userId}`,
    passwordHash: 'hash',
  });
  return userId;
}

async function cleanupTestUser(userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

async function cleanupTestVendor(vendorId: string): Promise<void> {
  await db.delete(vendors).where(eq(vendors.id, vendorId));
}

describe('findById', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let vendorId: string;

  beforeEach(async () => {
    userId = await createTestUser();
    vendorId = crypto.randomUUID();
    await db.insert(vendors).values({
      id: vendorId,
      name: 'Test Roaster',
      createdBy: userId,
    });
  });

  afterEach(async () => {
    await cleanupTestVendor(vendorId);
    await cleanupTestUser(userId);
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
    userId = await createTestUser();
    vendorIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await db.insert(vendors).values([
      { id: vendorIds[0], name: 'Alpha Roaster', createdBy: userId },
      { id: vendorIds[1], name: 'Beta Roaster', createdBy: userId },
      { id: vendorIds[2], name: 'Gamma Roaster', createdBy: userId, deletedAt: new Date() },
    ]);
  });

  afterEach(async () => {
    for (const id of vendorIds) {
      await cleanupTestVendor(id);
    }
    await cleanupTestUser(userId);
  });

  it('should return paginated vendors with total count, excluding soft-deleted', async () => {
    // CI DB has seed data; assert our 2 active rows are present and soft-deleted is excluded.
    const result = await model.findMany(1, 100);
    const ids = result.vendors.map((v) => v.id);
    expect(ids).toContain(vendorIds[0]);
    expect(ids).toContain(vendorIds[1]);
    expect(ids).not.toContain(vendorIds[2]);
    expect(result.total).toBeGreaterThanOrEqual(2);
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
    userId = await createTestUser();
    vendorIds = [];
  });

  afterEach(async () => {
    for (const id of vendorIds) {
      await cleanupTestVendor(id);
    }
    await cleanupTestUser(userId);
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
    userId = await createTestUser();
    vendorId = crypto.randomUUID();
  });

  afterEach(async () => {
    await cleanupTestVendor(vendorId);
    await cleanupTestUser(userId);
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
    userId = await createTestUser();
    vendorId = crypto.randomUUID();
    await db.insert(vendors).values({
      id: vendorId,
      name: 'Original Roaster',
      createdBy: userId,
    });
  });

  afterEach(async () => {
    await cleanupTestVendor(vendorId);
    await cleanupTestUser(userId);
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
    userId = await createTestUser();
    vendorId = crypto.randomUUID();
    await db.insert(vendors).values({
      id: vendorId,
      name: 'Test Roaster',
      createdBy: userId,
    });
  });

  afterEach(async () => {
    await cleanupTestVendor(vendorId);
    await cleanupTestUser(userId);
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
    // Second softDelete returns null (isNull(deletedAt) guard) and cannot
    // overwrite the timestamp — no wall-clock sleep needed; the guard is
    // the deterministic guarantee.
    const second = await model.softDelete(vendorId);
    expect(second).toBeNull();
    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
    expect(row.deletedAt!.getTime()).toBe(firstDeletedAt);
  });
});
