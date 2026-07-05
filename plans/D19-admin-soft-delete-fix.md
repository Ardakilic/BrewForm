# D19 — Admin Soft-Delete Missing `isNull` Guards (Equipment, Vendor, Coffee Variety)

> **Status (2026-07-04): ✅ Done** — `admin/model.ts` has `isNull(deletedAt)` guards at deleteEquipment (:296), deleteVendor (:339), deleteCoffeeVariety (:608), and the approve inner query (:671).

**Severity:** Medium  
**Status:** Implemented  
**File:** `apps/api/src/modules/admin/model.ts`

---

> **Validation note (2026-06-09):** The original plan targeted only `deleteCoffeeVariety` and
> claimed "every other soft-delete in the codebase guards against double-deletion." Both claims
> were incorrect after validation against the live `main` branch:
>
> - `deleteEquipment` (lines 294-299) and `deleteVendor` (lines 337-341) in the same file also
>   lack the `isNull` guard — they are added to this plan's scope.
> - All non-admin module soft-deletes (`bean`, `coffee-variety`, `comment`, `equipment`,
>   `photo`, `recipe`, `setup`, `taste`, `vendor` modules) correctly have the guard.
> - `user/model.ts:deleteUser` (line 68) also lacks the guard but is in a separate module and
>   is left as a separate follow-up plan.
> - Original line numbers for `deleteCoffeeVariety` were wrong (601-606 vs. actual 603-609);
>   corrected throughout.

---

## Issue Description

Four soft-delete operations in `apps/api/src/modules/admin/model.ts` perform a soft-delete by
setting `deletedAt` but did **not** include `isNull(deletedAt)` in the WHERE clause. This means
each operation could "re-delete" an already-deleted record, silently overwriting `updatedAt` (and
`deletedAt` for `deleteCoffeeVariety`) on a row that was already soft-deleted:

| Function / Operation | Lines | Table |
|---|---|---|
| `deleteEquipment` | 294-299 | `equipment` |
| `deleteVendor` | 337-341 | `vendors` |
| `deleteCoffeeVariety` | 603-609 | `coffeeVarieties` |
| Inner equipment update in `approveEquipmentDeleteRequest` | 669-672 | `equipment` |

This is inconsistent with every soft-delete in the non-admin modules and with the two admin
soft-deletes that do have the guard (`softDeleteUser` at line 199, `softDeleteRecipe` at
line 239).

---

## Impact

- **Data integrity:** An already-deleted record can be silently "re-touched" without any error.
  This can mask UI bugs (e.g. showing deleted records in admin lists) or cause spurious audit
  entries for `deleteCoffeeVariety`.
- **Audit trail pollution** (`deleteCoffeeVariety` only): `updatedAt` and `deletedAt` are
  overwritten, destroying the original deletion timestamp.
- **Service-layer behavior change for `deleteCoffeeVariety`:** After the fix the model will
  return `null` for an already-deleted variety. The service layer already checks this:
  ```typescript
  // admin/service.ts:638
  if (!variety) throw new Error('COFFEE_VARIETY_NOT_FOUND');
  ```
  The admin controller does not have a specific try/catch for `COFFEE_VARIETY_NOT_FOUND`, so
  it will currently fall through to the global `errorHandler` as a 500. This is still better
  than the current silent double-write, but correcting the admin controller to return 404 for
  this error code is a separate follow-up concern and out of scope here.
- **Transparent for `deleteEquipment` and `deleteVendor`:** The service layer calls both
  without inspecting the return value (`await model.deleteEquipment(id)`), so fixing the model
  is transparent at the HTTP level — the service just logs and continues.
- **`approveEquipmentDeleteRequest`:** The inner equipment soft-delete is idempotent — an
  already-deleted equipment record's `deletedAt` is no longer overwritten by the transaction.
- **Low user impact overall:** Only affects admin users, but violates the contract that
  soft-delete is idempotent.

---

## Root Cause

All three functions were implemented without the `isNull(deletedAt)` guard present in all
non-admin module soft-deletes. Likely copy-paste omissions during initial implementation.

---

## Affected Files

