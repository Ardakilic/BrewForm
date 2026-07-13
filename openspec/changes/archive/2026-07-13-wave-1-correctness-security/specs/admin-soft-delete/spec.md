## MODIFIED Requirements

### Requirement: Admin soft-delete is idempotent

Every soft-delete function in `apps/api/src/modules/admin/model.ts` that sets `deletedAt` via `db.update().set({ deletedAt }).where(...).returning()` SHALL include `isNull(table.deletedAt)` in its WHERE clause, conjuncted with the existing `eq(table.id, id)` using `and()`. A second soft-delete of an already-deleted record SHALL match zero rows and SHALL return `null` from the model function.

**Reason:** D19 (archived 2026-06-09) established this requirement for the four soft-delete functions it fixed (`deleteEquipment`, `deleteVendor`, `deleteCoffeeVariety`, `approveEquipmentDeleteRequest` inner update). D41 extends the same requirement to the three admin user-state mutations (`banUser`, `unbanUser`, `setUserAdminRole`) and three sibling unguarded updates (`updateRecipeVisibility`, `updateEquipment`, `updateVendor`) found by the D41 sibling sweep. The requirement text is broadened from "soft-delete functions" to "all `db.update()` functions on soft-deletable tables" so it covers the new functions without duplicating the requirement.

This requirement now applies to:
- `deleteEquipment(admin/model.ts)` — D19
- `deleteVendor(admin/model.ts)` — D19
- `deleteCoffeeVariety(admin/model.ts)` — D19
- The inner equipment update inside `approveEquipmentDeleteRequest(admin/model.ts)` — D19
- `banUser(admin/model.ts)` — D41 (new)
- `unbanUser(admin/model.ts)` — D41 (new)
- `setUserAdminRole(admin/model.ts)` — D41 (new)
- `updateRecipeVisibility(admin/model.ts)` — D41 (new)
- `updateEquipment(admin/model.ts)` — D41 (new)
- `updateVendor(admin/model.ts)` — D41 (new)

The guard pattern SHALL be:

```typescript
.where(and(eq(table.id, id), isNull(table.deletedAt)))
```

This pattern is the established convention used by `softDeleteUser` (L199-201), `softDeleteRecipe` (L239-241), `updateCoffeeVariety` (L598), and all 8 non-admin soft-delete functions. `and` and `isNull` are already imported at `admin/model.ts:30`.

**Migration:** No data migration. The three primary functions previously returned the mutated row for soft-deleted targets; they now return `null`. The service layer's existing `if (!user) throw new Error('USER_NOT_FOUND')` guards (already present at `service.ts:56,67,77`) translate this to a throw before the audit log is written, so no spurious audit entries are created. The controller layer's `POST /users/:id/ban` route (`index.ts:159-178`) already maps `USER_NOT_FOUND` → 404. The `PATCH /users/:id/admin` route (`index.ts:215-225`) does NOT — see the new requirement below.

#### Scenario: Banning an active user succeeds

- **WHEN** `model.banUser(userId)` is called with the ID of an active (non-deleted) user
- **THEN** the function returns the updated user with `isBanned: true`

#### Scenario: Banning an already-deleted user returns null

- **WHEN** `model.banUser(userId)` is called with the ID of a user where `deletedAt` is already set
- **THEN** the function returns `null` and the row's `isBanned` value is unchanged in the database

#### Scenario: Unbanning an active banned user succeeds

- **WHEN** `model.unbanUser(userId)` is called with the ID of an active user whose `isBanned` is `true`
- **THEN** the function returns the updated user with `isBanned: false`

#### Scenario: Unbanning an already-deleted user returns null

- **WHEN** `model.unbanUser(userId)` is called with the ID of a user where `deletedAt` is already set
- **THEN** the function returns `null` and the row's `isBanned` value is unchanged in the database (stays `true` if it was `true`)

#### Scenario: Granting admin role on an active user succeeds

- **WHEN** `model.setUserAdminRole(userId, true)` is called with the ID of an active user
- **THEN** the function returns the updated user with `isAdmin: true`

#### Scenario: Revoking admin role on an active user succeeds

- **WHEN** `model.setUserAdminRole(userId, false)` is called with the ID of an active user
- **THEN** the function returns the updated user with `isAdmin: false`

#### Scenario: Granting admin role on an already-deleted user returns null — privilege escalation blocked

- **WHEN** `model.setUserAdminRole(userId, true)` is called with the ID of a user where `deletedAt` is already set
- **THEN** the function returns `null` and the row's `isAdmin` value is unchanged in the database
- **AND** no deleted-but-admin row is created (the privilege-escalation edge is blocked)

#### Scenario: Updating visibility on an already-deleted recipe returns null

- **WHEN** `model.updateRecipeVisibility(recipeId, 'public')` is called with the ID of a recipe where `deletedAt` is already set
- **THEN** the function returns `null` and the recipe's `visibility` is unchanged in the database

