import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import {
  auditLogs,
  brewMethodEquipmentRules,
  coffeeVarieties,
  equipment,
  equipmentDeleteRequests,
  recipes,
  recipeVersions,
  reports,
  userPreferences,
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
    expect(result).not.toBeNull();
    expect(result.deletedAt).not.toBeNull();
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
    expect(result).not.toBeNull();
    expect(result.deletedAt).not.toBeNull();
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
    expect(result).not.toBeNull();
    expect(result.deletedAt).not.toBeNull();
    expect(result.updatedAt).not.toBeNull();
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

describe(
  'approveEquipmentDeleteRequest guard',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
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
  },
);

describe('banUser', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `ban-${userId}@example.com`,
      username: `banuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should ban an active user', async () => {
    const result = await model.banUser(userId);
    expect(result).not.toBeNull();
    expect(result!.isBanned).toBe(true);
  });

  it('should return null for a soft-deleted user and not change isBanned', async () => {
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));
    const result = await model.banUser(userId);
    expect(result).toBeNull();
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row.isBanned).toBe(false);
  });

  it('should not ban a user that is already banned and soft-deleted', async () => {
    await db.update(users).set({ isBanned: true }).where(eq(users.id, userId));
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));
    const result = await model.banUser(userId);
    expect(result).toBeNull();
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row.isBanned).toBe(true);
  });
});

describe('unbanUser', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `unban-${userId}@example.com`,
      username: `unbanuser-${userId}`,
      passwordHash: 'hash',
      isBanned: true,
    });
  });

  afterEach(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should unban an active banned user', async () => {
    const result = await model.unbanUser(userId);
    expect(result).not.toBeNull();
    expect(result!.isBanned).toBe(false);
  });

  it('should return null for a soft-deleted user and not change isBanned', async () => {
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));
    const result = await model.unbanUser(userId);
    expect(result).toBeNull();
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row.isBanned).toBe(true);
  });
});

describe('setUserAdminRole', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `role-${userId}@example.com`,
      username: `roleuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should grant admin role on an active user', async () => {
    const result = await model.setUserAdminRole(userId, true);
    expect(result).not.toBeNull();
    expect(result!.isAdmin).toBe(true);
  });

  it('should revoke admin role on an active user', async () => {
    await model.setUserAdminRole(userId, true);
    const result = await model.setUserAdminRole(userId, false);
    expect(result).not.toBeNull();
    expect(result!.isAdmin).toBe(false);
  });

  it('should return null for a soft-deleted user and not grant admin (privilege escalation blocked)', async () => {
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));
    const result = await model.setUserAdminRole(userId, true);
    expect(result).toBeNull();
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row.isAdmin).toBe(false);
  });
});

