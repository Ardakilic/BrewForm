## ADDED Requirements

### Requirement: Canonical User type includes emailVerifiedAt
The `User` interface in `@brewform/shared/types` SHALL include `emailVerifiedAt: Date | null`.

#### Scenario: User type has emailVerifiedAt
- **WHEN** `make check-shared` runs
- **THEN** the `User` type compiles with `emailVerifiedAt: Date | null` present

#### Scenario: Server-side AuthUser picks up emailVerifiedAt
- **WHEN** `make check-api` runs
- **THEN** `AuthUser extends Omit<User, 'preferences'>` in `apps/api/src/modules/auth/service.ts` includes `emailVerifiedAt: Date | null` without manual edit

### Requirement: Single AuthUser type in shared package
The frontend `AuthUser` type SHALL be defined once in `@brewform/shared/types/user.ts` using `Pick<User, ...>` with an `emailVerifiedAt: string | null` override.

#### Scenario: AuthUser is derivable from User
- **WHEN** a field is renamed in the `User` interface
- **THEN** `make check-shared` produces a TypeScript error at the `AuthUser` declaration

#### Scenario: AuthUser is importable by web app
- **WHEN** `apps/web/src/api/index.ts` imports `AuthUser` from `@brewform/shared/types`
- **THEN** Vite resolves the import via the existing alias in `vite.config.ts`

### Requirement: No duplicate AuthUser definitions in web app
The `interface AuthUser` blocks in `apps/web/src/api/index.ts` and `apps/web/src/contexts/AuthContext.tsx` SHALL be removed.

#### Scenario: Single source of truth
- **WHEN** searching for `interface AuthUser` in `apps/web/src/`
- **THEN** no match is found
