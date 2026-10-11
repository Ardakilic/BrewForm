# pnpm-workspace

## ADDED Requirements

### Requirement: pnpm workspace layout
The repo SHALL declare `pnpm-workspace.yaml` with `packages: ['apps/*','packages/*']` and a `catalog:` pinning shared versions (`drizzle-orm`, `bcryptjs`, `zod`, plus hoisted `vite/vitest/drizzle-kit/typescript`). Each workspace SHALL be named `@brewform/*` and cross-link via `workspace:*`. `deno.json`, `deno.lock`, `.deno-version` SHALL NOT exist.

---
#### Scenario: Catalog drift caught
- **WHEN** a workspace declares a catalog-pinned dep off-catalog version
- **THEN** the workspace contract test fails.

### Requirement: Pinned, frozen installs
The root `package.json` SHALL pin `packageManager: pnpm@<exact>` with matching `devEngines`, and `.nvmrc` SHALL pin Node 24. CI and Docker SHALL install with `pnpm install --frozen-lockfile` (failing on stale lockfile). Structural pnpm settings SHALL live in `pnpm-workspace.yaml` (`allowBuilds` committed); non-auth `.npmrc` keys SHALL NOT be relied on.

---
#### Scenario: Reproducible install
- **WHEN** CI runs `pnpm install --frozen-lockfile` on a clean runner
- **THEN** it succeeds without updating `pnpm-lock.yaml`.

### Requirement: Script filtering replaces `deno task --cwd`
Per-package scripts SHALL run via `pnpm --filter @brewform/<name> <script>` and repo-wide via `pnpm -r <script>`. One-off tools (drizzle-kit) SHALL run via `pnpm dlx` or a committed devDependency. `deno task` shims SHALL NOT exist.

---
#### Scenario: Filtered DB migration
- **WHEN** running the db migrate script via the `packages/db` filter
- **THEN** only that workspace's script executes.