describe('updateRecipeVisibility', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    recipeId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `recipe-${userId}@example.com`,
      username: `recipeuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(recipes).values({
      id: recipeId,
      slug: `test-recipe-${recipeId}`,
      title: 'Test Recipe',
      authorId: userId,
    });
  });

  afterEach(async () => {
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should update visibility on an active recipe', async () => {
    const result = await model.updateRecipeVisibility(recipeId, 'public');
    expect(result).not.toBeNull();
    expect(result!.visibility).toBe('public');
  });

  it('should return null for a soft-deleted recipe and not change visibility', async () => {
    await db.update(recipes).set({ deletedAt: new Date() }).where(eq(recipes.id, recipeId));
    const result = await model.updateRecipeVisibility(recipeId, 'public');
    expect(result).toBeNull();
    const [row] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
    expect(row.visibility).toBe('draft');
  });
});

describe('updateEquipment', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let equipmentId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    equipmentId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `eq-${userId}@example.com`,
      username: `equser-${userId}`,
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
    await db.delete(equipment).where(eq(equipment.id, equipmentId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should update name on an active equipment', async () => {
    const result = await model.updateEquipment(equipmentId, { name: 'Renamed Grinder' });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Renamed Grinder');
  });

  it('should return null for a soft-deleted equipment and not change name', async () => {
    await db.update(equipment).set({ deletedAt: new Date() }).where(eq(equipment.id, equipmentId));
    const result = await model.updateEquipment(equipmentId, { name: 'Renamed Grinder' });
    expect(result).toBeNull();
    const [row] = await db.select().from(equipment).where(eq(equipment.id, equipmentId));
    expect(row.name).toBe('Test Grinder');
  });
});

describe('updateVendor', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let vendorId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    vendorId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `vendor-${userId}@example.com`,
      username: `vendoruser-${userId}`,
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

  it('should update name on an active vendor', async () => {
    const result = await model.updateVendor(vendorId, { name: 'Renamed Vendor' });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Renamed Vendor');
  });

  it('should return null for a soft-deleted vendor and not change name', async () => {
    await db.update(vendors).set({ deletedAt: new Date() }).where(eq(vendors.id, vendorId));
    const result = await model.updateVendor(vendorId, { name: 'Renamed Vendor' });
    expect(result).toBeNull();
    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
    expect(row.name).toBe('Test Vendor');
  });
});

describe('listUsers', { sanitizeOps: false, sanitizeResources: false }, () => {
  const userIds: string[] = [];

  beforeEach(async () => {
    for (let i = 0; i < 3; i++) {
      const id = crypto.randomUUID();
      userIds.push(id);
      await db.insert(users).values({
        id,
        email: `list-${id}@example.com`,
        username: `listuser-${id}`,
        passwordHash: 'hash',
        displayName: `Display ${i}`,
      });
    }
  });

  afterEach(async () => {
    for (const id of userIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    userIds.length = 0;
  });

  it('should return paginated users', async () => {
    const result = await model.listUsers(1, 2);
    expect(result.users.length).toBeLessThanOrEqual(2);
    expect(result.total).toBeGreaterThanOrEqual(3);
  });

  it('should return second page', async () => {
    const page1 = await model.listUsers(1, 2);
    const page2 = await model.listUsers(2, 2);
    expect(page2.users.length).toBeGreaterThanOrEqual(1);
    const page1Ids = page1.users.map((u) => u.id);
    for (const u of page2.users) {
      expect(page1Ids).not.toContain(u.id);
    }
  });

  it('should filter by email search query', async () => {
    const target = userIds[0];
    const result = await model.listUsers(1, 50, `list-${target}`);
    expect(result.total).toBe(1);
    expect(result.users[0].id).toBe(target);
  });

  it('should filter by username search query', async () => {
    const target = userIds[1];
    const result = await model.listUsers(1, 50, `listuser-${target}`);
    expect(result.total).toBe(1);
    expect(result.users[0].id).toBe(target);
  });

  it('should exclude soft-deleted users', async () => {
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userIds[2]));
    const result = await model.listUsers(1, 50, `list-${userIds[2]}`);
    expect(result.total).toBe(0);
  });
});

describe('isEmailTaken', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `taken-${userId}@example.com`,
      username: `takenuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return true for an existing email', async () => {
    const result = await model.isEmailTaken(`taken-${userId}@example.com`);
    expect(result).toBe(true);
  });

  it('should return false for a non-existing email', async () => {
    const result = await model.isEmailTaken(`nonexist-${userId}@example.com`);
    expect(result).toBe(false);
  });

  it('should exclude the given user id', async () => {
    const result = await model.isEmailTaken(`taken-${userId}@example.com`, userId);
    expect(result).toBe(false);
  });

  it('should return false for a soft-deleted user email', async () => {
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));
    const result = await model.isEmailTaken(`taken-${userId}@example.com`);
    expect(result).toBe(false);
  });
});