| File | Lines | Description |
|---|---|---|
| `apps/api/src/modules/admin/model.ts` | 294-299 | `deleteEquipment()` — missing `isNull` guard |
| `apps/api/src/modules/admin/model.ts` | 337-341 | `deleteVendor()` — missing `isNull` guard |
| `apps/api/src/modules/admin/model.ts` | 603-609 | `deleteCoffeeVariety()` — missing `isNull` guard |
| `apps/api/src/modules/admin/model.ts` | 669-672 | Inner `equipment` update in `approveEquipmentDeleteRequest()` — missing `isNull` guard |

**New file (test):**

| File | Description |
|---|---|
| `apps/api/src/modules/admin/model.test.ts` | New integration test file — does not currently exist |

---

## Out of Scope

- **`user/model.ts:deleteUser` (line 68):** Also lacks the `isNull` guard (`eq(users.id, id)`
  only). Same bug class, different module context (user self-deletion), own follow-up plan.


---

## Existing Pattern (Reference)

All non-admin soft-delete functions, and the two correct admin soft-deletes, follow this pattern:

```typescript
// ✅ Correct: softDeleteUser (admin/model.ts, line 199-204)
export async function softDeleteUser(userId: string) {
  const [result] = await db.update(users).set({ deletedAt: new Date() }).where(
    and(eq(users.id, userId), isNull(users.deletedAt)),  // guard present
  ).returning();
  return result ?? null;
}

// ✅ Correct: updateCoffeeVariety (admin/model.ts, lines 592-601) — also has the guard
export async function updateCoffeeVariety(id: string, data: Partial<...>) {
  const [result] = await db.update(coffeeVarieties)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(coffeeVarieties.id, id), isNull(coffeeVarieties.deletedAt)))  // guard present
    .returning();
  return result ?? null;
}
```

Current broken implementations — all four lack the guard:

```typescript
// ❌ deleteEquipment (admin/model.ts, lines 294-299)
export async function deleteEquipment(id: string) {
  const [result] = await db.update(equipment).set({ deletedAt: new Date() }).where(
    eq(equipment.id, id),  // no isNull check
  ).returning();
  return result ?? null;
}

// ❌ deleteVendor (admin/model.ts, lines 337-341)
export async function deleteVendor(id: string) {
  const [result] = await db.update(vendors).set({ deletedAt: new Date() }).where(
    eq(vendors.id, id),  // no isNull check
  ).returning();
  return result ?? null;
}

// ❌ deleteCoffeeVariety (admin/model.ts, lines 603-609)
export async function deleteCoffeeVariety(id: string) {
  const [result] = await db.update(coffeeVarieties)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(coffeeVarieties.id, id))  // no isNull check
    .returning();
  return result ?? null;
}
```

---

## Drizzle ORM Reference

From Context7 (`/drizzle-team/drizzle-orm-docs`), the correct multi-condition pattern is:

```typescript
import { and, eq, isNull } from 'drizzle-orm';

// Update with guard — only touches rows that are not already soft-deleted:
await db.update(someTable)
  .set({ deletedAt: new Date() })
  .where(and(eq(someTable.id, id), isNull(someTable.deletedAt)))
  .returning();
```

`and`, `eq`, and `isNull` are already imported at the top of `admin/model.ts` (line 30):

```typescript
import { and, asc, count, desc, eq, gte, isNull, like, ne, or, sql } from 'drizzle-orm';
```

No import changes are needed.

---

## Implementation Steps

1. **Read** `apps/api/src/modules/admin/model.ts` — confirm the four operations:
   - `deleteEquipment` at lines 294-299
   - `deleteVendor` at lines 337-341
   - `deleteCoffeeVariety` at lines 603-609
   - Inner `equipment` update in `approveEquipmentDeleteRequest` at lines 669-672

2. **Compare** with `softDeleteUser` (lines 197-204) and `updateCoffeeVariety` (lines 592-601)
   to confirm the guard pattern and that `and`/`isNull` are already imported.

3. **Edit `deleteEquipment`** — change the WHERE clause from:
   ```typescript
   .where(eq(equipment.id, id))
   ```
   to:
   ```typescript
   .where(and(eq(equipment.id, id), isNull(equipment.deletedAt)))
   ```

4. **Edit `deleteVendor`** — change the WHERE clause from:
   ```typescript
   .where(eq(vendors.id, id))
   ```
   to:
   ```typescript
   .where(and(eq(vendors.id, id), isNull(vendors.deletedAt)))
   ```