#### Scenario: Updating an already-deleted equipment record returns null

- **WHEN** `model.updateEquipment(id, { name: 'New' })` is called with the ID of an equipment where `deletedAt` is already set
- **THEN** the function returns `null` and the equipment row is unchanged in the database

#### Scenario: Updating an already-deleted vendor returns null

- **WHEN** `model.updateVendor(id, { name: 'New' })` is called with the ID of a vendor where `deletedAt` is already set
- **THEN** the function returns `null` and the vendor row is unchanged in the database

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

## ADDED Requirements

### Requirement: PATCH /users/:id/admin maps USER_NOT_FOUND to HTTP 404

The `PATCH /api/v1/admin/users/:id/admin` route in `apps/api/src/modules/admin/index.ts` (the `setUserAdminRole` endpoint) SHALL wrap its service call in a `try/catch` that maps a thrown `Error('USER_NOT_FOUND')` to an HTTP 404 response with the standard error envelope, mirroring the existing `POST /users/:id/ban` route's `try/catch` at `index.ts:171-177`. Any other error SHALL be re-thrown to the global error handler.

This requirement exists because the `setUserAdminRole` route at `index.ts:215-225` currently has no `try/catch` — after D41 adds the `isNull(deletedAt)` guard to the model, the service will throw `USER_NOT_FOUND` for soft-deleted targets, and without this mapping the route would return 500 instead of the correct 404.

```typescript
// Required pattern (mirrors index.ts:159-178 ban/unban route):
admin.patch('/users/:id/admin', describeRoute({ ... }), zValidator('json', ...), async (c) => {
  const adminId = c.get('userId') as string;
  const userId = c.req.param('id')!;
  const { isAdmin } = c.req.valid('json');
  try {
    const user = await service.setUserAdminRole(adminId, userId, isAdmin);
    return success(c, user);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'USER_NOT_FOUND') {
      return error(c, 'NOT_FOUND', 'User not found.', 404);
    }
    throw err;
  }
});
```

#### Scenario: setRole on an active user returns 200

- **WHEN** an admin sends `PATCH /api/v1/admin/users/:id/admin` with `{ isAdmin: true }` for an active user
- **THEN** the response status is `200` with the standard success envelope containing the updated user

#### Scenario: setRole on a soft-deleted user returns 404

- **WHEN** an admin sends `PATCH /api/v1/admin/users/:id/admin` for a user where `deletedAt` is already set
- **THEN** the response status is `404` with the standard error envelope containing `error.code === 'NOT_FOUND'`

#### Scenario: setRole on a non-existent user returns 404

- **WHEN** an admin sends `PATCH /api/v1/admin/users/:id/admin` with a UUID that matches no user row at all
- **THEN** the response status is `404` with the standard error envelope

### Requirement: Admin user-state mutation routes have OpenAPI describeRoute metadata

The `POST /api/v1/admin/users/:id/ban` and `PATCH /api/v1/admin/users/:id/admin` routes in `apps/api/src/modules/admin/index.ts` SHALL carry full `describeRoute({...})` metadata per the AGENTS.md OpenAPI rules:

- `tags: ['Admin']` (the `Admin` tag is already declared in `apps/api/src/routes/openapi.ts:63`)
- `summary` and `description`
- `security: [{ bearerAuth: [] }]` (both routes are auth-guarded via `adminMiddleware` which requires `authMiddleware`)
- `responses`:
  - `200` (or `201`) with `resolver(successEnvelope(UserRowOutputSchema))` for the success case (`UserRowOutputSchema` is defined at `packages/shared/src/schemas/responses/user.ts:63` — the bare `users` row minus `passwordHash`; `UserOutputSchema` does not exist)
  - `401` with `resolver(ErrorEnvelopeSchema)` (auth-guarded)
  - `404` with `resolver(ErrorEnvelopeSchema)` (after D41, soft-deleted/non-existent targets return 404)
- `requestBody`: `jsonRequestBody(AdminBanUserSchema)` for the ban route; `jsonRequestBody(z.object({ isAdmin: z.boolean() }))` for the setRole route
- The `zValidator(...)` calls SHALL remain as the request validator (ADR-012); `describeRoute` is additive metadata only

#### Scenario: ban/unban route is documented

- **WHEN** the generated `/api/v1/openapi.json` is inspected for `POST /api/v1/admin/users/:id/ban`
- **THEN** the operation has `tags: ['Admin']`, `security: [{ bearerAuth: [] }]`, a `requestBody` with `AdminBanUserSchema`, and `responses` including `200`, `401`, and `404`

#### Scenario: setRole route is documented

- **WHEN** the generated `/api/v1/openapi.json` is inspected for `PATCH /api/v1/admin/users/:id/admin`
- **THEN** the operation has `tags: ['Admin']`, `security: [{ bearerAuth: [] }]`, a `requestBody` with `{ isAdmin: boolean }`, and `responses` including `200`, `401`, and `404`