describe('isUsernameTaken', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `uname-${userId}@example.com`,
      username: `unameuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return true for an existing username', async () => {
    const result = await model.isUsernameTaken(`unameuser-${userId}`);
    expect(result).toBe(true);
  });

  it('should return false for a non-existing username', async () => {
    const result = await model.isUsernameTaken(`nope-${userId}`);
    expect(result).toBe(false);
  });

  it('should exclude the given user id', async () => {
    const result = await model.isUsernameTaken(`unameuser-${userId}`, userId);
    expect(result).toBe(false);
  });
});

describe('getUserById', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `getbyid-${userId}@example.com`,
      username: `getbyid-${userId}`,
      passwordHash: 'hash',
      displayName: 'Get By Id',
      bio: 'test bio',
    });
  });

  afterEach(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return the user when found', async () => {
    const result = await model.getUserById(userId);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(userId);
    expect(result!.displayName).toBe('Get By Id');
    expect(result!.bio).toBe('test bio');
  });

  it('should return null for a non-existing id', async () => {
    const result = await model.getUserById(crypto.randomUUID());
    expect(result).toBeNull();
  });

  it('should return null for a soft-deleted user', async () => {
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));
    const result = await model.getUserById(userId);
    expect(result).toBeNull();
  });
});

describe('throwIfUniqueViolation', () => {
  it('should throw EMAIL_ALREADY_EXISTS for email constraint', () => {
    const err = {
      cause: { name: 'PostgresError', code: '23505', constraint_name: 'user_email_unique' },
    };
    expect(() => model.throwIfUniqueViolation(err)).toThrow('EMAIL_ALREADY_EXISTS');
  });

  it('should throw USERNAME_ALREADY_EXISTS for username constraint', () => {
    const err = {
      cause: { name: 'PostgresError', code: '23505', constraint_name: 'user_username_unique' },
    };
    expect(() => model.throwIfUniqueViolation(err)).toThrow('USERNAME_ALREADY_EXISTS');
  });

  it('should not throw for non-unique-violation errors', () => {
    const err = {
      cause: { name: 'PostgresError', code: '23503', constraint_name: 'fk_something' },
    };
    expect(() => model.throwIfUniqueViolation(err)).not.toThrow();
  });

  it('should not throw for errors without cause', () => {
    expect(() => model.throwIfUniqueViolation(new Error('random'))).not.toThrow();
  });

  it('should handle direct PostgresError shape without cause wrapper', () => {
    const err = { name: 'PostgresError', code: '23505', constraint_name: 'user_email_unique' };
    expect(() => model.throwIfUniqueViolation(err)).toThrow('EMAIL_ALREADY_EXISTS');
  });
});

describe('adminCreateUser', { sanitizeOps: false, sanitizeResources: false }, () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    for (const id of createdIds) {
      await db.delete(userPreferences).where(eq(userPreferences.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
    createdIds.length = 0;
  });

  it('should create a user with preferences', async () => {
    const user = await model.adminCreateUser({
      email: `create-${crypto.randomUUID()}@example.com`,
      username: `createuser-${crypto.randomUUID()}`,
      password: 'password123',
      displayName: 'New User',
      isAdmin: true,
    });
    createdIds.push(user.id);
    expect(user.email).toContain('@example.com');
    expect(user.isAdmin).toBe(true);
    expect(user.passwordHash).not.toBe('password123');
    const [prefs] = await db.select().from(userPreferences).where(
      eq(userPreferences.userId, user.id),
    );
    expect(prefs).toBeDefined();
  });

  it('should throw EMAIL_ALREADY_EXISTS on duplicate email', async () => {
    const email = `dup-${crypto.randomUUID()}@example.com`;
    const user1 = await model.adminCreateUser({
      email,
      username: `dup1-${crypto.randomUUID()}`,
      password: 'pass',
    });
    createdIds.push(user1.id);
    try {
      await model.adminCreateUser({
        email,
        username: `dup2-${crypto.randomUUID()}`,
        password: 'pass',
      });
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toBe('EMAIL_ALREADY_EXISTS');
    }
  });

  it('should throw USERNAME_ALREADY_EXISTS on duplicate username', async () => {
    const username = `dupuname-${crypto.randomUUID()}`;
    const user1 = await model.adminCreateUser({
      email: `dup3-${crypto.randomUUID()}@example.com`,
      username,
      password: 'pass',
    });
    createdIds.push(user1.id);
    try {
      await model.adminCreateUser({
        email: `dup4-${crypto.randomUUID()}@example.com`,
        username,
        password: 'pass',
      });
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toBe('USERNAME_ALREADY_EXISTS');
    }
  });
});

describe('adminUpdateUser', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `upd-${userId}@example.com`,
      username: `upduser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should update email and displayName', async () => {
    const result = await model.adminUpdateUser(userId, {
      email: `new-${userId}@example.com`,
      displayName: 'Updated Name',
    });
    expect(result).not.toBeNull();
    expect(result!.email).toBe(`new-${userId}@example.com`);
    expect(result!.displayName).toBe('Updated Name');
  });

  it('should update password hash', async () => {
    const result = await model.adminUpdateUser(userId, { password: 'newpass' });
    expect(result).not.toBeNull();
    expect(result!.passwordHash).not.toBe('hash');
    expect(result!.passwordHash).not.toBe('newpass');
  });

  it('should return null when no fields provided', async () => {
    const result = await model.adminUpdateUser(userId, {});
    expect(result).toBeNull();
  });

  it('should return null for a non-existing user', async () => {
    const result = await model.adminUpdateUser(crypto.randomUUID(), { displayName: 'X' });
    expect(result).toBeNull();
  });

  it('should throw EMAIL_ALREADY_EXISTS on duplicate email', async () => {
    const otherId = crypto.randomUUID();
    await db.insert(users).values({
      id: otherId,
      email: `other-${otherId}@example.com`,
      username: `otheruser-${otherId}`,
      passwordHash: 'hash',
    });
    try {
      await model.adminUpdateUser(userId, { email: `other-${otherId}@example.com` });
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toBe('EMAIL_ALREADY_EXISTS');
    } finally {
      await db.delete(users).where(eq(users.id, otherId));
    }
  });
});

