## Context

The admin module at `apps/api/src/modules/admin/` follows the project's
standard 3-layer pattern: `model.ts` (data access) → `service.ts` (business
logic) → `index.ts` (HTTP controller). It aggregates admin operations across
multiple domain entities (coffee varieties, equipment, vendors, users, recipes,
reports, etc.) under the authenticated `/api/v1/admin/*` route prefix.

The soft-delete convention across the entire codebase is:

```
WHERE eq(table.id, id) AND isNull(table.deletedAt)
```

All 8 non-admin modules (`bean`, `coffee-variety`, `comment`, `equipment`,
`photo`, `recipe`, `taste`, `vendor`) and the two correct admin soft-deletes
(`softDeleteUser`, `softDeleteRecipe`) follow this pattern. The four broken
functions are the only exceptions. Adding the guard makes them consistent.

### Architecture diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         REQUEST FLOW                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  DELETE /api/v1/admin/equipment/:id                                 │
│  DELETE /api/v1/admin/vendors/:id                                   │
│  DELETE /api/v1/admin/coffee-varieties/:id                          │
│  POST   /api/v1/admin/equipment/delete-requests/:id/approve          │
│       │                                                             │
│       ▼                                                             │
│  ┌──────────────┐                                                    │
│  │  index.ts    │  Controller — no try/catch on these routes         │
│  │  (controller)│  Passes userId + id to service                     │
│  └──────┬───────┘                                                    │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────┐                                                    │
│  │  service.ts  │  Business logic                                    │
│  │  (service)   │  • Calls model.deleteXxx(id)                       │
│  │              │  • Checks result (variety only)                     │
│  │              │  • Creates audit log                                │
│  └──────┬───────┘                                                    │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────┐                                                    │
│  │  model.ts    │  Data access                                       │
│  │  (model)     │  UPDATE table SET deletedAt = now()                │
│  │              │  WHERE id = $1                                     │
│  │              │  ❌ Missing: AND deletedAt IS NULL                  │
│  └──────┬───────┘                                                    │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────┐                                                    │
│  │  PostgreSQL  │  Table: equipment / vendors / coffeeVarieties       │
│  └──────────────┘                                                    │
│                                                                     │
│  Error path (coffee variety only):                                  │
│     model returns null → service throws COFFEE_VARIETY_NOT_FOUND     │
│     → global errorHandler → 500 INTERNAL_ERROR                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Codebase facts (verified at 2c8f0ab on `main`)

- `apps/api/src/modules/admin/model.ts:30` imports `and, eq, isNull` from
  `drizzle-orm` — no import changes needed.
- `deleteEquipment` (L293-299), `deleteVendor` (L336-341),
  `deleteCoffeeVariety` (L603-609), and `approveEquipmentDeleteRequest`
  inner update (L667-669) all use `eq(table.id, id)` without `isNull`.
- `softDeleteUser` (L197-204) and `softDeleteRecipe` (L237-243) in the same
  file correctly use `and(eq(...), isNull(...))`.
- `updateCoffeeVariety` (L592-601) also correctly uses the guard.
- `deleteCoffeeVariety` (L603) has no JSDoc; `deleteEquipment` (L293) and
  `deleteVendor` (L336) do.
- `admin/service.ts:deleteEquipment` (L260-266) and `deleteVendor` (L307-313)
  call `model.createAuditLog()` unconditionally — no result check.
- `admin/service.ts:deleteCoffeeVariety` (L633-640) checks
  `if (!variety) throw new Error('COFFEE_VARIETY_NOT_FOUND')` — result check
  exists.
- `middleware/errorHandler.ts` has no handler for
  `COFFEE_VARIETY_NOT_FOUND` — it falls through to the 500 fallback.
- No `apps/api/src/modules/admin/model.test.ts` exists.

### Stakeholders

- **API (`apps/api/`)** — all code changes live here.
- **DB package, Shared package, Frontend** — unaffected.
- **Admin users** — only the admin panel calls these endpoints; regular users
  are unaffected.

## Goals / Non-Goals

**Goals:**

- Make all four soft-delete operations in `admin/model.ts` idempotent by
  adding the `isNull(deletedAt)` guard.
- Prevent spurious audit log entries for `deleteEquipment`/`deleteVendor`
  when the entity was already soft-deleted.
