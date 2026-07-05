# D08: Consolidate Duplicate `AuthUser` Interface Definitions

> **Status (2026-07-04): ✅ Done** — shared `types/user.ts:94` exports `AuthUser`; both web consumers import it from shared.

## Severity: High

---

> **Revision notes (validated against `main` branch, June 2026)**
>
> Several facts in the original plan were incorrect or incomplete. All changes are
> marked **[CORRECTED]** or **[ADDED]**. A full diff summary appears at the bottom.

---

## Issue Description

The `AuthUser` interface is defined independently in **2 frontend locations** that
must be kept in sync manually:

1. `apps/web/src/api/index.ts:136-145` — used by API client functions
2. `apps/web/src/contexts/AuthContext.tsx:4-13` — used by auth context

Meanwhile, `packages/shared/src/types/user.ts` defines a `User` interface
**(lines 60-77)** **[CORRECTED — was stated as 42-59; those lines are
`UserPreferences`]** that is the canonical server-side user type, but the frontend
duplicates a subset of its fields.

> **[ADDED] Server-side `AuthUser` (not in scope)**
>
> There is also a third definition: `apps/api/src/modules/auth/service.ts:29`:
>
> ```typescript
> export interface AuthUser extends Omit<User, 'preferences'> {
>   passwordHash: string;
>   preferences?: UserPreferences;
> }
> ```
>
> This is an **internal server-side type** that includes `passwordHash` and uses
> `Date` for timestamps. It must **not** be moved to `@brewform/shared` and is
> **out of scope for this task**. However, adding `emailVerifiedAt: Date | null`
> to the shared `User` interface (Step 2) will automatically include that field
> in this type as well — which is the correct and desired behaviour since the
> column exists in the database. The existing test fixture in
> `service.test.ts:388` already includes `emailVerifiedAt: null`, so no test
> changes are required on the API side.

## Impact

- **Inconsistent user shape**: If a field is added/removed from one `AuthUser`
  but not the other, components may access undefined properties.
- **Duplication**: Two identical definitions must be maintained separately.
- **No shared contract**: The frontend `AuthUser` is not derived from the shared
  `User` type, so API changes can silently break the frontend.
- **Serialisation mismatch**: `emailVerifiedAt: string | null` in the frontend
  vs. the server's `Date | null` — correct in practice (JSON serialises `Date`
  to an ISO string) but the type system doesn't enforce the distinction.

## Root Cause

The two `AuthUser` definitions were created independently during development:

- `api/index.ts` defines it for API response typing
- `AuthContext.tsx` defines it for React state typing

Neither references the shared `User` type from `@brewform/shared`.

## Affected Files

| File | Definition | Fields |
|------|------------|--------|
| `apps/web/src/api/index.ts:136-145` | `AuthUser` (local, **unexported**) | id, email, emailVerifiedAt, username, displayName, avatarUrl, isAdmin, onboardingCompleted |
| `apps/web/src/contexts/AuthContext.tsx:4-13` | `AuthUser` (local, unexported) | id, email, emailVerifiedAt, username, displayName, avatarUrl, isAdmin, onboardingCompleted |
| `packages/shared/src/types/user.ts:60-77` **[CORRECTED]** | `User` (canonical) | id, email, username, displayName, avatarUrl, bio, preferences, onboardingCompleted, isAdmin, isBanned, createdAt, updatedAt, deletedAt |

> **[ADDED]** The `AuthUser` in `api/index.ts` is **not exported** (`interface AuthUser`,
> not `export interface AuthUser`). This means no files outside `api/index.ts`
> import it as a named type; only the two files listed above need updating.

The frontend `AuthUser` includes `emailVerifiedAt` (absent from shared `User`),
but excludes `bio`, `preferences`, `isBanned`, `createdAt`, `updatedAt`,
`deletedAt`.

## Fix Approach

1. Update the shared `User` type to include `emailVerifiedAt`.
2. Create a frontend-specific `AuthUser` type in `@brewform/shared/types/user.ts`
   that represents the JSON response shape (serialised dates as strings).
