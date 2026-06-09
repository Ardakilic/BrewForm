## 1. Fix `deleteEquipment` in admin/model.ts

- [x] 1.1 Open `apps/api/src/modules/admin/model.ts` and locate the
  `deleteEquipment` function (lines 293-299). The current WHERE clause is:

  ```typescript
  .where(eq(equipment.id, id))
  ```

  Replace with:

  ```typescript
  .where(and(eq(equipment.id, id), isNull(equipment.deletedAt)))
  ```

  `and` and `isNull` are already imported at line 30; no import changes needed.

- [x] 1.2 Run `make check-api` — must pass with zero new errors.

## 2. Fix `deleteVendor` in admin/model.ts

- [x] 2.1 Locate the `deleteVendor` function (lines 336-341). The current
  WHERE clause is:

  ```typescript
  .where(eq(vendors.id, id))
  ```

  Replace with:

  ```typescript
  .where(and(eq(vendors.id, id), isNull(vendors.deletedAt)))
  ```

- [x] 2.2 Run `make check-api` — must pass.

## 3. Fix `deleteCoffeeVariety` in admin/model.ts

- [x] 3.1 Locate the `deleteCoffeeVariety` function (lines 603-609). The
  current WHERE clause is:

  ```typescript
  .where(eq(coffeeVarieties.id, id))
  ```

  Replace with:

  ```typescript
  .where(and(eq(coffeeVarieties.id, id), isNull(coffeeVarieties.deletedAt)))
  ```

- [x] 3.2 Add a JSDoc block above the function for consistency with
  `deleteEquipment` and `deleteVendor`:

  ```typescript
  /** Soft-delete a coffee variety by setting `deletedAt`. Returns the updated variety or null. */
  export async function deleteCoffeeVariety(id: string) {
  ```

- [x] 3.3 Run `make check-api` — must pass.

## 4. Fix `approveEquipmentDeleteRequest` inner update in admin/model.ts

- [x] 4.1 Locate the `approveEquipmentDeleteRequest` function (lines 659-673).
  The inner equipment update at lines 667-669 is:

  ```typescript
  await tx.update(equipment)
    .set({ deletedAt: new Date() })
    .where(eq(equipment.id, request.equipmentId));
  ```

  Replace with:

  ```typescript
  await tx.update(equipment)
    .set({ deletedAt: new Date() })
    .where(and(eq(equipment.id, request.equipmentId), isNull(equipment.deletedAt)));
  ```

- [x] 4.2 Run `make check-api` — must pass.

## 5. Guard audit log creation in admin/service.ts

- [x] 5.1 Locate the `deleteEquipment` service function (lines 260-266).
  The current implementation unconditionally calls `createAuditLog`:

  ```typescript
  export async function deleteEquipment(adminId: string, id: string) {
    logger.debug({ adminId, id }, 'deleteEquipment started');
    await model.deleteEquipment(id);
    await model.createAuditLog(adminId, 'DELETE_EQUIPMENT', 'Equipment', id);
    logger.debug({ adminId, id }, 'deleteEquipment completed');
  }
  ```

  Replace with:

  ```typescript
  export async function deleteEquipment(adminId: string, id: string) {
    logger.debug({ adminId, id }, 'deleteEquipment started');
    const result = await model.deleteEquipment(id);
    if (result) {
      await model.createAuditLog(adminId, 'DELETE_EQUIPMENT', 'Equipment', id);
    }
    logger.debug({ adminId, id, didDelete: !!result }, 'deleteEquipment completed');
  }
  ```

- [x] 5.2 Locate the `deleteVendor` service function (lines 307-313). Apply
  the same pattern:

  ```typescript
  export async function deleteVendor(adminId: string, id: string) {
    logger.debug({ adminId, id }, 'deleteVendor started');
    const result = await model.deleteVendor(id);
    if (result) {
      await model.createAuditLog(adminId, 'DELETE_VENDOR', 'Vendor', id);
    }
    logger.debug({ adminId, id, didDelete: !!result }, 'deleteVendor completed');
  }
  ```

- [x] 5.3 Run `make check-api` — must pass.

## 6. Add COFFEE_VARIETY_NOT_FOUND → 404 mapping in errorHandler

- [x] 6.1 Open `apps/api/src/middleware/errorHandler.ts` and locate the
  fallback 500 handler at the bottom of the `errorHandler` function (before
  the final `return c.json({...}, 500)`).

  Add the following block just before the 500 fallback:

  ```typescript
  // Known not-found error messages from service layer
  if (err instanceof Error && err.message === 'COFFEE_VARIETY_NOT_FOUND') {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Coffee variety not found' },
    }, 404);
  }
  ```

  This follows the existing pattern of the function: specific error checks
  before the generic 500 fallback. The `err.message === '...'` check is
  narrow and intentional — only this exact service-layer error string
  triggers the 404.

- [x] 6.2 Run `make check-api` and `make lint` — must pass.

## 7. Create integration test file: admin/model.test.ts

