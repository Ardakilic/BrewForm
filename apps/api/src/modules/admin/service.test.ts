/**
 * Real integration tests for the admin service layer.
 *
 * Every test imports the real `./service.ts` and hits the scratch
 * `brewform_test` database with inline `crypto.randomUUID()` fixtures.
 * Audit-log side effects are verified by querying the `audit_log` table
 * (whose `admin_id` FK requires a real admin user fixture). Cache-touching
 * functions receive a fresh `InMemoryCacheProvider`.
 *
 * Cleanup contract: `afterEach` hard-deletes child rows (audit logs,
 * reports, recipes, equipment, ...) before parent user rows.
 */

import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { and, eq } from 'drizzle-orm';
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
  tasteNotes,
  userPreferences,
  users,
  vendors,
} from '@brewform/db/schema';
import { InMemoryCacheProvider } from '../../utils/cache/index.ts';
import * as service from './service.ts';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Insert a user row with unique email/username. Returns the new user ID. */
async function insertUser(
  overrides: Partial<typeof users.$inferInsert> = {},
): Promise<string> {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: `test-${id}@example.com`,
    username: `testuser-${id}`,
    passwordHash: 'hash',
    ...overrides,
  });
  return id;
}

/** Insert an admin user row (acting admin for audit-log FK). Returns the ID. */
function insertAdmin(): Promise<string> {
  const id = crypto.randomUUID();
  return insertUser({
    id,
    email: `admin-${id}@example.com`,
    username: `admin-${id}`,
    isAdmin: true,
  });
}

/** Insert a recipe row. Returns the new recipe ID. */
async function insertRecipe(
  authorId: string,
  overrides: Partial<typeof recipes.$inferInsert> = {},
): Promise<string> {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(recipes).values({
    id,
    slug: `test-recipe-${id}`,
    title: `Test Recipe ${id.slice(0, 8)}`,
    authorId,
    ...overrides,
  });
  return id;
}

/** Insert an equipment row. Returns the new equipment ID. */
async function insertEquipment(
  overrides: Partial<typeof equipment.$inferInsert> = {},
): Promise<string> {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(equipment).values({
    id,
    name: `Test Equipment ${id.slice(0, 8)}`,
    type: 'grinder',
    isSystem: false,
    ...overrides,
  });
  return id;
}

/** Insert a vendor row. Returns the new vendor ID. */
async function insertVendor(
  createdBy: string,
  overrides: Partial<typeof vendors.$inferInsert> = {},
): Promise<string> {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(vendors).values({
    id,
    name: `Test Vendor ${id.slice(0, 8)}`,
    createdBy,
    ...overrides,
  });
  return id;
}

/** Insert a report row. Returns the new report ID. */
async function insertReport(
  reporterId: string,
  overrides: Partial<typeof reports.$inferInsert> = {},
): Promise<string> {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(reports).values({
    id,
    reporterId,
    entityType: 'Recipe',
    entityId: crypto.randomUUID(),
    reason: 'Test report reason',
    ...overrides,
  });
  return id;
}

/** Insert a coffee variety row. Returns the new variety ID. */
async function insertVariety(
  overrides: Partial<typeof coffeeVarieties.$inferInsert> = {},
): Promise<string> {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(coffeeVarieties).values({
    id,
    name: `Test Variety ${id.slice(0, 8)}`,
    category: 'variety',
    isSystem: false,
    ...overrides,
  });
  return id;
}

/** Insert an equipment delete request row. Returns the new request ID. */
async function insertDeleteRequest(
  equipmentId: string,
  requestedById: string,
  overrides: Partial<typeof equipmentDeleteRequests.$inferInsert> = {},
): Promise<string> {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(equipmentDeleteRequests).values({
    id,
    equipmentId,
    requestedById,
    reason: 'Test deletion request',
    ...overrides,
  });
  return id;
}

/** Query audit log rows written by the given admin, optionally narrowed by action and entity ID. */
function findAuditLogs(adminId: string, action: string, entityId?: string) {
  const where = entityId !== undefined
    ? and(
      eq(auditLogs.adminId, adminId),
      eq(auditLogs.action, action),
      eq(auditLogs.entityId, entityId),
    )
    : and(eq(auditLogs.adminId, adminId), eq(auditLogs.action, action));
  return db.select().from(auditLogs).where(where);
}

/** Hard-delete audit logs written by an admin, then the admin user row. */
async function cleanupAdmin(adminId: string) {
  await db.delete(auditLogs).where(eq(auditLogs.adminId, adminId));
  await db.delete(users).where(eq(users.id, adminId));
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

describe('listUsers', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userIds: string[];
  let fragment: string;

  beforeEach(async () => {
    userIds = [];
    fragment = `listusers-${crypto.randomUUID().slice(0, 8)}`;
    userIds.push(
      await insertUser({ username: `${fragment}-alpha`, displayName: 'Alpha Lister' }),
      await insertUser({ username: `${fragment}-beta`, displayName: 'Beta Lister' }),
    );
  });

  afterEach(async () => {
    for (const id of userIds) {
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it('should return only users matching the search query', async () => {
    const result = await service.listUsers(1, 10, fragment);
    expect(result.total).toBe(2);
    expect(result.users.map((u) => u.id).sort()).toEqual([...userIds].sort());
  });

  it('should paginate results while keeping the full filtered total', async () => {
    const result = await service.listUsers(1, 1, fragment);
    expect(result.users.length).toBe(1);
    expect(result.total).toBe(2);
  });

  it('should exclude soft-deleted users', async () => {
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userIds[0]));
    const result = await service.listUsers(1, 10, fragment);
    expect(result.total).toBe(1);
    expect(result.users[0].id).toBe(userIds[1]);
  });
});

describe('getUserDetail', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;

  beforeEach(async () => {
    userId = await insertUser({ displayName: 'Detail Target' });
  });

  afterEach(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return the user for an existing ID', async () => {
    const result = await service.getUserDetail(userId);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(userId);
    expect(result!.email).toBe(`test-${userId}@example.com`);
    expect(result!.displayName).toBe('Detail Target');
    expect(result!.isAdmin).toBe(false);
    expect(result!.isBanned).toBe(false);
  });

  it('should return null for a nonexistent ID', async () => {
    const result = await service.getUserDetail(crypto.randomUUID());
    expect(result).toBeNull();
  });

  it('should return null for a soft-deleted user', async () => {
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));
    const result = await service.getUserDetail(userId);
    expect(result).toBeNull();
  });
});

describe('banUser', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let targetId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    targetId = await insertUser();
  });

  afterEach(async () => {
    await db.delete(users).where(eq(users.id, targetId));
    await cleanupAdmin(adminId);
  });

  it('should ban the user and write a BAN_USER audit log with the reason', async () => {
    const result = await service.banUser(adminId, targetId, 'spam');
    expect(result.isBanned).toBe(true);

    const logs = await findAuditLogs(adminId, 'BAN_USER', targetId);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('User');
    expect(logs[0].details).toBe(JSON.stringify({ reason: 'spam' }));
  });

  it('should ban the user with null audit details when no reason is given', async () => {
    await service.banUser(adminId, targetId);

    const logs = await findAuditLogs(adminId, 'BAN_USER', targetId);
    expect(logs.length).toBe(1);
    expect(logs[0].details).toBeNull();
  });

  it('should throw USER_NOT_FOUND for a nonexistent user', async () => {
    await expect(service.banUser(adminId, crypto.randomUUID(), 'spam')).rejects.toThrow(
      'USER_NOT_FOUND',
    );
    const logs = await findAuditLogs(adminId, 'BAN_USER');
    expect(logs.length).toBe(0);
  });

  it('should throw USER_NOT_FOUND for a soft-deleted user and leave isBanned unchanged', async () => {
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, targetId));
    await expect(service.banUser(adminId, targetId)).rejects.toThrow('USER_NOT_FOUND');
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row.isBanned).toBe(false);
  });
});