- Return HTTP 404 for `COFFEE_VARIETY_NOT_FOUND` instead of 500.
- Add JSDoc to `deleteCoffeeVariety` for documentation consistency.
- Write integration tests covering all four fixed functions.
- Pass `make check-api`, `make lint`, and `make test` with zero regressions.

**Non-Goals:**

- Fixing `user/model.ts:deleteUser` (same bug, different module) — separate
  follow-up.
- Adding per-route try-catch in the admin controller for coffee variety
  operations (central error handling is sufficient).
- Changing any other admin delete routes (taste notes, compatibility, recipes)
  — those delegate to non-admin modules that already have the guard.
- Schema changes, migrations, or shared-package changes.

## Decisions

### Decision 1: WHERE clause pattern — use `and(eq(id), isNull(deletedAt))`

This is the established pattern used by every other soft-delete in the
codebase. Consistency is the primary rationale. The guard ensures that a
`db.update().set({ deletedAt }).where(...)` matches zero rows when the
entity is already soft-deleted, causing `returning()` to yield an empty
array and `result ?? null` to return `null`.

```typescript
// Before (broken — can re-delete)
const [result] = await db.update(equipment).set({ deletedAt: new Date() })
  .where(eq(equipment.id, id)).returning();

// After (fixed — idempotent)
const [result] = await db.update(equipment).set({ deletedAt: new Date() })
  .where(and(eq(equipment.id, id), isNull(equipment.deletedAt))).returning();
```

All three standalone delete functions plus the `approveEquipmentDeleteRequest`
inner transaction update get this change.

### Decision 2: Guard audit logs in the service layer, not the model

The model layer returns `null` when the guard blocks an update. The service
layer already has access to this return value. Guarding audit log creation
there means:

- The model stays "dumb" (pure data access, returns what the DB says).
- The service, which already owns the business decision "should I audit
  this?", uses the model's return value to decide.
- No new cross-layer contract needed.

```typescript
// Before (service.ts:deleteEquipment)
await model.deleteEquipment(id);
await model.createAuditLog(adminId, 'DELETE_EQUIPMENT', 'Equipment', id);

// After
const result = await model.deleteEquipment(id);
if (result) {
  await model.createAuditLog(adminId, 'DELETE_EQUIPMENT', 'Equipment', id);
}
logger.debug({ adminId, id, didDelete: !!result }, 'deleteEquipment completed');
```

### Decision 3: Map COFFEE_VARIETY_NOT_FOUND in the global error handler

Two options were considered:

1. Add a try-catch in the admin controller for the coffee variety delete route
   (follows the pattern used by user delete, report resolve/dismiss routes).
2. Add a mapping in `middleware/errorHandler.ts`.

Option 2 was chosen because:
- It is centralized — any future route that throws
  `'COFFEE_VARIETY_NOT_FOUND'` gets correct 404 behaviour automatically.
- The error handler already maps specific error types (`EQUIPMENT_INCOMPATIBLE`
  → 422, `PostgresError` code `23505` → 409, `ZodError` → 400, JWT errors →
  401). Adding a message-based mapping for `NOT_FOUND` errors follows the same
  "categorize centrally" philosophy.
- The service-level error message is a stable contract string.

```typescript
// Added to middleware/errorHandler.ts, before the 500 fallback:
if (err instanceof Error && err.message === 'COFFEE_VARIETY_NOT_FOUND') {
  return c.json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Coffee variety not found' },
  }, 404);
}
```

### Decision 4: Fix approveEquipmentDeleteRequest inner update

The `approveEquipmentDeleteRequest` function runs inside a Drizzle transaction:

```typescript
export async function approveEquipmentDeleteRequest(id: string, adminId: string) {
  return await db.transaction(async (tx) => {
    // 1. Update request status to 'approved'
    const [request] = await tx.update(equipmentDeleteRequests)
      .set({ status: 'approved', reviewedById: adminId, reviewedAt: new Date() })
      .where(eq(equipmentDeleteRequests.id, id))
      .returning();
    if (!request) return null;

    // 2. Soft-delete the equipment
    await tx.update(equipment)           // ← add isNull guard here
      .set({ deletedAt: new Date() })
      .where(eq(equipment.id, request.equipmentId));

    return request;
  });
}
```