describe('softDeleteUser', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `sdel-${userId}@example.com`,
      username: `sdeluser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should soft-delete an active user', async () => {
    const result = await model.softDeleteUser(userId);
    expect(result).not.toBeNull();
    expect(result!.deletedAt).not.toBeNull();
  });

  it('should return null for an already-deleted user', async () => {
    await model.softDeleteUser(userId);
    const second = await model.softDeleteUser(userId);
    expect(second).toBeNull();
  });

  it('should return null for a non-existing user', async () => {
    const result = await model.softDeleteUser(crypto.randomUUID());
    expect(result).toBeNull();
  });
});

describe('listAllRecipes', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  const recipeIds: string[] = [];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `lrec-${userId}@example.com`,
      username: `lrecuser-${userId}`,
      passwordHash: 'hash',
    });
    for (const vis of ['draft', 'public', 'public'] as const) {
      const id = crypto.randomUUID();
      recipeIds.push(id);
      await db.insert(recipes).values({
        id,
        slug: `lrec-${id}`,
        title: `Recipe ${vis}`,
        authorId: userId,
        visibility: vis,
      });
    }
  });

  afterEach(async () => {
    for (const id of recipeIds) {
      await db.delete(recipes).where(eq(recipes.id, id));
    }
    recipeIds.length = 0;
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return paginated recipes', async () => {
    const result = await model.listAllRecipes(1, 2);
    expect(result.recipes.length).toBeLessThanOrEqual(2);
    expect(result.total).toBeGreaterThanOrEqual(3);
  });

  it('should filter by valid visibility', async () => {
    const result = await model.listAllRecipes(1, 50, 'public');
    expect(result.total).toBeGreaterThanOrEqual(2);
    for (const r of result.recipes) {
      expect(r.visibility).toBe('public');
    }
  });

  it('should ignore invalid visibility filter', async () => {
    const result = await model.listAllRecipes(1, 50, 'invalid_vis');
    expect(result.total).toBeGreaterThanOrEqual(3);
  });

  it('should exclude soft-deleted recipes', async () => {
    await db.update(recipes).set({ deletedAt: new Date() }).where(eq(recipes.id, recipeIds[0]));
    const result = await model.listAllRecipes(1, 50, 'draft');
    const ids = result.recipes.map((r) => r.id);
    expect(ids).not.toContain(recipeIds[0]);
  });
});

describe('softDeleteRecipe', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    recipeId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `sdr-${userId}@example.com`,
      username: `sdruser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(recipes).values({
      id: recipeId,
      slug: `sdr-${recipeId}`,
      title: 'Soft Delete Recipe',
      authorId: userId,
    });
  });

  afterEach(async () => {
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should soft-delete an active recipe', async () => {
    const result = await model.softDeleteRecipe(recipeId);
    expect(result).not.toBeNull();
    expect(result!.deletedAt).not.toBeNull();
  });

  it('should return null for an already-deleted recipe', async () => {
    await model.softDeleteRecipe(recipeId);
    const second = await model.softDeleteRecipe(recipeId);
    expect(second).toBeNull();
  });
});

describe('listEquipment', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  const eqIds: string[] = [];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `leq-${userId}@example.com`,
      username: `lequser-${userId}`,
      passwordHash: 'hash',
    });
    for (let i = 0; i < 3; i++) {
      const id = crypto.randomUUID();
      eqIds.push(id);
      await db.insert(equipment).values({
        id,
        name: `Equip ${i}`,
        type: 'grinder',
        isSystem: false,
        createdBy: userId,
      });
    }
  });

  afterEach(async () => {
    for (const id of eqIds) {
      await db.delete(equipment).where(eq(equipment.id, id));
    }
    eqIds.length = 0;
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return paginated equipment', async () => {
    const result = await model.listEquipment(1, 2);
    expect(result.equipment.length).toBeLessThanOrEqual(2);
    expect(result.total).toBeGreaterThanOrEqual(3);
  });

  it('should exclude soft-deleted equipment', async () => {
    await db.update(equipment).set({ deletedAt: new Date() }).where(eq(equipment.id, eqIds[0]));
    const result = await model.listEquipment(1, 50);
    const ids = result.equipment.map((e) => e.id);
    expect(ids).not.toContain(eqIds[0]);
  });
});

describe('createEquipment', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  const createdIds: string[] = [];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `ceq-${userId}@example.com`,
      username: `cequser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await db.delete(equipment).where(eq(equipment.id, id));
    }
    createdIds.length = 0;
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should create equipment with valid type', async () => {
    const result = await model.createEquipment({
      name: 'New Grinder',
      type: 'grinder',
      brand: 'TestBrand',
    });
    createdIds.push(result.id);
    expect(result.name).toBe('New Grinder');
    expect(result.type).toBe('grinder');
  });

  it('should throw for invalid equipment type', async () => {
    try {
      await model.createEquipment({ name: 'Bad', type: 'invalid_type' });
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toBe('Invalid equipment type');
    }
  });
});

describe('listVendors', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  const vendorIds: string[] = [];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `lv-${userId}@example.com`,
      username: `lvuser-${userId}`,
      passwordHash: 'hash',
    });
    for (let i = 0; i < 2; i++) {
      const id = crypto.randomUUID();
      vendorIds.push(id);
      await db.insert(vendors).values({ id, name: `Vendor ${i}`, createdBy: userId });
    }
  });

  afterEach(async () => {
    for (const id of vendorIds) {
      await db.delete(vendors).where(eq(vendors.id, id));
    }
    vendorIds.length = 0;
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return paginated vendors', async () => {
    const result = await model.listVendors(1, 10);
    expect(result.total).toBeGreaterThanOrEqual(2);
  });

  it('should exclude soft-deleted vendors', async () => {
    await db.update(vendors).set({ deletedAt: new Date() }).where(eq(vendors.id, vendorIds[0]));
    const result = await model.listVendors(1, 50);
    const ids = result.vendors.map((v) => v.id);
    expect(ids).not.toContain(vendorIds[0]);
  });
});

describe('createVendor', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  const createdIds: string[] = [];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `cv-${userId}@example.com`,
      username: `cvuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await db.delete(vendors).where(eq(vendors.id, id));
    }
    createdIds.length = 0;
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should create a vendor', async () => {
    const result = await model.createVendor({
      name: 'New Vendor',
      website: 'https://example.com',
      createdBy: userId,
    });
    createdIds.push(result.id);
    expect(result.name).toBe('New Vendor');
    expect(result.website).toBe('https://example.com');
  });
});