describe('unbanUser', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let targetId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    targetId = await insertUser({ isBanned: true });
  });

  afterEach(async () => {
    await db.delete(users).where(eq(users.id, targetId));
    await cleanupAdmin(adminId);
  });

  it('should unban the user and write an UNBAN_USER audit log with clearing context', async () => {
    const result = await service.unbanUser(adminId, targetId);
    expect(result.isBanned).toBe(false);

    const logs = await findAuditLogs(adminId, 'UNBAN_USER', targetId);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('User');
    expect(logs[0].details).toBe('Ban context cleared');
  });

  it('should throw USER_NOT_FOUND for a nonexistent user', async () => {
    await expect(service.unbanUser(adminId, crypto.randomUUID())).rejects.toThrow(
      'USER_NOT_FOUND',
    );
  });
});

describe('setUserAdminRole', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let targetId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    targetId = await insertUser();
  });

  afterEach(async () => {
    await db.delete(users).where(eq(users.id, targetId));
    await cleanupAdmin(adminId);
  });

  it('should grant the admin role and write a SET_ADMIN audit log', async () => {
    const result = await service.setUserAdminRole(adminId, targetId, true);
    expect(result.isAdmin).toBe(true);

    const logs = await findAuditLogs(adminId, 'SET_ADMIN', targetId);
    expect(logs.length).toBe(1);
    expect(logs[0].details).toBe('isAdmin: true');
  });

  it('should revoke the admin role and write a REMOVE_ADMIN audit log', async () => {
    await service.setUserAdminRole(adminId, targetId, true);
    const result = await service.setUserAdminRole(adminId, targetId, false);
    expect(result.isAdmin).toBe(false);

    const logs = await findAuditLogs(adminId, 'REMOVE_ADMIN', targetId);
    expect(logs.length).toBe(1);
    expect(logs[0].details).toBe('isAdmin: false');
  });

  it('should throw USER_NOT_FOUND for a nonexistent user', async () => {
    await expect(service.setUserAdminRole(adminId, crypto.randomUUID(), true)).rejects.toThrow(
      'USER_NOT_FOUND',
    );
  });
});

describe('adminCreateUser', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let existingUserId: string;
  let createdUserIds: string[];

  beforeEach(async () => {
    adminId = await insertAdmin();
    existingUserId = await insertUser({
      email: `taken-${crypto.randomUUID()}@example.com`,
      username: `takenuser-${crypto.randomUUID()}`,
    });
    createdUserIds = [];
  });

  afterEach(async () => {
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await db.delete(users).where(eq(users.id, existingUserId));
    await cleanupAdmin(adminId);
  });

  it('should create the user with a hashed password, preferences, and a CREATE_USER audit log', async () => {
    const id = crypto.randomUUID().slice(0, 8);
    const result = await service.adminCreateUser(adminId, {
      email: `created-${id}@example.com`,
      username: `created-${id}`,
      password: 'SecurePass123!',
      displayName: 'Created User',
      bio: 'Created by an admin',
      isAdmin: true,
    });
    createdUserIds.push(result.id);

    expect(result.email).toBe(`created-${id}@example.com`);
    expect(result.displayName).toBe('Created User');
    expect(result.isAdmin).toBe(true);
    expect(result.passwordHash).not.toBe('SecurePass123!');
    expect(result.passwordHash.length).toBeGreaterThan(0);

    const prefs = await db.select().from(userPreferences).where(
      eq(userPreferences.userId, result.id),
    );
    expect(prefs.length).toBe(1);

    const logs = await findAuditLogs(adminId, 'CREATE_USER', result.id);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('User');
    expect(logs[0].details).toBe(`username: created-${id}`);
  });

  it('should propagate EMAIL_ALREADY_EXISTS from the model', async () => {
    const [existing] = await db.select().from(users).where(eq(users.id, existingUserId));
    await expect(
      service.adminCreateUser(adminId, {
        email: existing.email,
        username: `unique-${crypto.randomUUID()}`,
        password: 'SecurePass123!',
      }),
    ).rejects.toThrow('EMAIL_ALREADY_EXISTS');

    const logs = await findAuditLogs(adminId, 'CREATE_USER');
    expect(logs.length).toBe(0);
  });

  it('should propagate USERNAME_ALREADY_EXISTS from the model', async () => {
    const [existing] = await db.select().from(users).where(eq(users.id, existingUserId));
    await expect(
      service.adminCreateUser(adminId, {
        email: `unique-${crypto.randomUUID()}@example.com`,
        username: existing.username,
        password: 'SecurePass123!',
      }),
    ).rejects.toThrow('USERNAME_ALREADY_EXISTS');
  });
});

describe('adminUpdateUser', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let targetId: string;
  let otherUserId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    targetId = await insertUser();
    otherUserId = await insertUser();
  });

  afterEach(async () => {
    await db.delete(users).where(eq(users.id, otherUserId));
    await db.delete(users).where(eq(users.id, targetId));
    await cleanupAdmin(adminId);
  });

  it('should update the user and write an UPDATE_USER audit log with change details', async () => {
    const newEmail = `updated-${crypto.randomUUID()}@example.com`;
    const result = await service.adminUpdateUser(adminId, targetId, {
      email: newEmail,
      displayName: 'New Name',
    });
    expect(result.email).toBe(newEmail);
    expect(result.displayName).toBe('New Name');

    const logs = await findAuditLogs(adminId, 'UPDATE_USER', targetId);
    expect(logs.length).toBe(1);
    expect(logs[0].details).toBe(`email: ${newEmail}, displayName: New Name`);
  });

  it('should throw SELF_EDIT_FORBIDDEN when the admin edits themselves', async () => {
    await expect(
      service.adminUpdateUser(adminId, adminId, { displayName: 'Self Edit' }),
    ).rejects.toThrow('SELF_EDIT_FORBIDDEN');

    const logs = await findAuditLogs(adminId, 'UPDATE_USER');
    expect(logs.length).toBe(0);
  });

  it('should throw USER_NOT_FOUND for a nonexistent target user', async () => {
    await expect(
      service.adminUpdateUser(adminId, crypto.randomUUID(), { displayName: 'Ghost' }),
    ).rejects.toThrow('USER_NOT_FOUND');
  });

  it('should throw USER_NOT_FOUND when no update fields are provided', async () => {
    // The real model returns null for an empty update set; the service maps
    // that to USER_NOT_FOUND even though the user exists.
    await expect(service.adminUpdateUser(adminId, targetId, {})).rejects.toThrow(
      'USER_NOT_FOUND',
    );
  });

  it('should propagate EMAIL_ALREADY_EXISTS from the model', async () => {
    const [other] = await db.select().from(users).where(eq(users.id, otherUserId));
    await expect(
      service.adminUpdateUser(adminId, targetId, { email: other.email }),
    ).rejects.toThrow('EMAIL_ALREADY_EXISTS');
  });

  it('should propagate USERNAME_ALREADY_EXISTS from the model', async () => {
    const [other] = await db.select().from(users).where(eq(users.id, otherUserId));
    await expect(
      service.adminUpdateUser(adminId, targetId, { username: other.username }),
    ).rejects.toThrow('USERNAME_ALREADY_EXISTS');
  });

  it('should mask the password in change details and store a re-hashed password', async () => {
    const [before] = await db.select().from(users).where(eq(users.id, targetId));
    await service.adminUpdateUser(adminId, targetId, { password: 'NewSecret123!' });

    const logs = await findAuditLogs(adminId, 'UPDATE_USER', targetId);
    expect(logs.length).toBe(1);
    expect(logs[0].details).toBe('password: <changed>');
    expect(logs[0].details).not.toContain('NewSecret123!');

    const [after] = await db.select().from(users).where(eq(users.id, targetId));
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(after.passwordHash).not.toBe('NewSecret123!');
  });

  it('should include every provided field in the change details', async () => {
    const email = `all-${crypto.randomUUID()}@example.com`;
    const username = `all-${crypto.randomUUID()}`;
    await service.adminUpdateUser(adminId, targetId, {
      email,
      username,
      displayName: 'Display',
      bio: 'bio text',
      isAdmin: true,
      isBanned: true,
    });

    const logs = await findAuditLogs(adminId, 'UPDATE_USER', targetId);
    expect(logs.length).toBe(1);
    expect(logs[0].details).toBe(
      `email: ${email}, username: ${username}, displayName: Display, bio: <changed>, isAdmin: true, isBanned: true`,
    );

    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row.isAdmin).toBe(true);
    expect(row.isBanned).toBe(true);
    expect(row.bio).toBe('bio text');
  });
});