### Requirement: Admin user-state mutation functions have JSDoc with active-row precondition

The `banUser`, `unbanUser`, and `setUserAdminRole` functions in `apps/api/src/modules/admin/model.ts` SHALL carry JSDoc that documents the active-row precondition introduced by the `isNull(deletedAt)` guard — i.e., that the function returns `null` when the target user is soft-deleted.

```typescript
/** Ban an active (non-deleted) user by setting `isBanned = true`. Returns the updated user, or null if the user is soft-deleted or not found. */
export async function banUser(userId: string) { ... }

/** Unban an active (non-deleted) user by setting `isBanned = false`. Returns the updated user, or null if the user is soft-deleted or not found. */
export async function unbanUser(userId: string) { ... }

/** Set or clear the admin role on an active (non-deleted) user. Returns the updated user, or null if the user is soft-deleted or not found. */
export async function setUserAdminRole(userId: string, isAdmin: boolean) { ... }
```

#### Scenario: JSDoc present on banUser

- **WHEN** the source of `apps/api/src/modules/admin/model.ts` is inspected at the `banUser` function
- **THEN** a JSDoc block is present immediately above `export async function banUser` and mentions the soft-deleted/null-return behaviour

#### Scenario: JSDoc present on unbanUser

- **WHEN** the source of `apps/api/src/modules/admin/model.ts` is inspected at the `unbanUser` function
- **THEN** a JSDoc block is present immediately above `export async function unbanUser` and mentions the soft-deleted/null-return behaviour

#### Scenario: JSDoc present on setUserAdminRole

- **WHEN** the source of `apps/api/src/modules/admin/model.ts` is inspected at the `setUserAdminRole` function
- **THEN** a JSDoc block is present immediately above `export async function setUserAdminRole` and mentions the soft-deleted/null-return behaviour

### Requirement: Integration test coverage for admin user-state mutations

The API package's existing test file `apps/api/src/modules/admin/model.test.ts` SHALL contain `describe` blocks for `banUser`, `unbanUser`, and `setUserAdminRole` that exercise both the active-user and soft-deleted-user paths via real database rows. Tests SHALL follow the pattern established by the D19 `deleteEquipment` block (L17-68) and the `deleteCoffeeVariety` regression `it` (L171-177):

1. **Active case:** call the function on an active user → assert the returned row has the expected field value (`isBanned: true` for `banUser`, etc.).
2. **Soft-deleted case:** pre-set `deletedAt` on the user via `db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId))`, then call the function → assert it returns `null` and the field value is unchanged in the DB.
3. **No-mutation case (for `setUserAdminRole`):** pre-set `deletedAt`, call `setUserAdminRole(userId, true)` → assert the function returns `null` and the DB row's `isAdmin` is still its pre-call value (the privilege-escalation-blocked assertion).

Tests SHALL use the inline `crypto.randomUUID()` fixture + `db.insert(users).values({...})` + hard-delete `afterEach` pattern already established in `model.test.ts`. All `describe` blocks SHALL pass `{ sanitizeOps: false, sanitizeResources: false }` as the second argument (required for DB I/O tests).

Optional but recommended: the same three-`it` pattern for the three sibling functions (`updateRecipeVisibility`, `updateEquipment`, `updateVendor`). These are lower-risk (no privilege escalation) and can be deferred if the implementer is time-constrained.

#### Scenario: banUser tests pass

- **WHEN** `make test-specific filter=apps/api/src/modules/admin/model.test.ts` is executed
- **THEN** the `describe('banUser', ...)` block passes, covering the active-user and soft-deleted-user paths

#### Scenario: unbanUser tests pass

- **WHEN** `make test-specific filter=apps/api/src/modules/admin/model.test.ts` is executed
- **THEN** the `describe('unbanUser', ...)` block passes, covering the active-user and soft-deleted-user paths

#### Scenario: setUserAdminRole tests pass including privilege-escalation-blocked case

- **WHEN** `make test-specific filter=apps/api/src/modules/admin/model.test.ts` is executed
- **THEN** the `describe('setUserAdminRole', ...)` block passes, covering the active-user grant/revoke paths and the soft-deleted-user path that asserts `isAdmin` is NOT granted on a deleted row

#### Scenario: No pre-existing admin model test regresses

- **WHEN** `make test` is invoked on a clean checkout that includes the D41 changes
- **THEN** every pre-existing test in `apps/api/src/modules/admin/model.test.ts` (the D19 `deleteEquipment`/`deleteVendor`/`deleteCoffeeVariety`/`approveEquipmentDeleteRequest guard` blocks) still passes

#### Scenario: Type-check and lint pass

- **WHEN** `make check-api` and `make lint` are invoked
- **THEN** zero errors and zero warnings are reported on `apps/api/src/modules/admin/model.ts`, `apps/api/src/modules/admin/index.ts`, and `apps/api/src/modules/admin/model.test.ts`