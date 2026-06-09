// deno-lint-ignore-file no-explicit-any require-await

import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import {
  coffeeVarieties,
  equipment,
  equipmentDeleteRequests,
  users,
  vendors,
} from '@brewform/db/schema';
import * as model from './model.ts';

describe('deleteEquipment', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let equipmentId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    equipmentId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(equipment).values({
      id: equipmentId,
      name: 'Test Grinder',
      type: 'grinder',
      isSystem: false,
      createdBy: userId,
    });
  });

  afterEach(async () => {
    // Hard-delete test rows — order: child first, then parent
    await db.delete(equipment).where(eq(equipment.id, equipmentId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should soft-delete an active equipment record', async () => {
    const result = await model.deleteEquipment(equipmentId);
    expect(result).toBeDefined();
    expect(result!.deletedAt).not.toBeNull();
  });

  it('should return null when deleting an already-deleted equipment', async () => {
    await model.deleteEquipment(equipmentId);
    const second = await model.deleteEquipment(equipmentId);
    expect(second).toBeNull();
  });

  it('should not overwrite deletedAt on double-delete', async () => {
    const first = await model.deleteEquipment(equipmentId);
    expect(first!.deletedAt).not.toBeNull();
    const firstDeletedAt = first!.deletedAt!.getTime();
    // Small delay so clock would advance if row were touched
    await new Promise((r) => setTimeout(r, 10));
    await model.deleteEquipment(equipmentId);
    // Re-read from DB to verify no overwrite
    const [row] = await db.select().from(equipment).where(eq(equipment.id, equipmentId));
    expect(row.deletedAt!.getTime()).toBe(firstDeletedAt);
  });
});

describe('deleteVendor', { sanitizeOps: false, sanitizeResources: false }, () => {
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
      name: 'Test Vendor',
      createdBy: userId,
    });
  });

  afterEach(async () => {
    await db.delete(vendors).where(eq(vendors.id, vendorId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should soft-delete an active vendor', async () => {
    const result = await model.deleteVendor(vendorId);
    expect(result).toBeDefined();
    expect(result!.deletedAt).not.toBeNull();
  });

  it('should return null when deleting an already-deleted vendor', async () => {
    await model.deleteVendor(vendorId);
    const second = await model.deleteVendor(vendorId);
    expect(second).toBeNull();
  });

  it('should not overwrite deletedAt on double-delete', async () => {
    const first = await model.deleteVendor(vendorId);
    expect(first!.deletedAt).not.toBeNull();
    const firstDeletedAt = first!.deletedAt!.getTime();
    await new Promise((r) => setTimeout(r, 10));
    await model.deleteVendor(vendorId);
    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
    expect(row.deletedAt!.getTime()).toBe(firstDeletedAt);
  });
});

describe('deleteCoffeeVariety', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let varietyId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    varietyId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(coffeeVarieties).values({
      id: varietyId,
      name: 'Test Variety',
      category: 'variety',
      isSystem: false,
      createdBy: userId,
    });
  });

  afterEach(async () => {
    await db.delete(coffeeVarieties).where(eq(coffeeVarieties.id, varietyId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should soft-delete an active variety', async () => {
    const result = await model.deleteCoffeeVariety(varietyId);
    expect(result).toBeDefined();
    expect(result!.deletedAt).not.toBeNull();
    expect(result!.updatedAt).not.toBeNull();
  });

  it('should return null when deleting an already-deleted variety', async () => {
    await model.deleteCoffeeVariety(varietyId);
    const second = await model.deleteCoffeeVariety(varietyId);
    expect(second).toBeNull();
  });

  it('should not overwrite updatedAt on double-delete', async () => {
    const first = await model.deleteCoffeeVariety(varietyId);
    expect(first!.deletedAt).not.toBeNull();
    const firstUpdatedAt = first!.updatedAt.getTime();
    await new Promise((r) => setTimeout(r, 10));
    await model.deleteCoffeeVariety(varietyId);
    // Re-read from DB
    const [row] = await db.select().from(coffeeVarieties).where(
      eq(coffeeVarieties.id, varietyId),
    );
    expect(row.updatedAt.getTime()).toBe(firstUpdatedAt);
  });

  it('should return null when updating a deleted variety (regression)', async () => {
    // First soft-delete the variety
    await model.deleteCoffeeVariety(varietyId);
    // Then try to update it — updateCoffeeVariety already has isNull guard
    const result = await model.updateCoffeeVariety(varietyId, { name: 'Renamed' });
    expect(result).toBeNull();
  });
});

describe('approveEquipmentDeleteRequest guard', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminUserId: string;
  let requesterUserId: string;
  let equipmentId: string;
  let requestId: string;

  beforeEach(async () => {
    adminUserId = crypto.randomUUID();
    requesterUserId = crypto.randomUUID();
    equipmentId = crypto.randomUUID();
    requestId = crypto.randomUUID();

    // Create admin user
    await db.insert(users).values({
      id: adminUserId,
      email: `admin-${adminUserId}@example.com`,
      username: `admin-${adminUserId}`,
      passwordHash: 'hash',
    });
    // Create requester user
    await db.insert(users).values({
      id: requesterUserId,
      email: `requester-${requesterUserId}@example.com`,
      username: `requester-${requesterUserId}`,
      passwordHash: 'hash',
    });

    await db.insert(equipment).values({
      id: equipmentId,
      name: 'Test Equipment',
      type: 'grinder',
      isSystem: false,
      createdBy: requesterUserId,
    });

    await db.insert(equipmentDeleteRequests).values({
      id: requestId,
      equipmentId,
      requestedById: requesterUserId,
      status: 'pending',
      reason: 'Test deletion request',
    });
  });

  afterEach(async () => {
    // Cleanup order: child tables first, then parents
    await db.delete(equipmentDeleteRequests).where(eq(equipmentDeleteRequests.id, requestId));
    await db.delete(equipment).where(eq(equipment.id, equipmentId));
    await db.delete(users).where(eq(users.id, adminUserId));
    await db.delete(users).where(eq(users.id, requesterUserId));
  });

  it('should soft-delete equipment on approval', async () => {
    const result = await model.approveEquipmentDeleteRequest(requestId, adminUserId);
    expect(result).toBeDefined();
    // The transaction updates the request status AND soft-deletes the equipment
    const [eqRow] = await db.select().from(equipment).where(eq(equipment.id, equipmentId));
    expect(eqRow.deletedAt).not.toBeNull();
  });

  it('should not overwrite deletedAt when equipment was already soft-deleted', async () => {
    // Pre-delete the equipment independently (simulating it was deleted via deleteEquipment)
    const preDeleteTime = new Date();
    await db.update(equipment)
      .set({ deletedAt: preDeleteTime })
      .where(eq(equipment.id, equipmentId));

    // Now approve the delete request — guard should prevent overwrite
    await model.approveEquipmentDeleteRequest(requestId, adminUserId);

    const [eqRow] = await db.select().from(equipment).where(eq(equipment.id, equipmentId));
    // deletedAt should match the pre-set timestamp, not a newer one
    expect(eqRow.deletedAt!.getTime()).toBe(preDeleteTime.getTime());
  });
});
