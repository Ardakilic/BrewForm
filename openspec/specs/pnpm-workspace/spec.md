# pnpm-workspace Specification

## Purpose

Defines the pnpm monorepo: the `apps/*` and `packages/*` workspace with a shared version catalog, an
exactly pinned pnpm with frozen installs, and structural settings kept in `pnpm-workspace.yaml`.
Scripts are orchestrated with pnpm filters and wrapped in Docker by the Makefile, with Biome,
TypeScript and Vitest as the lint, format, type-check and test toolchain. It replaces the retired
workspace-management capability.

## Requirements
### Requirement: pnpm workspace layout with a shared catalog
The repository SHALL be a pnpm workspace declared in `pnpm-workspace.yaml` with `packages: ['apps/*', 'packages/*']` and exactly four members named `@brewform/api`, `@brewform/web`, `@brewform/shared` and `@brewform/db`, which reference each other with `workspace:*`; shared third-party versions SHALL be pinned once in the `catalog:` block of `pnpm-workspace.yaml` (today `drizzle-orm`, `bcryptjs`, `zod`, `vite`, `vitest`, `drizzle-kit`, `typescript`).

Every member that depends on a catalogued package SHALL reference it as `"catalog:"` and SHALL NOT declare its own range for it.

#### Scenario: Catalog drift is caught
- **WHEN** a member `package.json` declares a catalogued dependency with a literal range (for example `"vitest": "^5.1.0"` in `apps/web/package.json`)
- **THEN** `packages/shared/src/workspace.test.ts` fails and names the member and the dependency

#### Scenario: Every catalog reference resolves
- **WHEN** a member declares `"<dep>": "catalog:"`
- **THEN** `<dep>` exists as a key in the root `catalog:` block, otherwise the workspace test fails

### Requirement: pnpm is pinned exactly and installs are frozen
The root `package.json` SHALL pin `packageManager` to an exact pnpm version (today `pnpm@12.18.0`) with a matching `devEngines.packageManager` entry, and every other pnpm pin — the `npm install -g pnpm@<version>` line in both Dockerfiles and the `version:` input of every `pnpm/action-setup` step — SHALL equal it; CI and Docker SHALL install with `pnpm install --frozen-lockfile` (Docker: `pnpm fetch` followed by `pnpm install --frozen-lockfile --offline`), so a stale `pnpm-lock.yaml` fails the install instead of being rewritten.

#### Scenario: Reproducible install
- **WHEN** CI runs `pnpm install --frozen-lockfile` on a clean runner
- **THEN** it succeeds without modifying `pnpm-lock.yaml`

#### Scenario: pnpm pins agree
- **WHEN** `packages/shared/src/workspace.test.ts` runs
- **THEN** it asserts that `packageManager`, `devEngines.packageManager.version`, both Dockerfiles and every `pnpm/action-setup` `version:` input name the same pnpm version

### Requirement: Structural pnpm settings live in pnpm-workspace.yaml
Build-script approvals (`allowBuilds`), release-age policy (`minimumReleaseAge` / `minimumReleaseAgeExclude`) and the catalog SHALL be committed in `pnpm-workspace.yaml` so CI installs non-interactively, and its comments SHALL describe the current pnpm setup only (no references to a previous runtime's catalog or lockfile).

#### Scenario: Non-interactive install with native builds
- **WHEN** CI installs dependencies that ship postinstall scripts (for example `esbuild`)
- **THEN** the install completes without an approval prompt because the package is listed under `allowBuilds`

#### Scenario: Workspace file comments are current
- **WHEN** `pnpm-workspace.yaml` is read
- **THEN** its comments describe the pnpm catalog and contain no mention of a previous runtime's catalog or lockfile

### Requirement: Scripts are orchestrated with pnpm filters and the Makefile wraps them in Docker
Per-package scripts SHALL run as `pnpm --filter @brewform/<name> run <script>` and repo-wide aggregates (`check`, `lint`, `test`, `build`, `test-coverage`, `fmt`, `fmt-check`, `db:*`, `email-build`, `ci`) SHALL be root `package.json` scripts composed from those filters; every documented `make` target that wraps a workspace script SHALL run it inside the `app` compose container so contributors need no host Node or pnpm, and the `## help` text of every target SHALL describe what the target actually runs.

#### Scenario: Filtered DB migration
- **WHEN** `pnpm run db:migrate` runs
- **THEN** only `@brewform/db`'s `migrate` script (`drizzle-kit migrate`) executes

#### Scenario: Make help text matches behaviour
- **WHEN** `make help` is printed
- **THEN** `check-web` is described as a type-check (it runs `tsc --noEmit -p tsconfig.json` through `pnpm run check:web`), not as a lint

### Requirement: Lint, format, type-check and test toolchain
The toolchain SHALL be Biome for formatting and linting (`biome check` via each member's `lint` script and the root `fmt` / `fmt-check` scripts, configured in `biome.json`), the TypeScript compiler from the catalog for type-checking (`tsc --noEmit` via each member's `check` script), and Vitest for tests (`vitest run` via each member's `test` script, configured per member in `vitest.config.ts` with native `coverage.thresholds`).

No second formatter, linter, type-checker or test runner SHALL be configured.

#### Scenario: CI runs the four gates
- **WHEN** the `quality` job of `.github/workflows/ci.yml` runs
- **THEN** it executes `pnpm run fmt-check`, `pnpm run lint` and `pnpm run check`, and the `test` job executes `vitest run` through the members' `test` scripts

#### Scenario: Coverage thresholds are enforced by Vitest
- **WHEN** `pnpm run test-coverage` runs and a member falls below a `coverage.thresholds` value in its `vitest.config.ts`
- **THEN** Vitest exits non-zero