describe('compatibility rules', { sanitizeOps: false, sanitizeResources: false }, () => {
  const ruleIds: string[] = [];

  afterEach(async () => {
    for (const id of ruleIds) {
      await db.delete(brewMethodEquipmentRules).where(eq(brewMethodEquipmentRules.id, id));
    }
    ruleIds.length = 0;
  });

  it('should list compatibility rules', async () => {
    const result = await model.listCompatibilityRules();
    expect(Array.isArray(result)).toBe(true);
  });

  it('should create a compatibility rule with valid enums', async () => {
    const result = await model.createCompatibilityRule({
      brewMethod: 'siphon',
      equipmentType: 'roaster',
      compatible: true,
    });
    ruleIds.push(result.id);
    expect(result.brewMethod).toBe('siphon');
    expect(result.equipmentType).toBe('roaster');
    expect(result.compatible).toBe(true);
  });

  it('should throw for invalid brew method', async () => {
    try {
      await model.createCompatibilityRule({
        brewMethod: 'invalid_method',
        equipmentType: 'kettle',
        compatible: true,
      });
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toBe('Invalid brew method');
    }
  });

  it('should throw for invalid equipment type', async () => {
    try {
      await model.createCompatibilityRule({
        brewMethod: 'v60',
        equipmentType: 'invalid_type',
        compatible: true,
      });
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toBe('Invalid equipment type');
    }
  });

  it('should update a compatibility rule', async () => {
    const created = await model.createCompatibilityRule({
      brewMethod: 'siphon',
      equipmentType: 'portafilter',
      compatible: true,
    });
    ruleIds.push(created.id);
    const result = await model.updateCompatibilityRule(created.id, false);
    expect(result).not.toBeNull();
    expect(result!.compatible).toBe(false);
  });

  it('should return null when updating a non-existing rule', async () => {
    const result = await model.updateCompatibilityRule(crypto.randomUUID(), false);
    expect(result).toBeNull();
  });

  it('should delete a compatibility rule', async () => {
    const created = await model.createCompatibilityRule({
      brewMethod: 'siphon',
      equipmentType: 'basket',
      compatible: true,
    });
    await model.deleteCompatibilityRule(created.id);
    const result = await model.updateCompatibilityRule(created.id, false);
    expect(result).toBeNull();
  });
});

describe('reports', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  const reportIds: string[] = [];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `rpt-${userId}@example.com`,
      username: `rptuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    for (const id of reportIds) {
      await db.delete(reports).where(eq(reports.id, id));
    }
    reportIds.length = 0;
    await db.delete(users).where(eq(users.id, userId));
  });

  async function createReport(status: string, entityType: string) {
    const id = crypto.randomUUID();
    reportIds.push(id);
    await db.insert(reports).values({
      id,
      reporterId: userId,
      entityType,
      entityId: crypto.randomUUID(),
      reason: 'Test reason',
      status: status as 'pending',
    });
    return id;
  }

  it('should list reports with pagination', async () => {
    await createReport('pending', 'recipe');
    await createReport('pending', 'comment');
    const result = await model.listReports(1, 10);
    expect(result.total).toBeGreaterThanOrEqual(2);
  });

  it('should filter by status', async () => {
    await createReport('pending', 'recipe');
    await createReport('resolved', 'recipe');
    const result = await model.listReports(1, 50, 'resolved');
    for (const r of result.reports) {
      expect(r.status).toBe('resolved');
    }
  });

  it('should filter by entityType', async () => {
    await createReport('pending', 'recipe');
    await createReport('pending', 'comment');
    const result = await model.listReports(1, 50, undefined, 'comment');
    for (const r of result.reports) {
      expect(r.entityType).toBe('comment');
    }
  });

  it('should filter by both status and entityType', async () => {
    await createReport('pending', 'recipe');
    await createReport('resolved', 'comment');
    const result = await model.listReports(1, 50, 'resolved', 'comment');
    expect(result.total).toBeGreaterThanOrEqual(1);
    for (const r of result.reports) {
      expect(r.status).toBe('resolved');
      expect(r.entityType).toBe('comment');
    }
  });

  it('should resolve a report', async () => {
    const id = await createReport('pending', 'recipe');
    const result = await model.resolveReport(id, userId);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('resolved');
    expect(result!.resolvedBy).toBe(userId);
    expect(result!.resolvedAt).not.toBeNull();
  });

  it('should return null when resolving a non-existing report', async () => {
    const result = await model.resolveReport(crypto.randomUUID(), userId);
    expect(result).toBeNull();
  });

  it('should dismiss a report', async () => {
    const id = await createReport('pending', 'recipe');
    const result = await model.dismissReport(id, userId);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('dismissed');
    expect(result!.resolvedBy).toBe(userId);
  });

  it('should return null when dismissing a non-existing report', async () => {
    const result = await model.dismissReport(crypto.randomUUID(), userId);
    expect(result).toBeNull();
  });
});

describe('audit logs', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  const logIds: string[] = [];

  beforeEach(async () => {
    adminId = crypto.randomUUID();
    await db.insert(users).values({
      id: adminId,
      email: `audit-${adminId}@example.com`,
      username: `audituser-${adminId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    for (const id of logIds) {
      await db.delete(auditLogs).where(eq(auditLogs.id, id));
    }
    logIds.length = 0;
    await db.delete(users).where(eq(users.id, adminId));
  });

  it('should create an audit log entry', async () => {
    const result = await model.createAuditLog(adminId, 'ban', 'user', 'some-id', 'banned user');
    logIds.push(result.id);
    expect(result.adminId).toBe(adminId);
    expect(result.action).toBe('ban');
    expect(result.entity).toBe('user');
    expect(result.entityId).toBe('some-id');
    expect(result.details).toBe('banned user');
  });

  it('should create an audit log without optional fields', async () => {
    const result = await model.createAuditLog(adminId, 'create', 'equipment');
    logIds.push(result.id);
    expect(result.entityId).toBeNull();
    expect(result.details).toBeNull();
  });

  it('should list audit logs with pagination', async () => {
    const log1 = await model.createAuditLog(adminId, 'ban', 'user');
    const log2 = await model.createAuditLog(adminId, 'delete', 'recipe');
    logIds.push(log1.id, log2.id);
    const result = await model.listAuditLogs(1, 10);
    expect(result.total).toBeGreaterThanOrEqual(2);
  });

  it('should filter audit logs by entity', async () => {
    const log1 = await model.createAuditLog(adminId, 'ban', 'user');
    const log2 = await model.createAuditLog(adminId, 'delete', 'recipe');
    logIds.push(log1.id, log2.id);
    const result = await model.listAuditLogs(1, 50, 'user');
    for (const l of result.logs) {
      expect(l.entity).toBe('user');
    }
  });
});