describe('softDeleteUser', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let targetId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    targetId = await insertUser();
  });

  afterEach(async () => {
    await db.delete(users).where(eq(users.id, targetId));
    await cleanupAdmin(adminId);
  });

  it('should soft-delete the user and write a SOFT_DELETE_USER audit log', async () => {
    await service.softDeleteUser(adminId, targetId);

    const detail = await service.getUserDetail(targetId);
    expect(detail).toBeNull();
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row.deletedAt).not.toBeNull();

    const logs = await findAuditLogs(adminId, 'SOFT_DELETE_USER', targetId);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('User');
  });

  it('should throw SELF_DELETE_FORBIDDEN when the admin deletes themselves', async () => {
    await expect(service.softDeleteUser(adminId, adminId)).rejects.toThrow(
      'SELF_DELETE_FORBIDDEN',
    );

    const [row] = await db.select().from(users).where(eq(users.id, adminId));
    expect(row.deletedAt).toBeNull();
    const logs = await findAuditLogs(adminId, 'SOFT_DELETE_USER');
    expect(logs.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

describe('listAllRecipes', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let publicId: string;
  let draftId: string;
  let deletedId: string;

  beforeEach(async () => {
    userId = await insertUser();
    publicId = await insertRecipe(userId, { visibility: 'public' });
    draftId = await insertRecipe(userId, { visibility: 'draft' });
    deletedId = await insertRecipe(userId, {
      visibility: 'public',
      deletedAt: new Date(),
    });
  });

  afterEach(async () => {
    for (const id of [publicId, draftId, deletedId]) {
      await db.delete(recipes).where(eq(recipes.id, id));
    }
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should list non-deleted recipes including every visibility', async () => {
    const result = await service.listAllRecipes(1, 100);
    const ids = result.recipes.map((r) => r.id);
    expect(ids).toContain(publicId);
    expect(ids).toContain(draftId);
    expect(ids).not.toContain(deletedId);
  });

  it('should filter by visibility', async () => {
    const result = await service.listAllRecipes(1, 100, 'public');
    const ids = result.recipes.map((r) => r.id);
    expect(ids).toContain(publicId);
    expect(ids).not.toContain(draftId);
  });

  it('should paginate with a full total count', async () => {
    const result = await service.listAllRecipes(1, 1);
    expect(result.recipes.length).toBe(1);
    expect(result.total).toBeGreaterThanOrEqual(2);
  });
});

describe('updateRecipeVisibility', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let userId: string;
  let recipeId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    userId = await insertUser();
    recipeId = await insertRecipe(userId, { visibility: 'draft' });
  });

  afterEach(async () => {
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
    await cleanupAdmin(adminId);
  });

  it('should update the visibility and write an UPDATE_RECIPE_VISIBILITY audit log', async () => {
    const result = await service.updateRecipeVisibility(adminId, recipeId, 'public');
    expect(result).not.toBeNull();
    expect(result!.visibility).toBe('public');

    const logs = await findAuditLogs(adminId, 'UPDATE_RECIPE_VISIBILITY', recipeId);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('Recipe');
    expect(logs[0].details).toBe('visibility: public');
  });

  it('should return null and skip the audit log for an invalid visibility value', async () => {
    const result = await service.updateRecipeVisibility(adminId, recipeId, 'not-a-visibility');
    expect(result).toBeNull();

    const [row] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
    expect(row.visibility).toBe('draft');
    const logs = await findAuditLogs(adminId, 'UPDATE_RECIPE_VISIBILITY');
    expect(logs.length).toBe(0);
  });

  it('should return null for a soft-deleted recipe', async () => {
    await db.update(recipes).set({ deletedAt: new Date() }).where(eq(recipes.id, recipeId));
    const result = await service.updateRecipeVisibility(adminId, recipeId, 'public');
    expect(result).toBeNull();
  });
});

describe('softDeleteRecipe', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let userId: string;
  let recipeId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    userId = await insertUser();
    recipeId = await insertRecipe(userId, { visibility: 'public' });
  });

  afterEach(async () => {
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
    await cleanupAdmin(adminId);
  });

  it('should soft-delete the recipe and write a SOFT_DELETE_RECIPE audit log', async () => {
    await service.softDeleteRecipe(adminId, recipeId);

    const [row] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
    expect(row.deletedAt).not.toBeNull();

    const logs = await findAuditLogs(adminId, 'SOFT_DELETE_RECIPE', recipeId);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('Recipe');
  });
});

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

describe('listEquipment', { sanitizeOps: false, sanitizeResources: false }, () => {
  let activeId: string;
  let deletedId: string;

  beforeEach(async () => {
    activeId = await insertEquipment({ name: 'SvcList Grinder' });
    deletedId = await insertEquipment({ name: 'SvcList Deleted', deletedAt: new Date() });
  });

  afterEach(async () => {
    await db.delete(equipment).where(eq(equipment.id, activeId));
    await db.delete(equipment).where(eq(equipment.id, deletedId));
  });

  it('should list non-deleted equipment with a total count', async () => {
    const result = await service.listEquipment(1, 100);
    const ids = result.equipment.map((e) => e.id);
    expect(ids).toContain(activeId);
    expect(ids).not.toContain(deletedId);
    expect(result.total).toBeGreaterThanOrEqual(1);
  });
});

