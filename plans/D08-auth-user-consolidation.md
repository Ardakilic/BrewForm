# D08: Consolidate Duplicate `AuthUser` Interface Definitions

## Severity: High

## Issue Description

The `AuthUser` interface is defined independently in 3 locations:

1. `apps/web/src/api/index.ts:136-145` — used by API client functions
2. `apps/web/src/contexts/AuthContext.tsx:4-13` — used by auth context
3. `apps/web/src/api/index.ts` also has `AdminUser` and `AdminUserDetail` (lines 147-164)

Meanwhile, `packages/shared/src/types/user.ts` defines a `User` interface (lines 42-59) that is the canonical server-side user type, but the frontend duplicates a subset of its fields.

## Impact

- **Inconsistent user shape**: If a field is added/removed from one `AuthUser` but not the other, components may access undefined properties.
- **Duplication**: Two identical definitions must be maintained separately.
- **No shared contract**: The frontend doesn't use the shared `User` type from `@brewform/shared`, so API changes can silently break the frontend.
- **Type widening**: `apps/web/src/api/index.ts` defines `emailVerifiedAt: string | null` while the shared type has `emailVerifiedAt: Date | null` — a serialization mismatch.

## Root Cause

The two `AuthUser` definitions were created independently during development:
- `api/index.ts` defines it for API response typing
- `AuthContext.tsx` defines it for React state typing

Neither references the shared `User` type from `@brewform/shared`, which is the canonical definition.

## Affected Files

| File | Definition | Fields |
|------|------------|--------|
| `apps/web/src/api/index.ts:136-145` | `AuthUser` (local interface) | id, email, emailVerifiedAt, username, displayName, avatarUrl, isAdmin, onboardingCompleted |
| `apps/web/src/contexts/AuthContext.tsx:4-13` | `AuthUser` (local interface) | id, email, emailVerifiedAt, username, displayName, avatarUrl, isAdmin, onboardingCompleted |
| `packages/shared/src/types/user.ts:42-59` | `User` (canonical) | id, email, username, displayName, avatarUrl, bio, preferences, onboardingCompleted, isAdmin, isBanned, createdAt, updatedAt, deletedAt |

The frontend `AuthUser` includes `emailVerifiedAt` (not in shared `User`), but excludes `bio`, `preferences`, `isBanned`, `createdAt`, `updatedAt`, `deletedAt`.

## Fix Approach

1. Update the shared `User` type to include `emailVerifiedAt` (it exists on the DB table but was omitted from the type).
2. Create a frontend-specific `AuthUser` type in `@brewform/shared/types/user.ts` that represents the API response shape (serialized dates as strings).
3. Remove duplicate definitions from `api/index.ts` and `AuthContext.tsx`.
4. Update imports in both files.

Reference: [React TypeScript Cheatsheet](/reactjs/react.dev)

## Implementation Steps

### Step 1: Read both AuthUser definitions

1. Read `apps/web/src/api/index.ts:136-145`
2. Read `apps/web/src/contexts/AuthContext.tsx:4-13`
3. Read `packages/shared/src/types/user.ts:42-59`
4. Compare fields — identify differences.

**Field comparison:**

| Field | api/index.ts | AuthContext.tsx | shared/User |
|-------|--------------|----------------|-------------|
| id | string | string | string |
| email | string | string | string |
| emailVerifiedAt | string \| null | string \| null | ❌ missing |
| username | string | string | string |
| displayName | string \| null | string \| null | string \| null |
| avatarUrl | string \| null | string \| null | string \| null |
| bio | ❌ missing | ❌ missing | string \| null |
| preferences | ❌ missing | ❌ missing | UserPreferences |
| onboardingCompleted | boolean | boolean | boolean |
| isAdmin | boolean | boolean | boolean |
| isBanned | ❌ missing | ❌ missing | boolean |
| createdAt | ❌ missing | ❌ missing | Date |
| updatedAt | ❌ missing | ❌ missing | Date |
| deletedAt | ❌ missing | ❌ missing | Date \| null |

The frontend `AuthUser` is a subset of the full `User` type — it only includes fields the frontend currently uses for auth state.

### Step 2: Update `packages/shared/src/types/user.ts`

Add `emailVerifiedAt` to the `User` interface (it exists in the DB schema at `schema.ts:147`):

```typescript
export interface User {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;  // ADD THIS
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  preferences: UserPreferences;
  onboardingCompleted: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
```

### Step 3: Create frontend AuthUser type

Add to `packages/shared/src/types/user.ts`:

```typescript
/**
 * Authenticated user object as returned by the API.
 * Date fields are serialized as ISO strings by the JSON response.
 * This is the type used by frontend API clients and auth context.
 */
export interface AuthUser {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  onboardingCompleted: boolean;
}
```

### Step 4: Update `apps/web/src/api/index.ts`

1. Remove the local `AuthUser` interface (lines 136-145).
2. Add import: `import type { AuthUser } from '@brewform/shared/types';`
3. Keep `AdminUser` and `AdminUserDetail` here (they are frontend-specific admin types).

### Step 5: Update `apps/web/src/contexts/AuthContext.tsx`

1. Remove the local `AuthUser` interface (lines 4-13).
2. Add import: `import type { AuthUser } from '@brewform/shared/types';`

### Step 6: Update shared package exports

Ensure `AuthUser` is exported from `packages/shared/src/types/index.ts`:

```typescript
export type { User, UserProfile, UserPreferences, AuthUser } from './user.ts';
```

### Step 7: Run type-check

```bash
make check
```

Fix any type mismatches that surface.

## Testing Strategy

- **Type-check**: `make check` — zero errors across all workspaces.
- **Lint**: `make lint` — no new warnings.
- **Unit tests**: `make test` — existing tests pass.
- **Manual smoke test**:
  1. Start dev server (`make dev`).
  2. Register a new user → verify `AuthUser` fields are populated.
  3. Log out and log back in → verify `AuthUser` fields are populated.
  4. Refresh page → verify `AuthUser` persists from `/users/me`.

## Risk Assessment

- **Low risk**: This is a type consolidation — no runtime behavior changes.
- **Import path risk**: Incorrect imports will cause compile errors (caught by `make check`).
- **Serialization mismatch**: The frontend uses `string` for dates (JSON-serialized), while the shared type uses `Date`. The `AuthUser` type correctly uses `string` to match the API response shape.
- **Rollback**: Revert the commit and restore original files.
- **Verification**: `make check` + `make test`.
