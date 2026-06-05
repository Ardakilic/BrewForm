# Capability: lint-style

## Purpose

This spec defines linting conventions for the BrewForm API and shared packages to ensure style consistency and prevent unnecessary type escape hatches. It establishes that production TypeScript code under `apps/api/src/modules/` and `packages/shared/src/` shall not contain `as any` casts where TypeScript's own type inference (including rest-destructure typing on object literals and Drizzle-inferred row types) already produces an equivalent type, and that test files (`*.test.ts`) under `apps/api/src/` requiring `no-explicit-any` suppression shall use a single file-level `// deno-lint-ignore-file no-explicit-any` directive on line 1 rather than scattered inline suppressions. Together these rules promote readable, type-safe code, keep lint suppressions auditable in one predictable location per file, and reduce noise from defensive casts that add no type information.

## Requirements

### Requirement: Production code shall not contain `as any` casts that are unnecessary for the type system

Production TypeScript files under `apps/api/src/modules/` and `packages/shared/src/` SHALL NOT contain `as any` casts where TypeScript's own type inference — including rest-destructure typing on object literals and Drizzle-inferred row types — produces an equally or more specific type. An `as any` cast is permitted only when a downstream library or runtime API genuinely requires a wider type than the source value carries.

#### Scenario: Password-hash stripping without `as any`
- **WHEN** a service function strips a sensitive field from a Drizzle-inferred user row using rest destructuring (e.g. `const { passwordHash: _passwordHash, ...safe } = user;`)
- **THEN** the file SHALL type-check under `deno check` without any `as any` cast
- **AND** the resulting `safe` object SHALL be inferred as `Omit<UserSelect, 'passwordHash'>` (or equivalent)

#### Scenario: No file-level or inline `deno-lint-ignore` for `no-explicit-any` in `apps/api/src/modules/user/service.ts`
- **WHEN** the file `apps/api/src/modules/user/service.ts` is linted
- **THEN** it SHALL contain zero `// deno-lint-ignore no-explicit-any` directives
- **AND** zero `// deno-lint-ignore-file` directives (the file is fully typed)

### Requirement: Test files shall use file-level `deno-lint-ignore-file` directives

Test files (`*.test.ts`) under `apps/api/src/` that need to suppress `no-explicit-any` SHALL use a single `// deno-lint-ignore-file no-explicit-any` directive on line 1 of the file, followed by a blank line, followed by the file's content (imports, docblocks, test bodies). Inline `// deno-lint-ignore no-explicit-any` directives anywhere in the body of a test file are not permitted.

#### Scenario: Inline suppression converted to file-level
- **WHEN** a test file is migrated from inline `// deno-lint-ignore no-explicit-any` directives to the file-level form
- **THEN** the file SHALL begin with `// deno-lint-ignore-file no-explicit-any` on line 1
- **AND** all inline `// deno-lint-ignore no-explicit-any` comments within the file body SHALL be removed
- **AND** any `as any` casts in the file body SHALL be preserved (only the comment is removed, not the cast)
- **AND** the file SHALL continue to type-check under `deno check` and pass its tests under `deno test`