- [x] 7.1 Create `apps/api/src/modules/admin/model.test.ts` with the standard
  header matching the convention from `coffee-variety/model.test.ts`:

  ```typescript
  // deno-lint-ignore-file no-explicit-any require-await

  import '../../test-setup.ts';
  import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
  import { expect } from 'jsr:@std/expect';
  import { eq } from 'drizzle-orm';
  import { db } from '@brewform/db';
  import { coffeeVarieties, equipment, equipmentDeleteRequests, users, vendors } from '@brewform/db/schema';
  import * as model from './model.ts';
  ```

  All `describe()` blocks MUST include `{ sanitizeOps: false, sanitizeResources: false }`
  as the second argument (same as `coffee-variety/model.test.ts`). This is required
  because Deno tests with `--allow-all` need to opt out of IO sanitization.

  **Table column reference for test inserts:**

  | Table | Required columns | Optional columns |
  |-------|-----------------|------------------|
  | `users` | `id`, `email` (unique), `username` (unique), `passwordHash` | — |
  | `equipment` | `id`, `name`, `type` (string from `equipmentTypeEnum`, e.g. `'grinder'`), `createdBy`, `isSystem: false` | `brand`, `model`, `description` |
  | `vendors` | `id`, `name`, `createdBy` | `website`, `description` |
  | `coffeeVarieties` | `id`, `name`, `category` (e.g. `'variety'`), `isSystem: false`, `createdBy` | `species`, `description` |
  | `equipmentDeleteRequests` | `id`, `equipmentId`, `requestedById`, `status` (one of: `'pending'`, `'approved'`, `'rejected'`) | `reason`, `reviewedById`, `reviewedAt` |

  Equipment type valid values (from `equipmentTypeEnum`): `'grinder'`, `'espresso_machine'`,
  `'pour_over_brewer'`, `'immersion_brewer'`, `'kettle'`, `'milk_tool'`,
  `'scale_accessory'`, `'roaster'`, `'portafilter'`, `'basket'`, `'puck_screen'`,
  `'paper_filter'`, `'tamper'`, `'mesh_filter'`, `'cezve'`, `'thermometer'`, `'other'`.

  **IMPORTANT:** All `afterEach` cleanups MUST hard-delete test rows with
  `db.delete(table).where(eq(table.id, uuid))`. Because tests insert rows directly
  into tables (bypassing the soft-delete pattern), hard-delete is the correct cleanup
  strategy. Cleanup order MUST be: child rows first, then parent rows last
  (e.g., delete equipment/variety/vendor → then delete user).

  **DO NOT use `db.insert().returning()` in `beforeEach`** — use
  `await db.insert(table).values({...})` without `.returning()` since we
  don't need the inserted row in the test setup.

- [x] 7.2 **Add `describe('deleteEquipment', ...)` block** with full test implementations:

  ```typescript
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
  ```

- [x] 7.3 **Add `describe('deleteVendor', ...)` block** with full test implementations.
  Follow the identical pattern from 7.2 but with `vendors` table:

  ```typescript
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
  ```

- [x] 7.4 **Add `describe('deleteCoffeeVariety', ...)` block** with full test implementations.
  Note: `deleteCoffeeVariety` also sets `updatedAt` alongside `deletedAt`, so
  the timestamp preservation test asserts `updatedAt` is preserved.

  ```typescript
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
      const [row] = await db.select().from(coffeeVarieties).where(eq(coffeeVarieties.id, varietyId));
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
  ```

  The last test is a **regression test**: it verifies that the existing guard on
  `updateCoffeeVariety` (which already uses `isNull(coffeeVarieties.deletedAt)`)
  continues to work — it should return `null` when trying to update a soft-deleted
  variety. This test guards against accidentally removing that existing guard
  during this change.

- [x] 7.5 **Add `describe('approveEquipmentDeleteRequest guard', ...)` block** with full
  test implementations:

  ```typescript
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
  ```

- [x] 7.6 Run `make test-specific filter=apps/api/src/modules/admin/model.test.ts` —
  all tests must pass. If any test fails because of schema column mismatches
  (e.g., `equipment` requires fields not listed above), consult the Drizzle
  schema at `packages/db/src/schema.ts` to identify required NOT NULL columns
  without defaults, then add them to the test fixture.

## 8. Final verification and PR description

- [x] 8.1 Run `make check-api` — zero type errors across all workspaces.

- [x] 8.2 Run `make lint` — zero warnings on all changed files:
  `apps/api/src/modules/admin/model.ts`,
  `apps/api/src/modules/admin/service.ts`,
  `apps/api/src/middleware/errorHandler.ts`,
  `apps/api/src/modules/admin/model.test.ts`.

- [x] 8.3 Run `make test` — all tests pass, including the new admin model
  tests and zero regressions in existing tests.

- [x] 8.4 Create `pr_description.md` at the project root
  (`/pr_description.md`). The file should be created **from scratch** (the
  existing `pr_description.md` is from D18 and unrelated). Content should
  follow the established format from D18:
  - `## Problem` section describing the bug
  - `## Solution` section with a table of what changed
  - `## What did NOT change` section for scope clarity
  - `## Testing` section listing test coverage
  - `## Risk` section

- [x] 8.5 Confirm the `user/model.ts:deleteUser` fix remains tracked as a
  separate follow-up. Do NOT touch `apps/api/src/modules/user/model.ts`
  in this change.