describe('getDashboardStats', { sanitizeOps: false, sanitizeResources: false }, () => {
  it('should return aggregate stats with numeric fields', async () => {
    const stats = await model.getDashboardStats();
    expect(typeof stats.totalUsers).toBe('number');
    expect(typeof stats.totalRecipes).toBe('number');
    expect(typeof stats.totalComments).toBe('number');
    expect(typeof stats.totalReports).toBe('number');
    expect(typeof stats.pendingReports).toBe('number');
    expect(typeof stats.newUsersToday).toBe('number');
    expect(typeof stats.newRecipesToday).toBe('number');
  });
});

describe('getUserGrowth', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `growth-${userId}@example.com`,
      username: `growthuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return growth data with date strings', async () => {
    const result = await model.getUserGrowth(30);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should exclude soft-deleted users', async () => {
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));
    const result = await model.getUserGrowth(30);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('getRecipeGrowth', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    recipeId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `rgrowth-${userId}@example.com`,
      username: `rgrowthuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(recipes).values({
      id: recipeId,
      slug: `rgrowth-${recipeId}`,
      title: 'Growth Recipe',
      authorId: userId,
    });
  });

  afterEach(async () => {
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return recipe growth data', async () => {
    const result = await model.getRecipeGrowth(30);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('getTopRecipes', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  const recipeIds: string[] = [];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `top-${userId}@example.com`,
      username: `topuser-${userId}`,
      passwordHash: 'hash',
    });
    for (let i = 0; i < 3; i++) {
      const id = crypto.randomUUID();
      recipeIds.push(id);
      await db.insert(recipes).values({
        id,
        slug: `top-${id}`,
        title: `Top Recipe ${i}`,
        authorId: userId,
        visibility: 'public',
        likeCount: i * 10,
      });
    }
  });

  afterEach(async () => {
    for (const id of recipeIds) {
      await db.delete(recipes).where(eq(recipes.id, id));
    }
    recipeIds.length = 0;
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return top recipes ordered by likeCount', async () => {
    const result = await model.getTopRecipes(2);
    expect(result.length).toBeLessThanOrEqual(2);
    if (result.length === 2) {
      expect(result[0].likeCount).toBeGreaterThanOrEqual(result[1].likeCount);
    }
  });

  it('should only include public recipes', async () => {
    const draftId = crypto.randomUUID();
    await db.insert(recipes).values({
      id: draftId,
      slug: `top-draft-${draftId}`,
      title: 'Draft Recipe',
      authorId: userId,
      visibility: 'draft',
      likeCount: 999,
    });
    const result = await model.getTopRecipes(50);
    const ids = result.map((r) => r.id);
    expect(ids).not.toContain(draftId);
    await db.delete(recipes).where(eq(recipes.id, draftId));
  });
});

