## Context

The `AuthUser` interface exists in three places in the codebase:

```
┌─────────────────────────────────────────────────────────────────┐
│                    packages/shared/types/user.ts                │
│  User (canonical, missing emailVerifiedAt)                      │
└────────────────┬────────────────────────────────────────────────┘
                 │
    ┌────────────┴────────────┐
    ▼                         ▼
┌───────────────────┐  ┌──────────────────────────────┐
│ apps/web/src/api/ │  │ apps/web/src/contexts/       │
│ index.ts          │  │ AuthContext.tsx              │
│                   │  │                              │
│ interface AuthUser│  │ interface AuthUser            │
│ { ... }           │  │ { ... }                      │
│ (unexported)      │  │ (unexported)                  │
└───────────────────┘  └──────────────────────────────┘
```

Both frontend duplicates are identical (8 fields: id, email, emailVerifiedAt, username, displayName, avatarUrl, isAdmin, onboardingCompleted). The shared `User` type has 14 fields but is missing `emailVerifiedAt` — which exists in the DB schema (`packages/db/src/schema.ts:69`), is returned by all auth queries, and is sent by the `/users/me` endpoint.

The `apps/web/vite.config.ts` already has an alias for `@brewform/shared/types` → `packages/shared/src/types/index.ts`, so importing from `@brewform/shared/types` works in the web app.

## Goals / Non-Goals

**Goals:**
- Eliminate the two duplicate `AuthUser` definitions in the web app
- Establish a structural link between frontend `AuthUser` and the canonical `User` type via `Pick`
- Add the missing `emailVerifiedAt` field to the shared `User` interface
- Ensure `make fmt`, `make lint`, and `make test` all pass after the change

**Non-Goals:**
- Do NOT touch the server-side `AuthUser` in `apps/api/src/modules/auth/service.ts` (it extends `User` with `passwordHash` and uses `Date` for timestamps — different concerns)
- Do NOT fix the `as ReturnType<typeof useAuth>` pattern in web test files (a separate cleanup task)
- Do NOT change any runtime behavior, API responses, or database queries

## Decisions

### Decision 1: Use `Pick<User, ...>` + override rather than hand-written interface

**Rationale**: A hand-written `AuthUser` interface in the shared package would just move the duplication one level up. If `User` ever renames a field (e.g., `displayName` → `name`), a hand-written interface silently diverges. `Pick` creates a compile-time link: renaming a picked field in `User` immediately produces a TypeScript error at the `AuthUser` declaration.

**Alternative considered**: `Omit<User, 'bio' | 'preferences' | ...>` — rejected because it's harder to read and doesn't self-document which fields are included vs. excluded.

### Decision 2: `emailVerifiedAt: string | null` outside the `Pick`

The `Pick` picks structural fields that have the same type in both `User` and the JSON response. `emailVerifiedAt` is intentionally outside because:
- In `User` it will be `Date | null` (after this change)
- In the JSON response it is `string | null` (ISO 8601 serialization)
- The explicit override documents this serialization difference at the type level

### Decision 3: Update ALL web test mock user objects

The plan originally only targeted `CommentSection.test.tsx`. Extended scope to all 7 test files that mock `useAuth`. While the `as ReturnType<typeof useAuth>` casts suppress type errors for missing fields, adding `emailVerifiedAt: null` everywhere ensures correctness and prevents future test failures if a component starts accessing the field.

### Decision 4: No new specs needed

This is a pure internal type consolidation with zero user-visible behavior changes. No API endpoints, components, or database queries are modified.

## Risks / Trade-offs

- **Naming collision**: The shared `AuthUser` and the server-side `AuthUser` in `service.ts` have the same name but different shapes. **Mitigation**: They live in different module scopes (`@brewform/shared/types` vs `apps/api/src/modules/auth/service.ts`). The shared type's JSDoc explicitly calls out this distinction.
- **Test mock inflation**: Adding `emailVerifiedAt: null` to 7 test files adds boilerplate. **Mitigation**: The field is a one-time addition; future field changes to `AuthUser` will produce compile errors in tests, which is desirable.
- **`Pick` fragility**: If `User` gains a required field that `AuthUser` shouldn't include (e.g., `passwordHash`), the `Pick` won't pull it in — but the server-side `AuthUser` extending `User` would. **Mitigation**: This is correct behavior. The frontend `AuthUser` should never include `passwordHash`.
