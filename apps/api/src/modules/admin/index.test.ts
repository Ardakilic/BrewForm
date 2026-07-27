/**
 * Route-level integration tests for the admin module.
 *
 * Mounts the REAL admin router on a stub Hono app with auth stubbed at the
 * middleware seam (the `deps` proxy — same idiom as collection/index_test.ts
 * and the D99.9 block in comment/index.test.ts), then exercises the full HTTP
 * stack (Zod validation, auth/admin guards, service dispatch, envelope
 * response shaping) against the PostgreSQL test database.
 *
 * Fixture strategy: inline `crypto.randomUUID()` rows per describe, hard-deleted
 * afterwards (child tables first: audit_log and equipment_delete_request
 * reference users/equipment). Admin actions write audit_log rows keyed by the
 * acting admin, so each describe's fixture admin owns its audit-log cleanup.
 */

import '../../test-setup.ts';
import { afterAll, afterEach, beforeAll, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@brewform/db';
import {
  auditLogs,
  coffeeVarieties,
  equipment,
  equipmentDeleteRequests,
  userPreferences,
  users,
} from '@brewform/db/schema';
import admin, { deps } from './index.ts';
import type { AppEnv, ContextUser } from '../../types/hono.ts';

/** Pass-through auth stub — replaces authMiddleware; the REAL adminMiddleware still runs. */
const stubAuth = async (_c: Context, next: Next): Promise<undefined> => {
  await next();
  return undefined;
};
const originalAuthMiddleware = deps.authMiddleware;
const originalAdminMiddleware = deps.adminMiddleware;

/** Restore both middleware seam slots to the production implementations. */
function restoreDeps() {
  deps.authMiddleware = originalAuthMiddleware;
  deps.adminMiddleware = originalAdminMiddleware;
}

/**
 * Build a stub Hono app mounting the real admin router at /api/v1/admin.
 * Stubs `deps.authMiddleware` with a pass-through and seeds the context with
 * `user` — the REAL `adminMiddleware` then enforces the admin role.
 */
function createTestApp(user: { id: string; isAdmin: boolean } | null) {
  deps.authMiddleware = stubAuth;
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    if (user) {
      c.set('userId', user.id);
      // Minimal ContextUser — the admin surface reads only id/isAdmin.
      c.set('user', { id: user.id, isAdmin: user.isAdmin } as unknown as ContextUser);
    } else {
      c.set('userId', null);
      c.set('user', null);
    }
    await next();
  });
  app.route('/api/v1/admin', admin);
  return app;
}

/** Insert a bare-minimum user row (admin when `isAdmin` is true). */
async function insertUser(prefix: string, isAdmin = false) {
  const id = crypto.randomUUID();
  const [user] = await db.insert(users).values({
    id,
    email: `${prefix}-${id}@example.com`,
    username: `${prefix}-${id.slice(0, 8)}`,
    passwordHash: 'hash',
    isAdmin,
  }).returning();
  return user;
}

/** Insert a bare-minimum coffee variety row. */
async function insertCoffeeVariety(prefix: string) {
  const id = crypto.randomUUID();
  const [variety] = await db.insert(coffeeVarieties).values({
    id,
    name: `${prefix}-${id.slice(0, 8)}`,
    category: 'variety',
  }).returning();
  return variety;
}

/** Insert a bare-minimum equipment row. */
async function insertEquipment(prefix: string) {
  const id = crypto.randomUUID();
  const [row] = await db.insert(equipment).values({
    id,
    name: `${prefix}-${id.slice(0, 8)}`,
    type: 'grinder',
  }).returning();
  return row;
}

/** Insert a pending equipment delete request for `equipmentId`. */
async function insertDeleteRequest(equipmentId: string, requestedById: string) {
  const id = crypto.randomUUID();
  const [row] = await db.insert(equipmentDeleteRequests).values({
    id,
    equipmentId,
    requestedById,
    reason: 'duplicate entry',
  }).returning();
  return row;
}