describe('getTopUsers', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    recipeId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `topu-${userId}@example.com`,
      username: `topuuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(recipes).values({
      id: recipeId,
      slug: `topu-${recipeId}`,
      title: 'User Recipe',
      authorId: userId,
    });
  });

  afterEach(async () => {
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return top users with recipe counts', async () => {
    // ponytail: large limit — a 1-recipe user can't reach top-10 against seed data (mirrors service.test.ts)
    const result = await model.getTopUsers(1000);
    expect(Array.isArray(result)).toBe(true);
    const found = result.find((u) => u.id === userId);
    expect(found).toBeDefined();
    expect(found!._count.recipes).toBeGreaterThanOrEqual(1);
  });
});

describe('listCoffeeVarieties', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  const varietyIds: string[] = [];
  const uniqueTag = crypto.randomUUID().slice(0, 8);

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `lcv-${userId}@example.com`,
      username: `lcvuser-${userId}`,
      passwordHash: 'hash',
    });
    const names = [`Alpha${uniqueTag}`, `Beta${uniqueTag}`, `Gamma${uniqueTag}`];
    for (const name of names) {
      const id = crypto.randomUUID();
      varietyIds.push(id);
      await db.insert(coffeeVarieties).values({
        id,
        name,
        category: 'variety',
        species: `species-${uniqueTag}`,
        origin: 'Ethiopia',
        isSystem: false,
        createdBy: userId,
      });
    }
  });

  afterEach(async () => {
    for (const id of varietyIds) {
      await db.delete(coffeeVarieties).where(eq(coffeeVarieties.id, id));
    }
    varietyIds.length = 0;
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return paginated varieties', async () => {
    const result = await model.listCoffeeVarieties(1, 2);
    expect(result.varieties.length).toBeLessThanOrEqual(2);
    expect(result.total).toBeGreaterThanOrEqual(3);
  });

  it('should filter by category', async () => {
    const result = await model.listCoffeeVarieties(1, 50, 'variety');
    expect(result.total).toBeGreaterThanOrEqual(3);
    for (const v of result.varieties) {
      expect(v.category).toBe('variety');
    }
  });

  it('should filter by search on name', async () => {
    const result = await model.listCoffeeVarieties(1, 50, undefined, `Alpha${uniqueTag}`);
    expect(result.total).toBe(1);
    expect(result.varieties[0].name).toBe(`Alpha${uniqueTag}`);
  });

  it('should filter by search on species', async () => {
    const result = await model.listCoffeeVarieties(1, 50, undefined, `species-${uniqueTag}`);
    expect(result.total).toBe(3);
  });

  it('should exclude soft-deleted varieties', async () => {
    await db.update(coffeeVarieties).set({ deletedAt: new Date() }).where(
      eq(coffeeVarieties.id, varietyIds[0]),
    );
    const result = await model.listCoffeeVarieties(1, 50, undefined, `Alpha${uniqueTag}`);
    expect(result.total).toBe(0);
  });
});

describe('createCoffeeVariety', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  const createdIds: string[] = [];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `ccv-${userId}@example.com`,
      username: `ccvuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await db.delete(coffeeVarieties).where(eq(coffeeVarieties.id, id));
    }
    createdIds.length = 0;
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should create a coffee variety', async () => {
    const result = await model.createCoffeeVariety({
      name: 'SL28',
      category: 'variety',
      species: 'arabica',
      origin: 'Kenya',
      isSystem: false,
      createdBy: userId,
    });
    createdIds.push(result.id);
    expect(result.name).toBe('SL28');
    expect(result.category).toBe('variety');
  });
});