3. Remove the duplicate definitions from `api/index.ts` and `AuthContext.tsx`.
4. Update imports in both files.
5. Update shared package exports.
6. Fix the test mock that is missing `emailVerifiedAt`. **[ADDED]**

---

## Implementation Steps

### Step 1: Confirm both `AuthUser` definitions

Read and compare:

1. `apps/web/src/api/index.ts:136-145`
2. `apps/web/src/contexts/AuthContext.tsx:4-13`
3. `packages/shared/src/types/user.ts:60-77` **[CORRECTED line range]**

**Field comparison:**

| Field | api/index.ts | AuthContext.tsx | shared/User |
|-------|--------------|----------------|-------------|
| id | `string` | `string` | `string` |
| email | `string` | `string` | `string` |
| emailVerifiedAt | `string \| null` | `string \| null` | ❌ missing |
| username | `string` | `string` | `string` |
| displayName | `string \| null` | `string \| null` | `string \| null` |
| avatarUrl | `string \| null` | `string \| null` | `string \| null` |
| bio | ❌ missing | ❌ missing | `string \| null` |
| preferences | ❌ missing | ❌ missing | `UserPreferences` |
| onboardingCompleted | `boolean` | `boolean` | `boolean` |
| isAdmin | `boolean` | `boolean` | `boolean` |
| isBanned | ❌ missing | ❌ missing | `boolean` |
| createdAt | ❌ missing | ❌ missing | `Date` |
| updatedAt | ❌ missing | ❌ missing | `Date` |
| deletedAt | ❌ missing | ❌ missing | `Date \| null` |

The frontend `AuthUser` is a strict subset of `User` plus `emailVerifiedAt`, which
the `User` type is currently missing.

---

### Step 2: Update `packages/shared/src/types/user.ts`

Add `emailVerifiedAt` to the `User` interface. It exists in the database schema at
**`packages/db/src/schema.ts:69`** **[CORRECTED — original plan cited line 147]**:

```typescript
export interface User {
  /** UUID primary key */
  id: string;
  email: string;
  emailVerifiedAt: Date | null;  // ADD THIS — present in DB schema, was missing here
  /** Unique public handle */
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  preferences: UserPreferences;
  /** Whether the onboarding flow has been completed */
  onboardingCompleted: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
```

> **[ADDED] Side-effect on server-side `AuthUser`**
>
> `apps/api/src/modules/auth/service.ts` defines:
> ```typescript
> export interface AuthUser extends Omit<User, 'preferences'> {
>   passwordHash: string;
>   preferences?: UserPreferences;
> }
> ```
> After this change, `AuthUser` in service.ts will automatically gain
> `emailVerifiedAt: Date | null` — no manual edit needed there. The existing
> test fixture at `service.test.ts:388` already includes `emailVerifiedAt: null`,
> so the API tests continue to pass.

---

### Step 3: Create frontend `AuthUser` type

Add to `packages/shared/src/types/user.ts` (after the `User` interface).

Use `Pick<User, ...>` rather than a hand-written interface. A hand-written
interface simply moves the copy-paste one level up: if `User` ever renames a
field, `AuthUser` silently diverges again — the same problem D08 exists to fix.
`Pick` creates a structural link: renaming a picked field in `User` immediately
produces a TypeScript error at this declaration.

`emailVerifiedAt` sits outside the `Pick` intentionally — it is not yet in
`User` (Step 2 adds it as `Date | null`) — and the explicit override documents
the wire-format serialisation difference at the type level.