Adding `isNull(equipment.deletedAt)` to the inner update at step 2 prevents
overwriting `deletedAt` if the equipment was already independently
soft-deleted via `deleteEquipment`. The request status is still updated
correctly (step 1 succeeds independently). This is a defensive guard — the
transaction already enforces workflow ordering via the request status, but
the guard is cheap and consistent.

### Decision 5: Transaction semantics for approveEquipmentDeleteRequest

The inner `tx.update(equipment)` inside `approveEquipmentDeleteRequest` does
NOT use `.returning()` — it is a fire-and-forget UPDATE. When the `isNull`
guard blocks the update (0 rows matched), Drizzle does NOT throw. It returns
`[]` from `.returning()` if used, but since `.returning()` is absent, it
returns the number of affected rows (0) silently. The transaction proceeds
normally, and the function returns `request` (the approved request record from
step 1). This is correct: the approval workflow is completed, and the
equipment's pre-existing `deletedAt` is preserved.

### Decision 6: Test strategy — integration tests against real DB

The new `admin/model.test.ts` follows the pattern established by
`apps/api/src/modules/coffee-variety/model.test.ts`:

- `sanitizeOps: false, sanitizeResources: false` (needed for DB access).
- `beforeEach` creates real rows in `users`, `equipment`, `vendors`, and
  `coffeeVarieties` tables.
- `afterEach` cleans up by hard-deleting test rows.
- Each test calls the model function directly and asserts the return value
  and side effects.

Tests are organized into four `describe` blocks with a total of 12 `it` cases:

| Block | Tests |
|-------|-------|
| `deleteEquipment` | Active delete → returns with `deletedAt` set; double-delete → returns `null`; verify `deletedAt` preserved on double-delete |
| `deleteVendor` | Active delete → returns with `deletedAt` set; double-delete → returns `null`; verify `deletedAt` preserved on double-delete |
| `deleteCoffeeVariety` | Active delete → returns with `deletedAt`/`updatedAt` set; double-delete → returns `null`; verify `updatedAt` preserved on double-delete; **regression:** `updateCoffeeVariety` on deleted variety → `null` |
| `approveEquipmentDeleteRequest` | Approve pending request → equipment soft-deleted; pre-deleted equipment → `deletedAt` unchanged (guard prevents overwrite) |

All `describe()` blocks use `{ sanitizeOps: false, sanitizeResources: false }`.
`afterEach` hard-deletes test rows in dependency order (children before parents).

**Test fixture column requirements:**

| Table | Required columns | Type values |
|-------|-----------------|-------------|
| `users` | `id`, `email` (unique), `username` (unique), `passwordHash` | — |
| `equipment` | `id`, `name`, `type`, `createdBy`, `isSystem` | `type`: `'grinder'` (any `equipmentTypeEnum` value) |
| `vendors` | `id`, `name`, `createdBy` | — |
| `coffeeVarieties` | `id`, `name`, `category`, `isSystem`, `createdBy` | `category`: `'variety'` |
| `equipmentDeleteRequests` | `id`, `equipmentId`, `requestedById`, `status` | `status`: `'pending'` |

## Risks / Trade-offs

- **Risk: Low.** Four one-line WHERE clause additions in one file, two
  conditional wraps in the service, one error-handler entry, and a new test
  file. The pattern is already proven by every other module.
- **Behavioral change for `deleteCoffeeVariety`:** Previously, deleting an
  already-deleted variety would silently overwrite `deletedAt`/`updatedAt` and
  return 200. After the fix, it returns 404. This is correct behaviour — the
  resource no longer exists.
- **Behavioral change for `deleteEquipment`/`deleteVendor`:** Previously, the
  service always created an audit log. After the fix, it only creates one when
  the entity was actually soft-deleted. This is correct behaviour — no
  operation, no audit entry.
- **No rollback concerns:** Each change is a single reversion in its file.
  No database state to undo.

## Migration Plan

No data migration, feature flag, or deploy sequencing needed.

1. Apply model.ts WHERE clause changes.
2. Apply service.ts audit log guards.
3. Apply errorHandler.ts 404 mapping.
4. Create and run model.test.ts.
5. Verify with `make check-api`, `make lint`, `make test`.
6. Create `pr_description.md`.

Rollback: `git revert` the merge commit.

## Open Questions

- None blocking. The `user/model.ts:deleteUser` fix is tracked as a separate
  follow-up plan.
