## ADDED Requirements

### Requirement: Canonical User type includes emailVerifiedAt
The `User` interface in `@brewform/shared/types` (`packages/shared/src/types/user.ts`) SHALL include `emailVerifiedAt: Date | null`, and server-side types derived from it (such as `AuthUser extends Omit<User, 'preferences'>` in the auth service) SHALL inherit the field instead of redeclaring it.

#### Scenario: Shared User carries the field
- **WHEN** `make check-shared` runs
- **THEN** `User` compiles with `emailVerifiedAt: Date | null`

#### Scenario: Server AuthUser inherits it
- **WHEN** `make check-api` runs
- **THEN** the auth service's `AuthUser` exposes `emailVerifiedAt` without a manual declaration

### Requirement: The web AuthUser type is defined once in the shared package
The client-side `AuthUser` type SHALL be declared once, in `packages/shared/src/types/user.ts`, derived from `User` with `Pick<User, …>` plus an `emailVerifiedAt: string | null` override (JSON transports dates as strings), and the web app SHALL import it from `@brewform/shared/types`.

#### Scenario: Renaming a User field breaks AuthUser at compile time
- **WHEN** a field picked by `AuthUser` is renamed in `User`
- **THEN** `make check-shared` fails at the `AuthUser` declaration

#### Scenario: Web resolves the shared type
- **WHEN** `apps/web/src/api/index.ts` or `apps/web/src/contexts/AuthContext.tsx` imports `AuthUser` from `@brewform/shared/types`
- **THEN** Vite and `tsc` resolve it through the workspace alias

### Requirement: No duplicate AuthUser declarations exist in the web app
`apps/web/src` SHALL contain no `interface AuthUser` or `type AuthUser =` declaration.

#### Scenario: Single source of truth
- **WHEN** `apps/web/src` is searched for `interface AuthUser` and `type AuthUser`
- **THEN** no match is found