```typescript
/**
 * Authenticated user object as returned by the API.
 *
 * Derived from the canonical `User` type via `Pick` so that field renames in
 * `User` surface as compile errors here rather than silent drift.
 *
 * `emailVerifiedAt` is intentionally typed as `string | null` (not `Date`)
 * because the JSON response serialises the server-side `Date` to an ISO 8601
 * string.
 *
 * Note: do not confuse with the server-side `AuthUser` in
 * `apps/api/src/modules/auth/service.ts`, which extends `User` with
 * `passwordHash` and uses `Date` for timestamps.
 */
export interface AuthUser extends Pick<User,
  | 'id'
  | 'email'
  | 'username'
  | 'displayName'
  | 'avatarUrl'
  | 'isAdmin'
  | 'onboardingCompleted'
> {
  /** ISO 8601 string or null — `Date | null` serialised to string by the API */
  emailVerifiedAt: string | null;
}
```

---

### Step 4: Update `apps/web/src/api/index.ts`

1. Remove the local `AuthUser` interface (lines 136-145).
2. Add import at the top of the file:

```typescript
import type { AuthUser } from '@brewform/shared/types';
```

3. Keep `AdminUser` and `AdminUserDetail` in this file — they are
   frontend-specific admin panel types and are already exported:

```typescript
export interface AdminUser { ... }        // lines 147-156
export interface AdminUserDetail { ... }  // lines 158-164
```

> **[ADDED]** The existing imports in `api/index.ts` are from `'./client.ts'`
> and `'./types.ts'` — there is currently **no** `@brewform/shared` import.
> The new import will be the first one from the shared package in this file.
> The pattern already works elsewhere in the web app (e.g. `hooks/useUnitSystem.ts`,
> `api/types.ts`, multiple page files).

---

### Step 5: Update `apps/web/src/contexts/AuthContext.tsx`

1. Remove the local `AuthUser` interface (lines 4-13).
2. Add import at the top of the file:

```typescript
import type { AuthUser } from '@brewform/shared/types';
```

The file already imports from `'../api/index.ts'`; the shared import goes above it:

```typescript
import type { AuthUser } from '@brewform/shared/types';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { authApi, userApi } from '../api/index.ts';
```

No other changes are required. `AuthContextType`, `AuthProvider`, and `useAuth`
all reference `AuthUser` by name and will resolve to the shared type automatically.

---

### Step 6: Update shared package exports

In `packages/shared/src/types/index.ts`, add `AuthUser` to the user exports:

**Before:**
```typescript
export type {
  DateFormat,
  TemperatureUnit,
  Theme,
  UnitSystem,
  User,
  UserPreferences,
  UserProfile,
} from './user.ts';
```

**After:**
```typescript
export type {
  AuthUser,
  DateFormat,
  TemperatureUnit,
  Theme,
  UnitSystem,
  User,
  UserPreferences,
  UserProfile,
} from './user.ts';
```

---

### Step 7: Fix the `makeUser` test mock **[ADDED]**

`apps/web/src/components/recipe/CommentSection.test.tsx` contains a helper that
creates mock user objects cast to `ReturnType<typeof useAuth>`:

```typescript
// Current — missing emailVerifiedAt
function makeUser(overrides: Partial<{ id: string; isAdmin: boolean }> = {}) {
  return {
    id: overrides.id ?? 'user-99',
    email: 'u@example.com',
    username: overrides.id ?? 'user99',
    displayName: null,
    avatarUrl: null,
    isAdmin: overrides.isAdmin ?? false,
    onboardingCompleted: true,
  };
}
```

After this change the return value is technically missing the required
`emailVerifiedAt` field. The `as ReturnType<typeof useAuth>` cast currently
suppresses the error, but the mock should be updated for correctness:

```typescript
// Updated — add emailVerifiedAt
function makeUser(overrides: Partial<{ id: string; isAdmin: boolean }> = {}) {
  return {
    id: overrides.id ?? 'user-99',
    email: 'u@example.com',
    emailVerifiedAt: null,          // ADD THIS
    username: overrides.id ?? 'user99',
    displayName: null,
    avatarUrl: null,
    isAdmin: overrides.isAdmin ?? false,
    onboardingCompleted: true,
  };
}
```

---

### Step 8: Run verification **[CORRECTED — was Step 7]**

**Type-check the API and shared packages** (full `deno check`):

```bash
make check-api
make check-shared
```