describe('createEquipment', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let createdIds: string[];

  beforeEach(async () => {
    adminId = await insertAdmin();
    createdIds = [];
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await db.delete(equipment).where(eq(equipment.id, id));
    }
    await cleanupAdmin(adminId);
  });

  it('should create the equipment and write a CREATE_EQUIPMENT audit log', async () => {
    const result = await service.createEquipment(adminId, {
      name: 'Svc Grinder',
      type: 'grinder',
      brand: 'SvcBrand',
      model: 'SvcModel',
      description: 'Created by service test',
    });
    createdIds.push(result.id);

    expect(result.name).toBe('Svc Grinder');
    const [row] = await db.select().from(equipment).where(eq(equipment.id, result.id));
    expect(row.brand).toBe('SvcBrand');

    const logs = await findAuditLogs(adminId, 'CREATE_EQUIPMENT', result.id);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('Equipment');
  });

  it('should propagate the invalid equipment type error from the model', async () => {
    await expect(
      service.createEquipment(adminId, { name: 'Bad', type: 'not_a_type' }),
    ).rejects.toThrow('Invalid equipment type');

    const logs = await findAuditLogs(adminId, 'CREATE_EQUIPMENT');
    expect(logs.length).toBe(0);
  });
});

describe('updateEquipment', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let equipmentId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    equipmentId = await insertEquipment({ name: 'Original Name' });
  });

  afterEach(async () => {
    await db.delete(equipment).where(eq(equipment.id, equipmentId));
    await cleanupAdmin(adminId);
  });

  it('should update the equipment and write an UPDATE_EQUIPMENT audit log', async () => {
    const result = await service.updateEquipment(adminId, equipmentId, {
      name: 'Renamed Equipment',
    });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Renamed Equipment');

    const logs = await findAuditLogs(adminId, 'UPDATE_EQUIPMENT', equipmentId);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('Equipment');
  });
});

describe('deleteEquipment', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let equipmentId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    equipmentId = await insertEquipment();
  });

  afterEach(async () => {
    await db.delete(equipment).where(eq(equipment.id, equipmentId));
    await cleanupAdmin(adminId);
  });

  it('should soft-delete the equipment and write a DELETE_EQUIPMENT audit log', async () => {
    await service.deleteEquipment(adminId, equipmentId);

    const [row] = await db.select().from(equipment).where(eq(equipment.id, equipmentId));
    expect(row.deletedAt).not.toBeNull();

    const logs = await findAuditLogs(adminId, 'DELETE_EQUIPMENT', equipmentId);
    expect(logs.length).toBe(1);
  });

  it('should not write an audit log when the equipment does not exist', async () => {
    const ghostId = crypto.randomUUID();
    await service.deleteEquipment(adminId, ghostId);

    const logs = await findAuditLogs(adminId, 'DELETE_EQUIPMENT', ghostId);
    expect(logs.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

describe('listVendors', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let vendorId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    vendorId = await insertVendor(adminId, { name: 'SvcList Vendor' });
  });

  afterEach(async () => {
    await db.delete(vendors).where(eq(vendors.id, vendorId));
    await db.delete(users).where(eq(users.id, adminId));
  });

  it('should list non-deleted vendors with a total count', async () => {
    const result = await service.listVendors(1, 100);
    const ids = result.vendors.map((v) => v.id);
    expect(ids).toContain(vendorId);
    expect(result.total).toBeGreaterThanOrEqual(1);
  });
});

describe('createVendor', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let createdIds: string[];

  beforeEach(async () => {
    adminId = await insertAdmin();
    createdIds = [];
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await db.delete(vendors).where(eq(vendors.id, id));
    }
    await cleanupAdmin(adminId);
  });

  it('should create the vendor attributed to the admin and write a CREATE_VENDOR audit log', async () => {
    const result = await service.createVendor(adminId, {
      name: 'Svc Vendor',
      website: 'https://svc-vendor.example.com',
      description: 'Created by service test',
    });
    createdIds.push(result.id);

    expect(result.name).toBe('Svc Vendor');
    expect(result.createdBy).toBe(adminId);

    const logs = await findAuditLogs(adminId, 'CREATE_VENDOR', result.id);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('Vendor');
  });
});

describe('updateVendor', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let vendorId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    vendorId = await insertVendor(adminId, { name: 'Original Vendor' });
  });

  afterEach(async () => {
    await db.delete(vendors).where(eq(vendors.id, vendorId));
    await cleanupAdmin(adminId);
  });

  it('should update the vendor and write an UPDATE_VENDOR audit log', async () => {
    const result = await service.updateVendor(adminId, vendorId, { name: 'Renamed Vendor' });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Renamed Vendor');

    const logs = await findAuditLogs(adminId, 'UPDATE_VENDOR', vendorId);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('Vendor');
  });
});

describe('deleteVendor', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let vendorId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    vendorId = await insertVendor(adminId);
  });

  afterEach(async () => {
    await db.delete(vendors).where(eq(vendors.id, vendorId));
    await cleanupAdmin(adminId);
  });

  it('should soft-delete the vendor and write a DELETE_VENDOR audit log', async () => {
    await service.deleteVendor(adminId, vendorId);

    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
    expect(row.deletedAt).not.toBeNull();

    const logs = await findAuditLogs(adminId, 'DELETE_VENDOR', vendorId);
    expect(logs.length).toBe(1);
  });

  it('should not write an audit log when the vendor does not exist', async () => {
    const ghostId = crypto.randomUUID();
    await service.deleteVendor(adminId, ghostId);

    const logs = await findAuditLogs(adminId, 'DELETE_VENDOR', ghostId);
    expect(logs.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Taste Notes (admin)
// ---------------------------------------------------------------------------

describe('listTasteNotes', { sanitizeOps: false, sanitizeResources: false }, () => {
  it('should return the seeded taste note hierarchy', async () => {
    const cache = new InMemoryCacheProvider();
    const result = await service.listTasteNotes(cache);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should serve subsequent calls from the cache', async () => {
    const cache = new InMemoryCacheProvider();
    const first = await service.listTasteNotes(cache);
    const second = await service.listTasteNotes(cache);
    // The in-memory cache stores the value by reference, so a cache hit
    // returns the identical array instance.
    expect(second).toBe(first);
  });
});

describe('createTasteNote', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let createdIds: string[];

  beforeEach(async () => {
    adminId = await insertAdmin();
    createdIds = [];
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await db.delete(tasteNotes).where(eq(tasteNotes.id, id));
    }
    await cleanupAdmin(adminId);
  });

  it('should create the note and write a CREATE_TASTE_NOTE audit log', async () => {
    const cache = new InMemoryCacheProvider();
    const name = `Svc Note ${crypto.randomUUID().slice(0, 8)}`;
    const result = await service.createTasteNote(
      adminId,
      { name, depth: 0, color: '#ff0000', definition: 'Service-created note' },
      cache,
    );
    createdIds.push(result.id);

    const [row] = await db.select().from(tasteNotes).where(eq(tasteNotes.id, result.id));
    expect(row.name).toBe(name);
    expect(row.depth).toBe(0);

    const logs = await findAuditLogs(adminId, 'CREATE_TASTE_NOTE', result.id);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('TasteNote');
    expect(logs[0].details).toBe(`name: ${name}`);
  });
});

describe('updateTasteNote', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let noteId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    noteId = crypto.randomUUID();
    await db.insert(tasteNotes).values({
      id: noteId,
      name: `Original Note ${noteId.slice(0, 8)}`,
      depth: 0,
    });
  });

  afterEach(async () => {
    await db.delete(tasteNotes).where(eq(tasteNotes.id, noteId));
    await cleanupAdmin(adminId);
  });

  it('should update the note and write an UPDATE_TASTE_NOTE audit log', async () => {
    const cache = new InMemoryCacheProvider();
    await service.updateTasteNote(adminId, noteId, { name: 'Renamed Note' }, cache);

    const [row] = await db.select().from(tasteNotes).where(eq(tasteNotes.id, noteId));
    expect(row.name).toBe('Renamed Note');

    const logs = await findAuditLogs(adminId, 'UPDATE_TASTE_NOTE', noteId);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('TasteNote');
  });
});

