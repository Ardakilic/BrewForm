# Spec: upgrade-deno-281-adopt-new-workspace

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

[STATED] Currently running Deno 2.7.14 in Docker/CI. Dependencies like drizzle-orm, bcryptjs, zod are duplicated across 3 package.json files with explicit versions. CI uses deno install --frozen. No workspace-level dependency catalog exists. Test sanitizers are implicitly on (pre-2.8 default). No version fields on workspace members.

_-- Arda Kilicdagi_

### ambition

[STATED] 1-star: bump Dockerfile to 2.8.1 and regenerate lockfile. 10-star: full workspace management — catalog: protocol for shared npm deps, deno ci (with --prod in Docker runner), version fields on all members, bump-version tasks, re-enabled test sanitizers, updated CI workflows.

_-- Arda Kilicdagi_

### reversibility

[STATED] Fully reversible. Rollback plan provided: revert Dockerfile tags, revert CI commands, revert package.json catalog: entries back to explicit versions, remove catalog block, regenerate lockfile. All changes are config-only.

_-- Arda Kilicdagi_

### user_impact

[STATED] Zero end-user impact. This is a developer-experience and build-pipeline upgrade only. Contributors get consistent dependency resolution and cleaner CI.

_-- Arda Kilicdagi_

### verification

[STATED] Verification steps: (1) docker compose run --rm --no-deps app deno task check (2) docker compose run --rm --no-deps app deno task build (3) docker compose run --rm app deno task test (4) docker compose build runner + make preview (5) Verify CI workflow syntax with act or visual review. Tests must pass with sanitizers re-enabled.

_-- Arda Kilicdagi_

### scope_boundary

[STATED] Do NOT: change application logic, migrate JSR packages to catalog (not supported), change Makefile local-dev targets, modify compose.yml, add new runtime features like import defer, change lint rules unless forced by TS 6.0.3.

_-- Arda Kilicdagi_

## Test Strategy (well-engineered)

_To be addressed during execution._

## Performance Considerations (well-engineered)

_To be addressed during execution._

## Observability Plan (well-engineered)

_To be addressed during execution._

## Error Handling (well-engineered)

_To be addressed during execution._

## Security & Threat Model (well-engineered)

_To be addressed during execution._

## Developer Ergonomics (well-engineered)

_To be addressed during execution._

## Accessibility (beautiful-product)

_To be addressed during execution._

## Out of Scope

- [STATED] Do NOT: change application logic, migrate JSR packages to catalog (not supported), change Makefile local-dev targets, modify compose.yml, add new runtime features like import defer, change lint rules unless forced by TS 6.0.3.

## Tasks

- [x] task-1: Full workspace management — catalog: protocol for shared npm deps, deno ci (with --prod in Docker runner), version fields on all members,...
- [x] task-2: [STATED] Verification steps: (1) docker compose run --rm --no-deps app deno task check (2) docker compose run --rm --no-deps app deno task build (3) docker compose run --rm app deno task test (4) docker compose build runner + make preview (5) Verify CI workflow syntax with act or visual review. Tests must pass with sanitizers re-enabled.
- [x] task-3: Write or update tests for all new and changed behavior
- [x] task-4: Update documentation for all public-facing changes (README, API docs, CHANGELOG)

## Verification

- [STATED] Verification steps: (1) docker compose run --rm --no-deps app deno task check (2) docker compose run --rm --no-deps app deno task build (3) docker compose run --rm app deno task test (4) docker compose build runner + make preview (5) Verify CI workflow syntax with act or visual review
- Tests must pass with sanitizers re-enabled.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-27T23:35:05.359Z | - |