/** Hard-delete users and every row that FK-references them (child tables first). */
async function cleanupUsers(userIds: string[]) {
  if (userIds.length === 0) return;
  await db.delete(auditLogs).where(inArray(auditLogs.adminId, userIds));
  await db.delete(equipmentDeleteRequests).where(
    inArray(equipmentDeleteRequests.requestedById, userIds),
  );
  await db.delete(equipmentDeleteRequests).where(
    inArray(equipmentDeleteRequests.reviewedById, userIds),
  );
  await db.delete(userPreferences).where(inArray(userPreferences.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
}

/** Hard-delete coffee varieties by id (including soft-deleted rows). */
async function cleanupCoffeeVarieties(varietyIds: string[]) {
  if (varietyIds.length === 0) return;
  await db.delete(coffeeVarieties).where(inArray(coffeeVarieties.id, varietyIds));
}

/** Hard-delete equipment delete requests and their equipment rows. */
async function cleanupEquipment(requestIds: string[], equipmentIds: string[]) {
  if (requestIds.length > 0) {
    await db.delete(equipmentDeleteRequests).where(
      inArray(equipmentDeleteRequests.id, requestIds),
    );
  }
  if (equipmentIds.length > 0) {
    await db.delete(equipment).where(inArray(equipment.id, equipmentIds));
  }
}

// ---------------------------------------------------------------------------
// Auth surface — real middleware chain, no DB fixtures required.
// ---------------------------------------------------------------------------
describe(
  'Admin router — auth surface',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    afterEach(() => {
      restoreDeps();
    });

    it('should return 401 UNAUTHORIZED when unauthenticated (real authMiddleware)', async () => {
      // Real middleware chain: no token → authMiddleware rejects before adminMiddleware.
      restoreDeps();
      const app = new Hono<AppEnv>();
      app.use('*', async (c, next) => {
        c.set('requestId', crypto.randomUUID());
        await next();
      });
      app.route('/api/v1/admin', admin);

      const res = await app.request('/api/v1/admin/users');
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 FORBIDDEN for an authenticated non-admin user', async () => {
      const app = createTestApp({ id: crypto.randomUUID(), isAdmin: false });
      const res = await app.request('/api/v1/admin/users');
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toBe('Admin access required');
    });
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/admin/users
// ---------------------------------------------------------------------------
describe(
  'POST /api/v1/admin/users',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    let adminUser: typeof users.$inferSelect;
    const createdUserIds: string[] = [];

    beforeAll(async () => {
      adminUser = await insertUser('adm-create', true);
    });

    afterEach(() => {
      restoreDeps();
    });

    afterAll(async () => {
      restoreDeps();
      await cleanupUsers([adminUser.id, ...createdUserIds]);
    });

    const postUser = (payload: unknown) =>
      createTestApp({ id: adminUser.id, isAdmin: true }).request('/api/v1/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

    it('should reject an empty body', async () => {
      const res = await postUser({});
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should reject an invalid email', async () => {
      const res = await postUser({ email: 'bad', username: 'testuser', password: '12345678' });
      expect(res.status).toBe(400);
    });

    it('should reject a short username', async () => {
      const res = await postUser({
        email: 'test@example.com',
        username: 'ab',
        password: '12345678',
      });
      expect(res.status).toBe(400);
    });

    it('should reject a weak password', async () => {
      const res = await postUser({
        email: 'test@example.com',
        username: 'testuser',
        password: 'short',
      });
      expect(res.status).toBe(400);
    });

    it('should reject a username with special characters', async () => {
      const res = await postUser({
        email: 'test@example.com',
        username: 'user name!',
        password: '12345678',
      });
      expect(res.status).toBe(400);
    });

    it('should create a user for a valid payload (201 + success envelope)', async () => {
      const id = crypto.randomUUID();
      const res = await postUser({
        email: `route-create-${id}@example.com`,
        username: `rcreate-${id.slice(0, 8)}`,
        password: 'password123',
        displayName: 'New User',
        bio: 'Hello',
        isAdmin: true,
        isBanned: false,
      });
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.email).toBe(`route-create-${id}@example.com`);
      expect(body.data.username).toBe(`rcreate-${id.slice(0, 8)}`);
      expect(body.data.isAdmin).toBe(true);
      createdUserIds.push(body.data.id);
    });
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/admin/users/:id
// ---------------------------------------------------------------------------
describe(
  'PATCH /api/v1/admin/users/:id',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    let adminUser: typeof users.$inferSelect;
    let targetUser: typeof users.$inferSelect;

    beforeAll(async () => {
      adminUser = await insertUser('adm-update', true);
      targetUser = await insertUser('adm-target');
    });

    afterEach(() => {
      restoreDeps();
    });

    afterAll(async () => {
      restoreDeps();
      await cleanupUsers([adminUser.id, targetUser.id]);
    });

    const patchUser = (id: string, payload: unknown) =>
      createTestApp({ id: adminUser.id, isAdmin: true }).request(`/api/v1/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

    it('should reject an empty body', async () => {
      const res = await patchUser(targetUser.id, {});
      expect(res.status).toBe(400);
    });

    it('should reject an invalid email', async () => {
      const res = await patchUser(targetUser.id, { email: 'not-an-email' });
      expect(res.status).toBe(400);
    });

    it('should reject a short username', async () => {
      const res = await patchUser(targetUser.id, { username: 'ab' });
      expect(res.status).toBe(400);
    });

    it('should accept a single-field update', async () => {
      const res = await patchUser(targetUser.id, { displayName: 'Updated Name' });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(targetUser.id);
      expect(body.data.displayName).toBe('Updated Name');
    });

    it('should accept an all-fields update', async () => {
      const id = crypto.randomUUID();
      const res = await patchUser(targetUser.id, {
        email: `route-upd-${id}@example.com`,
        username: `rupd-${id.slice(0, 8)}`,
        password: 'newpassword123',
        displayName: 'Updated',
        bio: 'New bio',
        isAdmin: false,
        isBanned: false,
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.email).toBe(`route-upd-${id}@example.com`);
      expect(body.data.username).toBe(`rupd-${id.slice(0, 8)}`);
      expect(body.data.displayName).toBe('Updated');
    });

    it('should return 404 NOT_FOUND for a non-existent target user', async () => {
      const res = await patchUser(crypto.randomUUID(), { displayName: 'Ghost' });
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/admin/users/:id/ban
// ---------------------------------------------------------------------------
describe(
  'POST /api/v1/admin/users/:id/ban',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    let adminUser: typeof users.$inferSelect;
    let targetUser: typeof users.$inferSelect;

    beforeAll(async () => {
      adminUser = await insertUser('adm-ban', true);
      targetUser = await insertUser('adm-bantarget');
    });

    afterEach(() => {
      restoreDeps();
    });

    afterAll(async () => {
      restoreDeps();
      await cleanupUsers([adminUser.id, targetUser.id]);
    });

    const postBan = (id: string, payload: unknown) =>
      createTestApp({ id: adminUser.id, isAdmin: true }).request(
        `/api/v1/admin/users/${id}/ban`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

    it('should reject a ban without a reason', async () => {
      const res = await postBan(targetUser.id, { userId: targetUser.id, banned: true });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should ban a user with a reason', async () => {
      const res = await postBan(targetUser.id, {
        userId: targetUser.id,
        banned: true,
        reason: 'Spam account',
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(targetUser.id);
      expect(body.data.isBanned).toBe(true);
    });

    it('should unban without a reason', async () => {
      const res = await postBan(targetUser.id, { userId: targetUser.id, banned: false });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(targetUser.id);
      expect(body.data.isBanned).toBe(false);
    });

    it('should reject an invalid userId UUID in the body', async () => {
      const res = await postBan(targetUser.id, {
        userId: 'not-a-uuid',
        banned: true,
        reason: 'Test',
      });
      expect(res.status).toBe(400);
    });

    it('should use the URL param id when it differs from the body userId', async () => {
      const res = await postBan(targetUser.id, {
        userId: crypto.randomUUID(), // decoy — handler must target the URL param
        banned: true,
        reason: 'Spam',
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(targetUser.id);
      expect(body.data.isBanned).toBe(true);
    });

    it('should return 404 NOT_FOUND when banning a non-existent user', async () => {
      const ghostId = crypto.randomUUID();
      const res = await postBan(ghostId, {
        userId: ghostId,
        banned: true,
        reason: 'Ghost',
      });
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/admin/coffee-varieties
// ---------------------------------------------------------------------------
describe(
  'GET /api/v1/admin/coffee-varieties',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    let adminUser: typeof users.$inferSelect;
    let variety: typeof coffeeVarieties.$inferSelect;

    beforeAll(async () => {
      adminUser = await insertUser('adm-cvlist', true);
      variety = await insertCoffeeVariety('cvlist');
    });

    afterEach(() => {
      restoreDeps();
    });

    afterAll(async () => {
      restoreDeps();
      await cleanupCoffeeVarieties([variety.id]);
      await cleanupUsers([adminUser.id]);
    });

    it('should return a paginated list with default pagination', async () => {
      const app = createTestApp({ id: adminUser.id, isAdmin: true });
      const res = await app.request('/api/v1/admin/coffee-varieties');
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta.pagination).toBeDefined();
    });

    it('should accept category and search query params', async () => {
      const app = createTestApp({ id: adminUser.id, isAdmin: true });
      const res = await app.request(
        `/api/v1/admin/coffee-varieties?category=variety&search=${variety.name}&page=1&perPage=10`,
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.some((v: { id: string }) => v.id === variety.id)).toBe(true);
    });
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/admin/coffee-varieties
// ---------------------------------------------------------------------------
describe(
  'POST /api/v1/admin/coffee-varieties',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    let adminUser: typeof users.$inferSelect;
    const varietyIds: string[] = [];

    beforeAll(async () => {
      adminUser = await insertUser('adm-cvcreate', true);
    });

    afterEach(() => {
      restoreDeps();
    });

    afterAll(async () => {
      restoreDeps();
      await cleanupCoffeeVarieties(varietyIds);
      await cleanupUsers([adminUser.id]);
    });

    const postVariety = (payload: unknown) =>
      createTestApp({ id: adminUser.id, isAdmin: true }).request(
        '/api/v1/admin/coffee-varieties',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

    it('should reject an empty body', async () => {
      const res = await postVariety({});
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject a missing name', async () => {
      const res = await postVariety({ category: 'variety' });
      expect(res.status).toBe(400);
    });

    it('should reject an invalid category', async () => {
      const res = await postVariety({ name: 'Bourbon', category: 'invalid_category' });
      expect(res.status).toBe(400);
    });

    it('should create a variety for a valid payload (201 + success envelope)', async () => {
      const name = `cvcreate-${crypto.randomUUID().slice(0, 8)}`;
      const res = await postVariety({
        name,
        category: 'variety',
        species: 'Coffea arabica',
        origin: 'Reunion Island',
      });
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe(name);
      expect(body.data.category).toBe('variety');
      varietyIds.push(body.data.id);
    });

    it('should create a variety for a minimal payload (name + category only)', async () => {
      const name = `cvmin-${crypto.randomUUID().slice(0, 8)}`;
      const res = await postVariety({ name, category: 'variety' });
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe(name);
      varietyIds.push(body.data.id);
    });
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/admin/coffee-varieties/:id
// ---------------------------------------------------------------------------
describe(
  'PATCH /api/v1/admin/coffee-varieties/:id',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    let adminUser: typeof users.$inferSelect;
    let variety: typeof coffeeVarieties.$inferSelect;

    beforeAll(async () => {
      adminUser = await insertUser('adm-cvpatch', true);
      variety = await insertCoffeeVariety('cvpatch');
    });

    afterEach(() => {
      restoreDeps();
    });

    afterAll(async () => {
      restoreDeps();
      await cleanupCoffeeVarieties([variety.id]);
      await cleanupUsers([adminUser.id]);
    });

    const patchVariety = (id: string, payload: unknown) =>
      createTestApp({ id: adminUser.id, isAdmin: true }).request(
        `/api/v1/admin/coffee-varieties/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

    it('should accept an empty body (partial update)', async () => {
      const res = await patchVariety(variety.id, {});
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(variety.id);
    });

    it('should accept a single-field update', async () => {
      const res = await patchVariety(variety.id, { name: 'Updated Bourbon' });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Updated Bourbon');
    });

    it('should reject an invalid category on update', async () => {
      const res = await patchVariety(variety.id, { category: 'bogus' });
      expect(res.status).toBe(400);
    });
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/admin/coffee-varieties/:id
// ---------------------------------------------------------------------------
describe(
  'DELETE /api/v1/admin/coffee-varieties/:id',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    let adminUser: typeof users.$inferSelect;
    let variety: typeof coffeeVarieties.$inferSelect;

    beforeAll(async () => {
      adminUser = await insertUser('adm-cvdel', true);
      variety = await insertCoffeeVariety('cvdel');
    });

    afterEach(() => {
      restoreDeps();
    });

    afterAll(async () => {
      restoreDeps();
      await cleanupCoffeeVarieties([variety.id]);
      await cleanupUsers([adminUser.id]);
    });

    it('should soft delete a variety', async () => {
      const app = createTestApp({ id: adminUser.id, isAdmin: true });
      const res = await app.request(`/api/v1/admin/coffee-varieties/${variety.id}`, {
        method: 'DELETE',
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.message).toBe('Coffee variety deleted');

      const rows = await db.select().from(coffeeVarieties).where(
        eq(coffeeVarieties.id, variety.id),
      );
      expect(rows[0].deletedAt).not.toBeNull();
    });
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/admin/coffee-varieties/:id/recipe-count
// ---------------------------------------------------------------------------
describe(
  'GET /api/v1/admin/coffee-varieties/:id/recipe-count',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    let adminUser: typeof users.$inferSelect;
    let variety: typeof coffeeVarieties.$inferSelect;

    beforeAll(async () => {
      adminUser = await insertUser('adm-cvcount', true);
      variety = await insertCoffeeVariety('cvcount');
    });

    afterEach(() => {
      restoreDeps();
    });

    afterAll(async () => {
      restoreDeps();
      await cleanupCoffeeVarieties([variety.id]);
      await cleanupUsers([adminUser.id]);
    });

    it('should return the recipe count for the variety', async () => {
      const app = createTestApp({ id: adminUser.id, isAdmin: true });
      const res = await app.request(`/api/v1/admin/coffee-varieties/${variety.id}/recipe-count`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.count).toBe(0);
    });
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/admin/equipment/delete-requests
// ---------------------------------------------------------------------------
describe(
  'GET /api/v1/admin/equipment/delete-requests',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    let adminUser: typeof users.$inferSelect;
    let requester: typeof users.$inferSelect;
    let equip: typeof equipment.$inferSelect;
    let request: typeof equipmentDeleteRequests.$inferSelect;

    beforeAll(async () => {
      adminUser = await insertUser('adm-edrlist', true);
      requester = await insertUser('adm-edrreq');
      equip = await insertEquipment('edrlist');
      request = await insertDeleteRequest(equip.id, requester.id);
    });

    afterEach(() => {
      restoreDeps();
    });

    afterAll(async () => {
      restoreDeps();
      await cleanupEquipment([request.id], [equip.id]);
      await cleanupUsers([adminUser.id, requester.id]);
    });

    it('should return a paginated list with default pagination', async () => {
      const app = createTestApp({ id: adminUser.id, isAdmin: true });
      const res = await app.request('/api/v1/admin/equipment/delete-requests');
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta.pagination).toBeDefined();
    });

    it('should accept a status filter', async () => {
      const app = createTestApp({ id: adminUser.id, isAdmin: true });
      const res = await app.request('/api/v1/admin/equipment/delete-requests?status=pending');
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.some((r: { id: string }) => r.id === request.id)).toBe(true);
    });
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/admin/equipment/delete-requests/:id/approve
// ---------------------------------------------------------------------------
describe(
  'POST /api/v1/admin/equipment/delete-requests/:id/approve',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    let adminUser: typeof users.$inferSelect;
    let requester: typeof users.$inferSelect;
    let equip: typeof equipment.$inferSelect;
    let request: typeof equipmentDeleteRequests.$inferSelect;

    beforeAll(async () => {
      adminUser = await insertUser('adm-edrappr', true);
      requester = await insertUser('adm-edrapprreq');
      equip = await insertEquipment('edrappr');
      request = await insertDeleteRequest(equip.id, requester.id);
    });

    afterEach(() => {
      restoreDeps();
    });

    afterAll(async () => {
      restoreDeps();
      await cleanupEquipment([request.id], [equip.id]);
      await cleanupUsers([adminUser.id, requester.id]);
    });

    it('should approve a delete request and soft-delete the equipment', async () => {
      const app = createTestApp({ id: adminUser.id, isAdmin: true });
      const res = await app.request(
        `/api/v1/admin/equipment/delete-requests/${request.id}/approve`,
        { method: 'POST' },
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(request.id);
      expect(body.data.status).toBe('approved');

      const rows = await db.select().from(equipment).where(eq(equipment.id, equip.id));
      expect(rows[0].deletedAt).not.toBeNull();
    });

    it('should return 404 NOT_FOUND for a non-existent request', async () => {
      const app = createTestApp({ id: adminUser.id, isAdmin: true });
      const res = await app.request(
        `/api/v1/admin/equipment/delete-requests/${crypto.randomUUID()}/approve`,
        { method: 'POST' },
      );
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Delete request not found');
    });
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/admin/equipment/delete-requests/:id/reject
// ---------------------------------------------------------------------------
describe(
  'POST /api/v1/admin/equipment/delete-requests/:id/reject',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    let adminUser: typeof users.$inferSelect;
    let requester: typeof users.$inferSelect;
    let equip: typeof equipment.$inferSelect;
    let request: typeof equipmentDeleteRequests.$inferSelect;

    beforeAll(async () => {
      adminUser = await insertUser('adm-edrrej', true);
      requester = await insertUser('adm-edrrejreq');
      equip = await insertEquipment('edrrej');
      request = await insertDeleteRequest(equip.id, requester.id);
    });

    afterEach(() => {
      restoreDeps();
    });

    afterAll(async () => {
      restoreDeps();
      await cleanupEquipment([request.id], [equip.id]);
      await cleanupUsers([adminUser.id, requester.id]);
    });

    it('should reject a delete request', async () => {
      const app = createTestApp({ id: adminUser.id, isAdmin: true });
      const res = await app.request(
        `/api/v1/admin/equipment/delete-requests/${request.id}/reject`,
        { method: 'POST' },
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(request.id);
      expect(body.data.status).toBe('rejected');
    });

    it('should return 404 NOT_FOUND for a non-existent request', async () => {
      const app = createTestApp({ id: adminUser.id, isAdmin: true });
      const res = await app.request(
        `/api/v1/admin/equipment/delete-requests/${crypto.randomUUID()}/reject`,
        { method: 'POST' },
      );
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Delete request not found');
    });
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/admin/reports
//
// Read-only list route — no fixtures required (shape + validation surface only).
// ---------------------------------------------------------------------------
describe(
  'GET /api/v1/admin/reports',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    afterEach(() => {
      restoreDeps();
    });

    const getReports = (query = '') => {
      const app = createTestApp({ id: crypto.randomUUID(), isAdmin: true });
      return app.request(`/api/v1/admin/reports${query}`);
    };

    it('should return a paginated list with default pagination when no query params', async () => {
      const res = await getReports();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta.pagination).toBeDefined();
    });

    it('should accept an entityType query param', async () => {
      const res = await getReports('?entityType=recipe');
      expect(res.status).toBe(200);
    });

    it('should accept each valid ReportStatus value', async () => {
      for (const status of ['pending', 'reviewed', 'resolved', 'dismissed']) {
        const res = await getReports(`?status=${status}`);
        expect(res.status).toBe(200);
      }
    });

    it('should reject a status outside the ReportStatus enum', async () => {
      const res = await getReports('?status=invalid');
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should reject an empty-string status', async () => {
      const res = await getReports('?status=');
      expect(res.status).toBe(400);
    });

    it('should accept combined status and entityType query params', async () => {
      const res = await getReports('?status=pending&entityType=comment');
      expect(res.status).toBe(200);
    });

    it('should reject a non-positive page', async () => {
      const res = await getReports('?page=0');
      expect(res.status).toBe(400);
    });

    it('should reject a perPage above 100', async () => {
      const res = await getReports('?perPage=101');
      expect(res.status).toBe(400);
    });
  },
);