describe('deleteTasteNote', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let noteId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    noteId = crypto.randomUUID();
    await db.insert(tasteNotes).values({
      id: noteId,
      name: `Doomed Note ${noteId.slice(0, 8)}`,
      depth: 0,
    });
  });

  afterEach(async () => {
    await db.delete(tasteNotes).where(eq(tasteNotes.id, noteId));
    await cleanupAdmin(adminId);
  });

  it('should soft-delete the note and write a DELETE_TASTE_NOTE audit log', async () => {
    const cache = new InMemoryCacheProvider();
    await service.deleteTasteNote(adminId, noteId, cache);

    const [row] = await db.select().from(tasteNotes).where(eq(tasteNotes.id, noteId));
    expect(row.deletedAt).not.toBeNull();

    const logs = await findAuditLogs(adminId, 'DELETE_TASTE_NOTE', noteId);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('TasteNote');
  });
});

// ---------------------------------------------------------------------------
// Brew Method Compatibility Matrix
// ---------------------------------------------------------------------------

describe('listCompatibilityRules', { sanitizeOps: false, sanitizeResources: false }, () => {
  it('should return the seeded compatibility rules', async () => {
    const result = await service.listCompatibilityRules();
    expect(result.length).toBeGreaterThan(0);
    for (const rule of result) {
      expect(typeof rule.brewMethod).toBe('string');
      expect(typeof rule.equipmentType).toBe('string');
      expect(typeof rule.compatible).toBe('boolean');
    }
  });
});

describe('updateCompatibilityRule', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let ruleId: string;
  let originalCompatible: boolean;
  let cache: InMemoryCacheProvider;

  beforeEach(async () => {
    adminId = await insertAdmin();
    const [rule] = await db.select().from(brewMethodEquipmentRules).limit(1);
    ruleId = rule.id;
    originalCompatible = rule.compatible;
    cache = new InMemoryCacheProvider();
    await cache.set(['cache', 'compatibility', 'matrix'], { seeded: true });
  });

  afterEach(async () => {
    await db.update(brewMethodEquipmentRules)
      .set({ compatible: originalCompatible })
      .where(eq(brewMethodEquipmentRules.id, ruleId));
    await cleanupAdmin(adminId);
  });

  it('should flip the rule, write an audit log, and invalidate the compatibility cache', async () => {
    const result = await service.updateCompatibilityRule(
      adminId,
      ruleId,
      !originalCompatible,
      cache,
    );
    expect(result.compatible).toBe(!originalCompatible);

    const logs = await findAuditLogs(adminId, 'UPDATE_COMPATIBILITY_RULE', ruleId);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('BrewMethodEquipmentRule');
    expect(logs[0].details).toBe(`compatible: ${!originalCompatible}`);

    expect(await cache.get(['cache', 'compatibility', 'matrix'])).toBeNull();
  });
});

describe('createCompatibilityRule', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let createdIds: string[];
  let cache: InMemoryCacheProvider;

  beforeEach(async () => {
    adminId = await insertAdmin();
    createdIds = [];
    cache = new InMemoryCacheProvider();
    await cache.set(['cache', 'compatibility', 'matrix'], { seeded: true });
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await db.delete(brewMethodEquipmentRules).where(eq(brewMethodEquipmentRules.id, id));
    }
    await cleanupAdmin(adminId);
  });

  it('should create the rule, write an audit log, and invalidate the cache', async () => {
    // ('v60', 'grinder') is not part of the seeded compatibility matrix.
    const result = await service.createCompatibilityRule(
      adminId,
      { brewMethod: 'v60', equipmentType: 'grinder', compatible: false },
      cache,
    );
    createdIds.push(result.id);

    expect(result.brewMethod).toBe('v60');
    expect(result.equipmentType).toBe('grinder');
    expect(result.compatible).toBe(false);

    const logs = await findAuditLogs(adminId, 'CREATE_COMPATIBILITY_RULE', result.id);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('BrewMethodEquipmentRule');

    expect(await cache.get(['cache', 'compatibility', 'matrix'])).toBeNull();
  });

  it('should propagate the invalid brew method error from the model', async () => {
    await expect(
      service.createCompatibilityRule(
        adminId,
        // Schema-typed as a union; cast through unknown to exercise the
        // model-level validation through the service.
        {
          brewMethod: 'not_a_method',
          equipmentType: 'grinder',
          compatible: true,
        } as unknown as Parameters<typeof service.createCompatibilityRule>[1],
        cache,
      ),
    ).rejects.toThrow('Invalid brew method');
  });
});

describe('deleteCompatibilityRule', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let ruleId: string;
  let cache: InMemoryCacheProvider;

  beforeEach(async () => {
    adminId = await insertAdmin();
    ruleId = crypto.randomUUID();
    await db.insert(brewMethodEquipmentRules).values({
      id: ruleId,
      brewMethod: 'v60',
      equipmentType: 'grinder',
      compatible: true,
    });
    cache = new InMemoryCacheProvider();
    await cache.set(['cache', 'compatibility', 'matrix'], { seeded: true });
  });

  afterEach(async () => {
    await db.delete(brewMethodEquipmentRules).where(eq(brewMethodEquipmentRules.id, ruleId));
    await cleanupAdmin(adminId);
  });

  it('should hard-delete the rule, write an audit log, and invalidate the cache', async () => {
    await service.deleteCompatibilityRule(adminId, ruleId, cache);

    const rows = await db.select().from(brewMethodEquipmentRules).where(
      eq(brewMethodEquipmentRules.id, ruleId),
    );
    expect(rows.length).toBe(0);

    const logs = await findAuditLogs(adminId, 'DELETE_COMPATIBILITY_RULE', ruleId);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('BrewMethodEquipmentRule');

    expect(await cache.get(['cache', 'compatibility', 'matrix'])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Reports (admin)
// ---------------------------------------------------------------------------

describe('listReports', { sanitizeOps: false, sanitizeResources: false }, () => {
  let reporterId: string;
  let pendingRecipeReportId: string;
  let resolvedRecipeReportId: string;
  let pendingCommentReportId: string;

  beforeEach(async () => {
    reporterId = await insertUser();
    pendingRecipeReportId = await insertReport(reporterId, {
      entityType: 'Recipe',
      status: 'pending',
    });
    resolvedRecipeReportId = await insertReport(reporterId, {
      entityType: 'Recipe',
      status: 'resolved',
    });
    pendingCommentReportId = await insertReport(reporterId, {
      entityType: 'Comment',
      status: 'pending',
    });
  });

  afterEach(async () => {
    for (const id of [pendingRecipeReportId, resolvedRecipeReportId, pendingCommentReportId]) {
      await db.delete(reports).where(eq(reports.id, id));
    }
    await db.delete(users).where(eq(users.id, reporterId));
  });

  it('should list reports without filters', async () => {
    const result = await service.listReports(1, 100);
    const ids = result.reports.map((r) => r.id);
    expect(ids).toContain(pendingRecipeReportId);
    expect(ids).toContain(resolvedRecipeReportId);
    expect(ids).toContain(pendingCommentReportId);
  });

  it('should filter by status', async () => {
    const result = await service.listReports(1, 100, 'pending');
    const ids = result.reports.map((r) => r.id);
    expect(ids).toContain(pendingRecipeReportId);
    expect(ids).toContain(pendingCommentReportId);
    expect(ids).not.toContain(resolvedRecipeReportId);
  });

  it('should filter by entity type', async () => {
    const result = await service.listReports(1, 100, undefined, 'Comment');
    const ids = result.reports.map((r) => r.id);
    expect(ids).toContain(pendingCommentReportId);
    expect(ids).not.toContain(pendingRecipeReportId);
    expect(ids).not.toContain(resolvedRecipeReportId);
  });

  it('should paginate with a full filtered total', async () => {
    const result = await service.listReports(1, 1, 'pending');
    expect(result.reports.length).toBe(1);
    expect(result.total).toBeGreaterThanOrEqual(2);
  });
});

describe('resolveReport', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let reporterId: string;
  let reportId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    reporterId = await insertUser();
    reportId = await insertReport(reporterId, { status: 'pending' });
  });

  afterEach(async () => {
    await db.delete(reports).where(eq(reports.id, reportId));
    await db.delete(users).where(eq(users.id, reporterId));
    await cleanupAdmin(adminId);
  });

  it('should mark the report resolved and write a RESOLVE_REPORT audit log', async () => {
    const result = await service.resolveReport(adminId, reportId);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('resolved');
    expect(result!.resolvedBy).toBe(adminId);
    expect(result!.resolvedAt).not.toBeNull();

    const logs = await findAuditLogs(adminId, 'RESOLVE_REPORT', reportId);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('Report');
  });
});

describe('dismissReport', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let reporterId: string;
  let reportId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    reporterId = await insertUser();
    reportId = await insertReport(reporterId, { status: 'pending' });
  });

  afterEach(async () => {
    await db.delete(reports).where(eq(reports.id, reportId));
    await db.delete(users).where(eq(users.id, reporterId));
    await cleanupAdmin(adminId);
  });

  it('should mark the report dismissed and write a DISMISS_REPORT audit log', async () => {
    const result = await service.dismissReport(adminId, reportId);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('dismissed');
    expect(result!.resolvedBy).toBe(adminId);
    expect(result!.resolvedAt).not.toBeNull();

    const logs = await findAuditLogs(adminId, 'DISMISS_REPORT', reportId);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('Report');
  });
});

