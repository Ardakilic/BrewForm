## MODIFIED Requirements

### Requirement: Code quality gates
The change SHALL pass all repo-mandated code quality gates before commit.

- `make check` (type-check across all workspaces) SHALL pass.
- `make lint` (Biome lint across all apps and packages) SHALL pass.
- `make test` (full Vitest suite via Docker) SHALL pass — including the new test suites added by this change.
- `make fmt` SHALL be applied; `pnpm run fmt-check` (Biome) SHALL pass (CI gate — the build fails on any diff).

#### Scenario: CI green
- **WHEN** all Phase 1-4 tasks are complete and `make check && make lint && make test` runs
- **THEN** all three commands exit 0

#### Scenario: Formatting check passes
- **WHEN** all source edits are saved and `make fmt` runs (applies `biome check --write`)
- **THEN** `git status` shows no unformatted files and `pnpm run fmt-check` (run by the pre-commit hook and CI) passes