5. **Edit `deleteCoffeeVariety`** — change the WHERE clause from:
   ```typescript
   .where(eq(coffeeVarieties.id, id))
   ```
   to:
   ```typescript
   .where(and(eq(coffeeVarieties.id, id), isNull(coffeeVarieties.deletedAt)))
   ```

6. **Edit `approveEquipmentDeleteRequest`** — the inner `equipment` update (previously
   `tx.update(equipment).set({ deletedAt: new Date() }).where(eq(equipment.id, ...))`):
   add the `isNull` guard. The guard was already present after implementation, as confirmed
   in the codebase: the inner transaction now reads:
   ```typescript
   await tx.update(equipment)
     .set({ deletedAt: new Date() })
     .where(and(eq(equipment.id, request.equipmentId), isNull(equipment.deletedAt)));
   ```

7. **Create** `apps/api/src/modules/admin/model.test.ts` — there is no existing model test
   file for the admin module. Follow the same structure as
   `apps/api/src/modules/coffee-variety/model.test.ts`:

   ```typescript
   import '../../test-setup.ts';
   import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
   import { expect } from 'jsr:@std/expect';
   import { eq } from 'drizzle-orm';
   import { db } from '@brewform/db';
   import { coffeeVarieties, equipment, users, vendors } from '@brewform/db/schema';
   import * as model from './model.ts';
   ```

   Write integration tests for each of the three fixed functions (see **Testing Strategy**
   below). Each test case requires real DB rows created in `beforeEach` and cleaned up in
   `afterEach`.

7. **Run** `make check-api` — type-check must pass with no new errors.

8. **Run** `make test` — all tests must pass.

---

## Testing Strategy

All tests go in the new `apps/api/src/modules/admin/model.test.ts`.

### `deleteEquipment`

| Test | Expected |
|---|---|
| Delete an active equipment record | Returns the record with `deletedAt` set |
| Delete an already-deleted equipment record | Returns `null` (no update) |
| Verify `deletedAt` unchanged on double-delete | Timestamp matches first deletion |

### `deleteVendor`

| Test | Expected |
|---|---|
| Delete an active vendor | Returns the vendor with `deletedAt` set |
| Delete an already-deleted vendor | Returns `null` (no update) |
| Verify `deletedAt` unchanged on double-delete | Timestamp matches first deletion |

### `deleteCoffeeVariety`

| Test | Expected |
|---|---|
| Delete an active variety | Returns the variety with `deletedAt` and `updatedAt` set |
| Delete an already-deleted variety | Returns `null` (no update) |
| Verify `updatedAt` unchanged on double-delete | Timestamp matches original deletion |
| Update a deleted variety (regression) | Returns `null` (already guarded in `updateCoffeeVariety`) |

### Example test skeleton (coffee variety — adapt for equipment and vendor)

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
  });

  it('should return null when deleting an already-deleted variety', async () => {
    await model.deleteCoffeeVariety(varietyId);
    const second = await model.deleteCoffeeVariety(varietyId);
    expect(second).toBeNull();
  });

  it('should not overwrite updatedAt on double-delete', async () => {
    const first = await model.deleteCoffeeVariety(varietyId);
    const firstUpdatedAt = first!.updatedAt.getTime();
    // Small delay to ensure clock would advance if the row were touched again
    await new Promise((r) => setTimeout(r, 10));
    await model.deleteCoffeeVariety(varietyId);
    // Re-read from DB
    const [row] = await db.select().from(coffeeVarieties)
      .where(eq(coffeeVarieties.id, varietyId));
    expect(row.updatedAt.getTime()).toBe(firstUpdatedAt);
  });
});
```

---

## Risk Assessment

**Risk: Low**

- Four identical one-line WHERE clause changes within the same file:
  1. `deleteEquipment` (line 296)
  2. `deleteVendor` (line 339)
  3. `deleteCoffeeVariety` (line 608)
  4. Inner `equipment` update in `approveEquipmentDeleteRequest` (line 671)
- No schema changes required.
- `and` and `isNull` are already imported.
- All four changes are pattern-identical to the existing correct soft-deletes in the file.
- Only affects the admin module.
- The one behavioral change at the HTTP level (`deleteCoffeeVariety` → 500 instead of 200 on
  double-delete) is an improvement; a follow-up plan can add a 404 handler in the admin
  controller for `COFFEE_VARIETY_NOT_FOUND` if desired.

---

## Dependencies

- None. Standalone fix within a single file.
- No schema migrations, no shared package changes, no frontend changes.