// ---------------------------------------------------------------------------
// Audit Logs
// ---------------------------------------------------------------------------

describe('listAuditLogs', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let targetId: string;
  let equipmentId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    targetId = await insertUser();
    equipmentId = await insertEquipment();
    // Generate one 'User' audit entry and one 'Equipment' audit entry.
    await service.banUser(adminId, targetId, 'audit list test');
    await service.createEquipment(adminId, { name: 'AuditList Grinder', type: 'grinder' });
  });

  afterEach(async () => {
    await db.delete(equipment).where(eq(equipment.id, equipmentId));
    await db.delete(users).where(eq(users.id, targetId));
    await cleanupAdmin(adminId);
  });

  it('should list audit log entries filtered by entity', async () => {
    const result = await service.listAuditLogs(1, 100, 'User');
    const actions = result.logs.map((l) => l.action);
    expect(actions).toContain('BAN_USER');
    expect(actions).not.toContain('CREATE_EQUIPMENT');
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it('should list every audit log entry without a filter', async () => {
    const result = await service.listAuditLogs(1, 100);
    const mine = result.logs.filter((l) => l.adminId === adminId);
    const actions = mine.map((l) => l.action);
    expect(actions).toContain('BAN_USER');
    expect(actions).toContain('CREATE_EQUIPMENT');
  });
});

// ---------------------------------------------------------------------------
// Cache Flush
// ---------------------------------------------------------------------------

