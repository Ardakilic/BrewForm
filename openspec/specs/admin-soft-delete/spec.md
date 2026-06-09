# admin-soft-delete Specification

## Purpose
TBD - created by archiving change d19-admin-soft-delete-fix. Update Purpose after archive.
## Requirements
### Requirement: Admin soft-delete is idempotent

Every soft-delete function in `apps/api/src/modules/admin/model.ts` that sets `deletedAt` via `db.update().set({ deletedAt }).where(...).returning()` SHALL include `isNull(table.deletedAt)` in its WHERE clause, conjuncted with the existing `eq(table.id, id)` using `and()`. A second soft-delete of an already-deleted record SHALL match zero rows and SHALL return `null` from the model function.

This requirement applies to:
- `deleteEquipment(admin/model.ts)`
- `deleteVendor(admin/model.ts)`
- `deleteCoffeeVariety(admin/model.ts)`
- The inner equipment update inside `approveEquipmentDeleteRequest(admin/model.ts)`

The guard pattern SHALL be:

```typescript
.where(and(eq(table.id, id), isNull(table.deletedAt)))
```

This pattern is the established convention used by `softDeleteUser` (L199-201), `softDeleteRecipe` (L239-241), `updateCoffeeVariety` (L598), and all 8 non-admin soft-delete functions.

#### Scenario: Deleting an active equipment record succeeds

- **WHEN** `model.deleteEquipment(id)` is called with the ID of an active (non-deleted) equipment record
- **THEN** the function returns the updated equipment with `deletedAt` set to a non-null `Date` value

#### Scenario: Deleting an already-deleted equipment record returns null

- **WHEN** `model.deleteEquipment(id)` is called with the ID of an equipment record where `deletedAt` is already set
- **THEN** the function returns `null` and the existing `deletedAt` timestamp is NOT overwritten

#### Scenario: Deleting an active vendor record succeeds

- **WHEN** `model.deleteVendor(id)` is called with the ID of an active vendor
- **THEN** the function returns the updated vendor with `deletedAt` set

#### Scenario: Deleting an already-deleted vendor record returns null

- **WHEN** `model.deleteVendor(id)` is called with the ID of a vendor where `deletedAt` is already set
- **THEN** the function returns `null` and the existing `deletedAt` is NOT overwritten

#### Scenario: Deleting an active coffee variety succeeds

- **WHEN** `model.deleteCoffeeVariety(id)` is called with the ID of an active coffee variety
- **THEN** the function returns the updated variety with both `deletedAt` and `updatedAt` set to non-null `Date` values

#### Scenario: Deleting an already-deleted coffee variety returns null

- **WHEN** `model.deleteCoffeeVariety(id)` is called with the ID of a variety where `deletedAt` is already set
- **THEN** the function returns `null` and neither `deletedAt` nor `updatedAt` is overwritten

#### Scenario: Double-delete preserves the original deletion timestamp

- **WHEN** `model.deleteXxx(id)` is called, followed by a second call to `model.deleteXxx(id)` after a time delay
- **THEN** the `deletedAt` (and `updatedAt` for `deleteCoffeeVariety`) value on the database row matches the timestamp set by the first call

#### Scenario: approveEquipmentDeleteRequest guard prevents overwrite

- **WHEN** `model.approveEquipmentDeleteRequest(id, adminId)` is called for a request whose associated equipment already has `deletedAt` set
- **THEN** the request status is still updated to `'approved'` (the request workflow proceeds), but the equipment's `deletedAt` timestamp is NOT overwritten by the transaction's inner update

### Requirement: Audit logs only for actual deletions

The `deleteEquipment` and `deleteVendor` functions in `apps/api/src/modules/admin/service.ts` SHALL only call `model.createAuditLog()` when the corresponding model function returned a non-null result (i.e., the record existed at the time of deletion and was actually soft-deleted). When the model returns `null` (record already deleted), no audit log entry SHALL be created.

#### Scenario: Audit log created for actual deletion

- **WHEN** `service.deleteEquipment(adminId, id)` is called for an active equipment record
- **THEN** an audit log entry with action `'DELETE_EQUIPMENT'` is created

#### Scenario: No audit log for double-delete

- **WHEN** `service.deleteEquipment(adminId, id)` is called for an already soft-deleted equipment record
- **THEN** no audit log entry is created

#### Scenario: Same audit log guard applies to vendors

- **WHEN** `service.deleteVendor(adminId, id)` is called
- **THEN** an audit log is created only when the vendor was actually deleted, matching the same guard pattern as `deleteEquipment`

### Requirement: COFFEE_VARIETY_NOT_FOUND returns HTTP 404

When `admin/service.ts:deleteCoffeeVariety` throws `new Error('COFFEE_VARIETY_NOT_FOUND')`, the global error handler in `apps/api/src/middleware/errorHandler.ts` SHALL return an HTTP 404 response with a JSON error envelope:

```json
{
  "success": false,
  "error": { "code": "NOT_FOUND", "message": "Coffee variety not found" }
}
```

#### Scenario: 404 on double-delete of coffee variety

- **WHEN** an admin sends `DELETE /api/v1/admin/coffee-varieties/:id` for a variety that is already soft-deleted
- **THEN** the response status is `404` and the body contains `error.code === 'NOT_FOUND'`

#### Scenario: 200 on first delete of coffee variety

- **WHEN** an admin sends `DELETE /api/v1/admin/coffee-varieties/:id` for an active variety
- **THEN** the response status is `200` with the standard success envelope

### Requirement: deleteCoffeeVariety has JSDoc

The `deleteCoffeeVariety` function in `apps/api/src/modules/admin/model.ts` SHALL carry a JSDoc comment matching the pattern established by `deleteEquipment` and `deleteVendor`:

```typescript
/** Soft-delete a coffee variety by setting `deletedAt`. Returns the updated variety or null. */
export async function deleteCoffeeVariety(id: string) { ... }
```

#### Scenario: JSDoc present on deleteCoffeeVariety

- **WHEN** the source of `apps/api/src/modules/admin/model.ts` is inspected at the `deleteCoffeeVariety` function (line 603)
- **THEN** a JSDoc block is present immediately above `export async function deleteCoffeeVariety`

### Requirement: Integration test coverage

The API package SHALL contain a test file `apps/api/src/modules/admin/model.test.ts` that exercises the four fixed functions via real database rows. Tests SHALL cover:

1. Successful soft-delete of active records (equipment, vendor, variety)
2. Return value of `null` for already-deleted records (all three)
3. Timestamp preservation on double-delete (all three)
4. Regression: `updateCoffeeVariety` on deleted variety returns `null`
5. `approveEquipmentDeleteRequest`: guard prevents timestamp overwrite when equipment was already soft-deleted

#### Scenario: All admin model tests pass

- **WHEN** `make test` is invoked on a clean checkout that includes the D19 changes
- **THEN** every test in `apps/api/src/modules/admin/model.test.ts` passes and no pre-existing test regresses

#### Scenario: Type-check and lint pass

- **WHEN** `make check-api` and `make lint` are invoked
- **THEN** zero errors and zero warnings are reported on the changed files

