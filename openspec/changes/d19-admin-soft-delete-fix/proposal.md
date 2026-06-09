## Why

Three soft-delete functions in `apps/api/src/modules/admin/model.ts` — plus one
inner-transaction update in `approveEquipmentDeleteRequest` — perform a
soft-delete by setting `deletedAt` but omit the `isNull(deletedAt)` guard from the
WHERE clause. This means an already-deleted record can be "re-deleted", silently
overwriting `updatedAt` and `deletedAt` on rows that were already soft-deleted.

| Function | Table | Impact of missing guard |
|---|---|---|
| `deleteEquipment` | `equipment` | Overwrites `updatedAt` and `deletedAt` on double-delete |
| `deleteVendor` | `vendors` | Overwrites `updatedAt` and `deletedAt` on double-delete |
| `deleteCoffeeVariety` | `coffeeVarieties` | Overwrites `updatedAt` and `deletedAt` on double-delete |
| `approveEquipmentDeleteRequest` (inner tx) | `equipment` | Overwrites `deletedAt` inside the approval transaction |

Every other soft-delete in the codebase — 8 non-admin modules plus the two
correct admin soft-deletes (`softDeleteUser`, `softDeleteRecipe`) — uses the
`and(eq(id), isNull(deletedAt))` guard pattern. The four broken functions are
the only outliers.

Additionally, `deleteEquipment` and `deleteVendor` in the service layer
unconditionally call `model.createAuditLog()` even when the model returns `null`
(after the fix, because the entity was already deleted). This writes spurious
audit entries for no-op operations.

When `deleteCoffeeVariety` hits an already-deleted entity, the model returns
`null`, the service throws `'COFFEE_VARIETY_NOT_FOUND'`, and the global error
handler has no specific mapping for this error — it becomes a 500. A 404 is
the correct HTTP response.

## What Changes

- **admin/model.ts** — Add `isNull(deletedAt)` guard to the WHERE clause of
  `deleteEquipment`, `deleteVendor`, `deleteCoffeeVariety`, and the inner
  equipment update inside `approveEquipmentDeleteRequest` (4 one-line changes).
  Add JSDoc to `deleteCoffeeVariety` for consistency.
- **admin/service.ts** — Guard `createAuditLog()` calls in `deleteEquipment`
  and `deleteVendor` behind a `result !== null` check (2 conditional wraps).
- **middleware/errorHandler.ts** — Map `'COFFEE_VARIETY_NOT_FOUND'` error
  message to HTTP 404 with a proper JSON error envelope.
- **NEW: admin/model.test.ts** — Integration tests covering the four fixed
  functions. No existing admin model test file exists.
- **pr_description.md** — Re-create at project root as the final step so the
  user can open a pull request.

No schema changes. No shared-package changes. No frontend changes.
`and` and `isNull` are already imported in `admin/model.ts`.

## Capabilities

### Modified Capabilities

- **admin-soft-delete** (new capability): The admin module's soft-delete
  operations SHALL apply the `isNull(deletedAt)` guard identical to every
  non-admin soft-delete in the codebase. Admin soft-delete SHALL be idempotent:
  a second delete of an already-deleted record SHALL be a no-op at the database
  level. Audit log entries SHALL only be created when a record was actually
  soft-deleted. The `COFFEE_VARIETY_NOT_FOUND` error SHALL return HTTP 404
  instead of 500.

## Out of Scope

- **`user/model.ts:deleteUser` (line 68)** — Also lacks the `isNull` guard.
  Same bug class, different module context (user self-deletion). Tracked as
  a separate follow-up.
- **Controller try-catch for coffee variety routes** — The 404 mapping is
  handled centrally in the error handler, not per-route.
- **Other admin delete routes** (taste notes, compatibility rules, recipes,
  reports, delete requests) — These are controller-only operations that
  delegate to their respective module services, which already have the guard
  in non-admin modules.