describe('flushCache', { sanitizeOps: false, sanitizeResources: false }, () => {
  let cache: InMemoryCacheProvider;

  beforeEach(async () => {
    // The service writes the FLUSH_CACHE audit log with the synthetic
    // 'system' admin ID; the audit_log.admin_id FK requires a matching user.
    await insertUser({
      id: 'system',
      email: 'system@brewform.test',
      username: 'system',
    });
    cache = new InMemoryCacheProvider();
    await cache.set(['cache', 'alpha'], 1);
    await cache.set(['cache', 'beta'], 2);
    await cache.set(['other', 'gamma'], 3);
  });

  afterEach(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.adminId, 'system'));
    await db.delete(users).where(eq(users.id, 'system'));
  });

  it('should flush the entire cache and write a FLUSH_CACHE audit log with ALL', async () => {
    await service.flushCache(cache, []);

    expect(await cache.get(['cache', 'alpha'])).toBeNull();
    expect(await cache.get(['cache', 'beta'])).toBeNull();
    expect(await cache.get(['other', 'gamma'])).toBe(3);

    const logs = await findAuditLogs('system', 'FLUSH_CACHE');
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('Cache');
    expect(logs[0].details).toBe('ALL');
  });

  it('should flush only the given keys and record them in the audit log', async () => {
    await service.flushCache(cache, ['alpha', 'beta']);

    expect(await cache.get(['cache', 'alpha'])).toBeNull();
    expect(await cache.get(['cache', 'beta'])).toBeNull();
    expect(await cache.get(['other', 'gamma'])).toBe(3);

    const logs = await findAuditLogs('system', 'FLUSH_CACHE');
    expect(logs.length).toBe(1);
    expect(logs[0].details).toBe('alpha,beta');
  });

  it('should still flush the cache when the system user is missing', async () => {
    // No seeded database contains a 'system' user; the flush must not fail
    // just because the audit-log insert cannot satisfy its FK.
    await db.delete(users).where(eq(users.id, 'system'));
    await service.flushCache(cache, []);

    expect(await cache.get(['cache', 'alpha'])).toBeNull();
    expect(await cache.get(['cache', 'beta'])).toBeNull();
    expect(await cache.get(['other', 'gamma'])).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

describe('getDashboardStats', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;
  let reportId: string;

  afterEach(async () => {
    await db.delete(reports).where(eq(reports.id, reportId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should aggregate users, recipes, and reports including pending counts', async () => {
    const before = await service.getDashboardStats();

    userId = await insertUser();
    recipeId = await insertRecipe(userId);
    reportId = await insertReport(userId, { status: 'pending' });

    const after = await service.getDashboardStats();
    expect(after.totalUsers).toBe(before.totalUsers + 1);
    expect(after.totalRecipes).toBe(before.totalRecipes + 1);
    expect(after.totalReports).toBe(before.totalReports + 1);
    expect(after.pendingReports).toBe(before.pendingReports + 1);
    expect(after.totalComments).toBe(before.totalComments);
    expect(typeof after.newUsersToday).toBe('number');
    expect(typeof after.newRecipesToday).toBe('number');
  });
});

describe('getUserGrowth', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userIds: string[];

  beforeEach(() => {
    userIds = [];
  });

  afterEach(async () => {
    for (const id of userIds) {
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it('should include users created within the window', async () => {
    userIds.push(await insertUser());
    const today = new Date().toISOString().split('T')[0];
    const result = await service.getUserGrowth(7);
    expect(result.some((r) => r.date === today)).toBe(true);
  });

  it('should exclude users older than the window', async () => {
    const old = new Date();
    old.setDate(old.getDate() - 30);
    const oldDate = old.toISOString().split('T')[0];
    const countOn = (rows: Array<{ date: string }>) =>
      rows.filter((r) => r.date === oldDate).length;

    const before7 = countOn(await service.getUserGrowth(7));
    const before40 = countOn(await service.getUserGrowth(40));

    userIds.push(await insertUser({ createdAt: old }));

    expect(countOn(await service.getUserGrowth(7))).toBe(before7);
    expect(countOn(await service.getUserGrowth(40))).toBe(before40 + 1);
  });
});

describe('getRecipeGrowth', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeIds: string[];

  beforeEach(async () => {
    userId = await insertUser();
    recipeIds = [];
  });

  afterEach(async () => {
    for (const id of recipeIds) {
      await db.delete(recipes).where(eq(recipes.id, id));
    }
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should include recipes created within the window', async () => {
    recipeIds.push(await insertRecipe(userId));
    const today = new Date().toISOString().split('T')[0];
    const result = await service.getRecipeGrowth(7);
    expect(result.some((r) => r.date === today)).toBe(true);
  });

  it('should exclude recipes older than the window', async () => {
    const old = new Date();
    old.setDate(old.getDate() - 30);
    const oldDate = old.toISOString().split('T')[0];
    const countOn = (rows: Array<{ date: string }>) =>
      rows.filter((r) => r.date === oldDate).length;

    const before7 = countOn(await service.getRecipeGrowth(7));
    const before40 = countOn(await service.getRecipeGrowth(40));

    recipeIds.push(await insertRecipe(userId, { createdAt: old }));

    expect(countOn(await service.getRecipeGrowth(7))).toBe(before7);
    expect(countOn(await service.getRecipeGrowth(40))).toBe(before40 + 1);
  });
});

describe('getTopRecipes', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeIds: string[];

  beforeEach(async () => {
    userId = await insertUser();
    recipeIds = [];
  });

  afterEach(async () => {
    for (const id of recipeIds) {
      await db.delete(recipes).where(eq(recipes.id, id));
    }
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should rank public recipes by like count and exclude non-public ones', async () => {
    const lowId = await insertRecipe(userId, { visibility: 'public', likeCount: 5000 });
    const highId = await insertRecipe(userId, { visibility: 'public', likeCount: 10000 });
    const draftId = await insertRecipe(userId, { visibility: 'draft', likeCount: 99999 });
    recipeIds.push(lowId, highId, draftId);

    const result = await service.getTopRecipes(1000);
    const ours = result.filter((r) => r.id === lowId || r.id === highId);
    expect(ours.map((r) => r.id)).toEqual([highId, lowId]);
    expect(result.some((r) => r.id === draftId)).toBe(false);
  });

  it('should respect the limit', async () => {
    const result = await service.getTopRecipes(1);
    expect(result.length).toBe(1);
  });
});

describe('getTopUsers', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeIds: string[];

  beforeEach(async () => {
    userId = await insertUser();
    recipeIds = [];
  });

  afterEach(async () => {
    for (const id of recipeIds) {
      await db.delete(recipes).where(eq(recipes.id, id));
    }
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should rank users by recipe count', async () => {
    recipeIds.push(await insertRecipe(userId), await insertRecipe(userId));

    const result = await service.getTopUsers(1000);
    const mine = result.find((u) => u.id === userId);
    expect(mine).toBeDefined();
    expect(mine!._count.recipes).toBe(2);
    expect(mine!.username).toBe(`testuser-${userId}`);
  });
});

// ---------------------------------------------------------------------------
// Coffee Varieties (admin)
// ---------------------------------------------------------------------------

describe('listCoffeeVarieties', { sanitizeOps: false, sanitizeResources: false }, () => {
  let fragment: string;
  let varietyId: string;
  let processingId: string;

  beforeEach(async () => {
    fragment = crypto.randomUUID().slice(0, 8);
    varietyId = await insertVariety({ name: `SvcVar Alpha ${fragment}`, category: 'variety' });
    processingId = await insertVariety({
      name: `SvcVar Beta ${fragment}`,
      category: 'processing',
    });
  });

  afterEach(async () => {
    await db.delete(coffeeVarieties).where(eq(coffeeVarieties.id, varietyId));
    await db.delete(coffeeVarieties).where(eq(coffeeVarieties.id, processingId));
  });

  it('should filter by search term', async () => {
    const result = await service.listCoffeeVarieties(1, 10, undefined, fragment);
    expect(result.total).toBe(2);
    expect(result.varieties.map((v) => v.id).sort()).toEqual([varietyId, processingId].sort());
  });

  it('should filter by category and search together', async () => {
    const result = await service.listCoffeeVarieties(1, 10, 'processing', fragment);
    expect(result.total).toBe(1);
    expect(result.varieties[0].id).toBe(processingId);
  });

  it('should paginate with a full filtered total', async () => {
    const result = await service.listCoffeeVarieties(1, 1, undefined, fragment);
    expect(result.varieties.length).toBe(1);
    expect(result.total).toBe(2);
  });
});

describe('createCoffeeVariety', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let createdIds: string[];

  beforeEach(async () => {
    adminId = await insertAdmin();
    createdIds = [];
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await db.delete(coffeeVarieties).where(eq(coffeeVarieties.id, id));
    }
    await cleanupAdmin(adminId);
  });

  it('should create the variety and write a CREATE_COFFEE_VARIETY audit log', async () => {
    const name = `Svc Variety ${crypto.randomUUID().slice(0, 8)}`;
    const result = await service.createCoffeeVariety(adminId, {
      name,
      category: 'variety',
      species: 'Arabica',
      origin: 'Testland',
      isSystem: false,
    });
    createdIds.push(result.id);

    expect(result.name).toBe(name);

    const logs = await findAuditLogs(adminId, 'CREATE_COFFEE_VARIETY', result.id);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('CoffeeVariety');
    expect(logs[0].details).toBe(`name: ${name}`);
  });
});

describe('updateCoffeeVariety', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let varietyId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    varietyId = await insertVariety({ name: 'Original Variety' });
  });

  afterEach(async () => {
    await db.delete(coffeeVarieties).where(eq(coffeeVarieties.id, varietyId));
    await cleanupAdmin(adminId);
  });

  it('should update the variety and write an UPDATE_COFFEE_VARIETY audit log', async () => {
    const result = await service.updateCoffeeVariety(adminId, varietyId, {
      name: 'Renamed Variety',
    });
    expect(result.name).toBe('Renamed Variety');

    const logs = await findAuditLogs(adminId, 'UPDATE_COFFEE_VARIETY', varietyId);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('CoffeeVariety');
  });

  it('should throw COFFEE_VARIETY_NOT_FOUND for a nonexistent variety', async () => {
    await expect(
      service.updateCoffeeVariety(adminId, crypto.randomUUID(), { name: 'Ghost' }),
    ).rejects.toThrow('COFFEE_VARIETY_NOT_FOUND');
  });
});

