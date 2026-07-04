# D41 — Admin User Mutations Missing Soft-Delete Guard

**Severity:** High (correctness / data integrity)
**Status:** Open (2026-07-04)
**Relationship:** Extends [`D19-admin-soft-delete-fix.md`](D19-admin-soft-delete-fix.md) (resolved 2026-06-09). D19 added `isNull(deletedAt)` guards and double-delete idempotency to the admin **soft-delete** functions (`deleteEquipment`, `deleteVendor`, `deleteCoffeeVariety`, the approve-request inner delete) — but the admin **user-state mutations** were never audited and have the same class of bug.

---

## Problem

Three admin user mutations in `apps/api/src/modules/admin/model.ts` update by `eq(users.id, userId)` alone, with no `isNull(users.deletedAt)` guard (verified 2026-07-04):

```typescript
// apps/api/src/modules/admin/model.ts:98-102
export async function banUser(userId: string) {
  const [result] = await db.update(users).set({ isBanned: true }).where(eq(users.id, userId))
    .returning();
  return result ?? null;
}

// apps/api/src/modules/admin/model.ts:105-109
export async function unbanUser(userId: string) {
  const [result] = await db.update(users).set({ isBanned: false }).where(eq(users.id, userId))
    .returning();
  return result ?? null;
}

// apps/api/src/modules/admin/model.ts:112-115
export async function setUserAdminRole(userId: string, isAdmin: boolean) {
  const [result] = await db.update(users).set({ isAdmin }).where(eq(users.id, userId)).returning();
  return result ?? null;
}
```

Contrast with the correct pattern already in the same file:

```typescript
// apps/api/src/modules/admin/model.ts:198-204
export async function softDeleteUser(userId: string) {
  const [result] = await db.update(users).set({ deletedAt: new Date() }).where(
    and(eq(users.id, userId), isNull(users.deletedAt)),
  ).returning();
  return result ?? null;
}
```

### Impact

- **Soft-deleted users can be mutated**: an admin can ban, unban, or grant/revoke admin on a user whose account was deleted. The API returns the mutated row as if the operation were meaningful, so the admin UI reports success.
- **Privilege-escalation edge**: `setUserAdminRole(userId, true)` on a soft-deleted user creates a deleted-but-admin row. Any future account-restore path (or a query that forgets its own `deletedAt` filter) would resurrect the account **with admin rights** granted while it was invisible to normal listings.
- **Audit-log noise**: the admin service writes audit entries for these actions; entries against deleted users are confusing during moderation review.
- **Inconsistency**: every soft-delete in this file now guards on `isNull(deletedAt)` (D19), and callers expect `null` to mean "no such active user" — these three functions break that contract.

---

## Proposed Fix

1. Add the guard to all three functions, matching `softDeleteUser`'s pattern:
   ```typescript
   .where(and(eq(users.id, userId), isNull(users.deletedAt)))
   ```
   `and` and `isNull` are already imported in this file.
2. Returning `null` for a soft-deleted target flows through the existing "not found" handling in `admin/service.ts` / `admin/index.ts` (same contract as `softDeleteUser`) — verify the route layer maps the `null` to a 404 with the standard envelope, and that no caller treated a non-null return from these functions as unconditional.
3. Sweep the rest of `admin/model.ts` for any other `db.update(...)` on soft-deletable tables missing the guard (e.g. user-profile edit helpers, `updateRecipeVisibility`) and fix in the same change — this plan's review checklist, not open-ended scope.
4. Update docblocks on the three functions to state the active-row precondition.
5. Run `make ci`.

---

## Files to Change

| File | Change |
|------|--------|
| `apps/api/src/modules/admin/model.ts` | Add `and(eq(...), isNull(users.deletedAt))` to `banUser` (:98), `unbanUser` (:105), `setUserAdminRole` (:112); docblocks; sweep for siblings |
| `apps/api/src/modules/admin/model.test.ts` | New test blocks (see below) |
| `apps/api/src/modules/admin/service.ts` / `index.ts` | Only if the 404 mapping for a `null` return needs adjustment (verify, likely no change) |

---

## Test Plan

Mirror the structure D19 established in `apps/api/src/modules/admin/model.test.ts` (its soft-delete blocks assert `deletedAt` set, `null` on repeat, and no overwrite of the original timestamp). Add per function:

- **banUser**
  - bans an active user: returns row with `isBanned: true`.
  - returns `null` for a soft-deleted user, and the row's `isBanned` value is unchanged in the DB.
- **unbanUser**
  - unbans an active banned user.
  - returns `null` for a soft-deleted (banned) user; `isBanned` stays `true` in the DB.
- **setUserAdminRole**
  - grants and revokes admin on an active user.
  - returns `null` for a soft-deleted user; `isAdmin` unchanged in the DB — the privilege-escalation case (`isAdmin: true` on deleted user) explicitly asserted as blocked.
- **Route-level (optional but preferred)**: `POST` ban / role endpoints against a soft-deleted user id return 404 with the standard error envelope.

---

## Acceptance Criteria

- [ ] All three functions include `isNull(users.deletedAt)` in their WHERE clause and return `null` for soft-deleted targets.
- [ ] Model tests cover the active-user and soft-deleted-user paths for each function, including the admin-grant-on-deleted-user case.
- [ ] Admin API returns 404 (not success) when targeting a soft-deleted user.
- [ ] Sweep of `admin/model.ts` for sibling unguarded updates completed and noted in the change.
- [ ] `make ci` passes.

---

## Effort Estimate

**Low** — ~2 hours. Three one-line WHERE-clause changes plus tests; the test scaffolding (user fixtures, soft-delete setup) already exists in `admin/model.test.ts`.
