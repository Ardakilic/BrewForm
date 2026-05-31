# D19 — Admin Coffee Variety Soft-Delete Inconsistency

**Severity:** Medium  
**Status:** Open  
**File:** `apps/api/src/modules/admin/model.ts:601-606`

---

## Issue Description

The `deleteCoffeeVariety()` function in the admin model performs a soft-delete by setting `deletedAt` but does **not** check `isNull(deletedAt)` in the WHERE clause. This means the function can "re-delete" an already-deleted record, updating `updatedAt` and `deletedAt` again on a row that was already soft-deleted.

This is inconsistent with every other soft-delete in the codebase, which all guard against double-deletion.

---

## Impact

- **Data integrity:** Admin can soft-delete an already-deleted variety, silently "touching" the record without any error. This could mask bugs in UI logic (e.g., showing deleted varieties in admin lists).
- **Audit trail pollution:** `updatedAt` is overwritten, losing the original deletion timestamp's accuracy.
- **Low user impact:** Only affects admin users, but violates the contract that soft-delete is idempotent.

---

## Root Cause

The `deleteCoffeeVariety` function was implemented without the `isNull(deletedAt)` guard that all other soft-delete functions use. Likely a copy-paste omission during initial implementation.

---

## Affected Files

| File | Lines | Description |
|------|-------|-------------|
| `apps/api/src/modules/admin/model.ts` | 601-606 | `deleteCoffeeVariety()` — missing null check |

---

## Existing Pattern (Reference)

All other soft-delete functions in the codebase follow this pattern:

```typescript
// Example: updateCoffeeVariety (line 596-601)
export async function updateCoffeeVariety(id: string, data: Partial<...>) {
  const [result] = await db.update(coffeeVarieties)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(coffeeVarieties.id, id), isNull(coffeeVarieties.deletedAt)))  // ✓ guard
    .returning();
  return result ?? null;
}

// Current: deleteCoffeeVariety (line 601-606) — MISSING guard
export async function deleteCoffeeVariety(id: string) {
  const [result] = await db.update(coffeeVarieties)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(coffeeVarieties.id, id))  // ✗ no isNull check
    .returning();
  return result ?? null;
}
```

---

## Fix Approach

Add `isNull(coffeeVarieties.deletedAt)` to the WHERE clause using `and()`, matching the pattern used by `updateCoffeeVariety` and all other soft-delete functions.

### Drizzle ORM Reference

From Context7 (`/drizzle-team/drizzle-orm-docs`):

```typescript
import { and, eq, isNull } from 'drizzle-orm';

// Correct pattern:
.where(and(eq(coffeeVarieties.id, id), isNull(coffeeVarieties.deletedAt)))
```

---

## Implementation Steps

1. **Read** `apps/api/src/modules/admin/model.ts` — confirm current `deleteCoffeeVariety` implementation (lines 601-606).
2. **Compare** with `updateCoffeeVariety` (lines 596-601) and other soft-delete functions in the codebase to confirm the pattern.
3. **Edit** `deleteCoffeeVariety` — change the WHERE clause from:
   ```typescript
   .where(eq(coffeeVarieties.id, id))
   ```
   to:
   ```typescript
   .where(and(eq(coffeeVarieties.id, id), isNull(coffeeVarieties.deletedAt)))
   ```
4. **Add import** for `and` if not already imported (check top of file — `and` is likely already imported from `drizzle-orm`).
5. **Add test** for double-deletion prevention:
   - Create a variety, soft-delete it, attempt second delete → should return `null`.
   - Verify `updatedAt` is NOT changed on second delete.
6. **Run** `make check-api` — type-check passes.
7. **Run** `make test` — all tests pass.

---

## Testing Strategy

| Test | Expected |
|------|----------|
| Delete an active variety | Returns the variety with `deletedAt` set |
| Delete an already-deleted variety | Returns `null` (no update) |
| Verify `updatedAt` unchanged on double-delete | Timestamp matches original deletion |
| Update a deleted variety (regression) | Returns `null` (already guarded) |

---

## Risk Assessment

**Risk: Low**

- One-line fix with clear existing pattern to follow.
- No schema changes required.
- Only affects admin module.
- Test coverage is straightforward.

---

## Dependencies

- None. This is a standalone fix.