describe('deleteCoffeeVariety', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let varietyId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    varietyId = await insertVariety();
  });

  afterEach(async () => {
    await db.delete(coffeeVarieties).where(eq(coffeeVarieties.id, varietyId));
    await cleanupAdmin(adminId);
  });

  it('should soft-delete the variety and write a DELETE_COFFEE_VARIETY audit log', async () => {
    await service.deleteCoffeeVariety(adminId, varietyId);

    const [row] = await db.select().from(coffeeVarieties).where(
      eq(coffeeVarieties.id, varietyId),
    );
    expect(row.deletedAt).not.toBeNull();

    const logs = await findAuditLogs(adminId, 'DELETE_COFFEE_VARIETY', varietyId);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('CoffeeVariety');
  });

  it('should throw COFFEE_VARIETY_NOT_FOUND for a nonexistent variety', async () => {
    await expect(service.deleteCoffeeVariety(adminId, crypto.randomUUID())).rejects.toThrow(
      'COFFEE_VARIETY_NOT_FOUND',
    );
  });
});

describe('getVarietyRecipeCount', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let varietyId: string;
  let emptyVarietyId: string;
  let recipeId: string;
  let versionId: string;

  beforeEach(async () => {
    userId = await insertUser();
    varietyId = await insertVariety();
    emptyVarietyId = await insertVariety();

    // 3-step circular-FK dance: recipe, then version, then link currentVersionId.
    recipeId = crypto.randomUUID();
    versionId = crypto.randomUUID();
    await db.insert(recipes).values({
      id: recipeId,
      slug: `test-recipe-${recipeId}`,
      title: 'Variety Recipe',
      authorId: userId,
      visibility: 'public',
    });
    await db.insert(recipeVersions).values({
      id: versionId,
      recipeId,
      versionNumber: 1,
      brewMethod: 'v60',
      drinkType: 'pour_over',
      preparationNotes: '',
      coffeeVarietyId: varietyId,
    });
    await db.update(recipes).set({ currentVersionId: versionId }).where(
      eq(recipes.id, recipeId),
    );
  });

  afterEach(async () => {
    await db.delete(recipeVersions).where(eq(recipeVersions.id, versionId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(coffeeVarieties).where(eq(coffeeVarieties.id, varietyId));
    await db.delete(coffeeVarieties).where(eq(coffeeVarieties.id, emptyVarietyId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should count recipes whose current version uses the variety', async () => {
    expect(await service.getVarietyRecipeCount(varietyId)).toBe(1);
  });

  it('should return zero for a variety used by no recipe', async () => {
    expect(await service.getVarietyRecipeCount(emptyVarietyId)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Equipment Delete Requests (admin)
// ---------------------------------------------------------------------------

describe('listEquipmentDeleteRequests', { sanitizeOps: false, sanitizeResources: false }, () => {
  let requesterId: string;
  let equipmentId: string;
  let pendingId: string;
  let approvedId: string;

  beforeEach(async () => {
    requesterId = await insertUser();
    equipmentId = await insertEquipment({ createdBy: requesterId });
    pendingId = await insertDeleteRequest(equipmentId, requesterId, { status: 'pending' });
    approvedId = await insertDeleteRequest(equipmentId, requesterId, { status: 'approved' });
  });

  afterEach(async () => {
    await db.delete(equipmentDeleteRequests).where(eq(equipmentDeleteRequests.id, pendingId));
    await db.delete(equipmentDeleteRequests).where(eq(equipmentDeleteRequests.id, approvedId));
    await db.delete(equipment).where(eq(equipment.id, equipmentId));
    await db.delete(users).where(eq(users.id, requesterId));
  });

  it('should list requests with their equipment and requester relations', async () => {
    const result = await service.listEquipmentDeleteRequests(1, 100);
    const ids = result.requests.map((r) => r.id);
    expect(ids).toContain(pendingId);
    expect(ids).toContain(approvedId);

    const mine = result.requests.find((r) => r.id === pendingId);
    expect(mine).toBeDefined();
    expect(mine!.equipment.id).toBe(equipmentId);
    expect(mine!.requestedBy.id).toBe(requesterId);
    expect(mine!.requestedBy.username).toBe(`testuser-${requesterId}`);
  });

  it('should filter by status', async () => {
    const result = await service.listEquipmentDeleteRequests(1, 100, 'pending');
    const ids = result.requests.map((r) => r.id);
    expect(ids).toContain(pendingId);
    expect(ids).not.toContain(approvedId);
  });
});

describe('approveEquipmentDeleteRequest', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let requesterId: string;
  let equipmentId: string;
  let requestId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    requesterId = await insertUser();
    equipmentId = await insertEquipment({ createdBy: requesterId });
    requestId = await insertDeleteRequest(equipmentId, requesterId, { status: 'pending' });
  });

  afterEach(async () => {
    await db.delete(equipmentDeleteRequests).where(eq(equipmentDeleteRequests.id, requestId));
    await db.delete(equipment).where(eq(equipment.id, equipmentId));
    await db.delete(users).where(eq(users.id, requesterId));
    await cleanupAdmin(adminId);
  });

  it('should approve the request, soft-delete the equipment, and write an audit log', async () => {
    const result = await service.approveEquipmentDeleteRequest(adminId, requestId);
    expect(result.status).toBe('approved');
    expect(result.reviewedById).toBe(adminId);
    expect(result.reviewedAt).not.toBeNull();

    const [eqRow] = await db.select().from(equipment).where(eq(equipment.id, equipmentId));
    expect(eqRow.deletedAt).not.toBeNull();

    const logs = await findAuditLogs(adminId, 'APPROVE_EQUIPMENT_DELETE', requestId);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('EquipmentDeleteRequest');
    expect(logs[0].details).toBe(`equipmentId: ${equipmentId}`);
  });

  it('should throw DELETE_REQUEST_NOT_FOUND for a nonexistent request', async () => {
    await expect(
      service.approveEquipmentDeleteRequest(adminId, crypto.randomUUID()),
    ).rejects.toThrow('DELETE_REQUEST_NOT_FOUND');
  });
});

describe('rejectEquipmentDeleteRequest', { sanitizeOps: false, sanitizeResources: false }, () => {
  let adminId: string;
  let requesterId: string;
  let equipmentId: string;
  let requestId: string;

  beforeEach(async () => {
    adminId = await insertAdmin();
    requesterId = await insertUser();
    equipmentId = await insertEquipment({ createdBy: requesterId });
    requestId = await insertDeleteRequest(equipmentId, requesterId, { status: 'pending' });
  });

  afterEach(async () => {
    await db.delete(equipmentDeleteRequests).where(eq(equipmentDeleteRequests.id, requestId));
    await db.delete(equipment).where(eq(equipment.id, equipmentId));
    await db.delete(users).where(eq(users.id, requesterId));
    await cleanupAdmin(adminId);
  });

  it('should reject the request, leave the equipment active, and write an audit log', async () => {
    const result = await service.rejectEquipmentDeleteRequest(adminId, requestId);
    expect(result.status).toBe('rejected');
    expect(result.reviewedById).toBe(adminId);
    expect(result.reviewedAt).not.toBeNull();

    const [eqRow] = await db.select().from(equipment).where(eq(equipment.id, equipmentId));
    expect(eqRow.deletedAt).toBeNull();

    const logs = await findAuditLogs(adminId, 'REJECT_EQUIPMENT_DELETE', requestId);
    expect(logs.length).toBe(1);
    expect(logs[0].entity).toBe('EquipmentDeleteRequest');
  });

  it('should throw DELETE_REQUEST_NOT_FOUND for a nonexistent request', async () => {
    await expect(
      service.rejectEquipmentDeleteRequest(adminId, crypto.randomUUID()),
    ).rejects.toThrow('DELETE_REQUEST_NOT_FOUND');
  });
});