**Lint the web frontend** (the web `check` task runs `deno lint`, not `deno check`):

```bash
make check-web
```

> **[ADDED] Important**: `make check` for the web workspace runs
> `deno lint src/` only — **not** a full TypeScript type-check. This is an
> existing configuration choice in `apps/web/deno.json`. To verify there are no
> type errors introduced in the web app, run:
>
> ```bash
> docker compose run --rm --no-deps app deno check apps/web/src/main.tsx
> ```
>
> Alternatively, run the full CI pipeline which exercises the type check through
> Vite's build step:
>
> ```bash
> make ci
> ```

Fix any type mismatches that surface before proceeding.

---

## Testing Strategy

- **Type-check (API + shared)**: `make check-api && make check-shared` — zero errors.
- **Full lint**: `make lint` — no new warnings.
- **Unit tests**: `make test` — all existing tests pass.
- **Web type safety**: `make ci` or the `deno check` command above.
- **Manual smoke test**:
  1. Start dev server (`make dev`).
  2. Register a new user → verify `AuthUser` fields populate correctly (including
     `emailVerifiedAt: null` for a fresh account).
  3. Log out and log back in → verify `AuthUser` fields are populated.
  4. Refresh the page → verify `AuthUser` persists from `GET /users/me`.
  5. Verify the email verification banner appears for unverified accounts and
     disappears after verification (uses `user.emailVerifiedAt` in
     `EmailVerificationBanner.tsx`).

---

## Risk Assessment

- **Low risk overall**: Pure type consolidation — no runtime behaviour changes.
- **Import path**: Incorrect imports will cause compile errors (caught by
  `make check-api` / `make ci`).
- **Serialisation mismatch**: The frontend uses `string` for dates
  (JSON-serialised), while the canonical `User` type uses `Date`. The new
  `AuthUser` type correctly uses `string | null` to match the JSON response
  shape. These are intentionally different types.
- **Naming collision risk**: The server-side `AuthUser` in `service.ts` and the
  new shared `AuthUser` have the same name but different shapes. This is
  acceptable because they live in different module scopes and serve different
  purposes. The JSDoc comment in the shared definition calls this out explicitly.
- **Rollback**: Revert the commit — no migration or runtime change is involved.
- **Verification**: `make check-api && make check-shared && make ci`.

---

## Diff Summary — Changes from Original Plan

| # | Location in original plan | Issue | Correction |
|---|--------------------------|-------|------------|
| 1 | Issue Description, Affected Files | `user.ts:42-59` cited for `User` interface | **Corrected to `user.ts:60-77`**. Lines 41-54 are `UserPreferences`. |
| 2 | Step 2 | `schema.ts:147` cited for `emailVerifiedAt` | **Corrected to `schema.ts:69`**. |
| 3 | Issue Description | Only 2 frontend `AuthUser` locations listed | **Added** note on server-side `AuthUser` in `apps/api/src/modules/auth/service.ts:29` and its cascading behaviour. |
| 4 | Step 4 | No mention of export status | **Added** note: `AuthUser` in `api/index.ts` is not exported — no external import sites to update. |
| 5 | Step 4 | No mention that `@brewform/shared` is not yet imported in `api/index.ts` | **Added** clarification. |
| 6 | Step 7 (type-check) | `make check` implied full TypeScript type-check for web | **Corrected**: web workspace `check` task is `deno lint` only. Added `deno check` / `make ci` instructions. |
| 7 | (missing) | Test mock `makeUser` in `CommentSection.test.tsx` missing `emailVerifiedAt` | **Added** as Step 7 with fix. |
| 8 | (missing) | No note distinguishing frontend vs. server-side `AuthUser` naming | **Added** JSDoc guidance and naming-collision risk note. |
| 9 | Step 3 | Hand-written interface in shared reintroduces drift risk in microcosm | **Changed to `Pick<User, ...> + emailVerifiedAt` override**. Renames/removals in `User` now produce compile errors at the `AuthUser` declaration rather than silent drift. |