describe('updateCoffeeVariety', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let varietyId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    varietyId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `ucv-${userId}@example.com`,
      username: `ucvuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(coffeeVarieties).values({
      id: varietyId,
      name: 'Original',
      category: 'variety',
      isSystem: false,
      createdBy: userId,
    });
  });

  afterEach(async () => {
    await db.delete(coffeeVarieties).where(eq(coffeeVarieties.id, varietyId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should update a variety and bump updatedAt', async () => {
    const result = await model.updateCoffeeVariety(varietyId, { name: 'Updated' });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Updated');
  });

  it('should return null for a non-existing variety', async () => {
    const result = await model.updateCoffeeVariety(crypto.randomUUID(), { name: 'X' });
    expect(result).toBeNull();
  });
});

describe('getVarietyRecipeCount', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let varietyId: string;
  let recipeId: string;
  let versionId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    varietyId = crypto.randomUUID();
    recipeId = crypto.randomUUID();
    versionId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `vrc-${userId}@example.com`,
      username: `vrcuser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(coffeeVarieties).values({
      id: varietyId,
      name: 'Count Variety',
      category: 'variety',
      isSystem: false,
      createdBy: userId,
    });
    await db.insert(recipes).values({
      id: recipeId,
      slug: `vrc-${recipeId}`,
      title: 'Variety Recipe',
      authorId: userId,
    });
    await db.insert(recipeVersions).values({
      id: versionId,
      recipeId,
      versionNumber: 1,
      brewMethod: 'v60',
      drinkType: 'pour_over',
      preparationNotes: 'test',
      coffeeVarietyId: varietyId,
    });
    await db.update(recipes).set({ currentVersionId: versionId }).where(eq(recipes.id, recipeId));
  });

  afterEach(async () => {
    await db.update(recipes).set({ currentVersionId: null }).where(eq(recipes.id, recipeId));
    await db.delete(recipeVersions).where(eq(recipeVersions.id, versionId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(coffeeVarieties).where(eq(coffeeVarieties.id, varietyId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should count recipes using the variety', async () => {
    const result = await model.getVarietyRecipeCount(varietyId);
    expect(result).toBe(1);
  });

  it('should return 0 for a variety with no recipes', async () => {
    const emptyId = crypto.randomUUID();
    const result = await model.getVarietyRecipeCount(emptyId);
    expect(result).toBe(0);
  });
});

describe('listEquipmentDeleteRequests', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let equipmentId: string;
  const requestIds: string[] = [];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    equipmentId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `ledr-${userId}@example.com`,
      username: `ledruser-${userId}`,
      passwordHash: 'hash',
    });
    await db.insert(equipment).values({
      id: equipmentId,
      name: 'EDR Equipment',
      type: 'grinder',
      isSystem: false,
      createdBy: userId,
    });
    for (const status of ['pending', 'approved'] as const) {
      const id = crypto.randomUUID();
      requestIds.push(id);
      await db.insert(equipmentDeleteRequests).values({
        id,
        equipmentId,
        requestedById: userId,
        status,
        reason: `Reason ${status}`,
      });
    }
  });

  afterEach(async () => {
    for (const id of requestIds) {
      await db.delete(equipmentDeleteRequests).where(eq(equipmentDeleteRequests.id, id));
    }
    requestIds.length = 0;
    await db.delete(equipment).where(eq(equipment.id, equipmentId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should list requests with pagination', async () => {
    const result = await model.listEquipmentDeleteRequests(1, 10);
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.requests.length).toBeGreaterThanOrEqual(2);
  });

  it('should filter by status', async () => {
    const result = await model.listEquipmentDeleteRequests(1, 50, 'pending');
    for (const r of result.requests) {
      expect(r.status).toBe('pending');
    }
  });

  it('should include equipment and requester relations', async () => {
    const result = await model.listEquipmentDeleteRequests(1, 10);
    const req = result.requests.find((r) => r.id === requestIds[0]);
    expect(req).toBeDefined();
    expect(req!.equipment).toBeDefined();
    expect(req!.requestedBy).toBeDefined();
    expect(req!.requestedBy.id).toBe(userId);
  });
});

describe('rejectEquipmentDeleteRequest', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let requesterId: string;
  let equipmentId: string;
  let requestId: string;

  beforeEach(async () => {
    adminId = crypto.randomUUID();
    requesterId = crypto.randomUUID();
    equipmentId = crypto.randomUUID();
    requestId = crypto.randomUUID();
    await db.insert(users).values({
      id: adminId,
      email: `rej-a-${adminId}@example.com`,
      username: `rejadmin-${adminId}`,
      passwordHash: 'hash',
    });
    await db.insert(users).values({
      id: requesterId,
      email: `rej-r-${requesterId}@example.com`,
      username: `rejreq-${requesterId}`,
      passwordHash: 'hash',
    });
    await db.insert(equipment).values({
      id: equipmentId,
      name: 'Reject Equipment',
      type: 'grinder',
      isSystem: false,
      createdBy: requesterId,
    });
    await db.insert(equipmentDeleteRequests).values({
      id: requestId,
      equipmentId,
      requestedById: requesterId,
      status: 'pending',
      reason: 'Please delete',
    });
  });

  afterEach(async () => {
    await db.delete(equipmentDeleteRequests).where(eq(equipmentDeleteRequests.id, requestId));
    await db.delete(equipment).where(eq(equipment.id, equipmentId));
    await db.delete(users).where(eq(users.id, adminId));
    await db.delete(users).where(eq(users.id, requesterId));
  });

  it('should reject a pending request', async () => {
    const result = await model.rejectEquipmentDeleteRequest(requestId, adminId);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('rejected');
    expect(result!.reviewedById).toBe(adminId);
    expect(result!.reviewedAt).not.toBeNull();
  });

  it('should return null for a non-existing request', async () => {
    const result = await model.rejectEquipmentDeleteRequest(crypto.randomUUID(), adminId);
    expect(result).toBeNull();
  });

  it('should not soft-delete equipment on rejection', async () => {
    await model.rejectEquipmentDeleteRequest(requestId, adminId);
    const [eqRow] = await db.select().from(equipment).where(eq(equipment.id, equipmentId));
    expect(eqRow.deletedAt).toBeNull();
  });
});

describe('approveEquipmentDeleteRequest null guard', {
  sanitizeOps: false,
  sanitizeResources: false,
}, () => {
  it('should return null for a non-existing request', async () => {
    const result = await model.approveEquipmentDeleteRequest(
      crypto.randomUUID(),
      crypto.randomUUID(),
    );
    expect(result).toBeNull();
  });
});
