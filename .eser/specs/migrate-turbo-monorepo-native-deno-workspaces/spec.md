# Spec: migrate-turbo-monorepo-native-deno-workspaces

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

Current workflow: make dev → Docker with direct deno run (API: --watch, web: npm:vite). Turbo is never invoked — CI, Makefile, Docker all bypass it. Dual workspace config (npm + Deno) causes confusion, --unstable-sloppy-imports required on every Deno command, 5 node_modules volumes clutter Docker, .turbo/ caches accumulate stale artifacts. No developer or user pain — just unnecessary complexity.

_-- Arda Kilicdagi_

### ambition

1-star (MVP): Turbo removed, deno task orchestration works, --unstable-sloppy-imports eliminated, Docker volumes consolidated, CI cleaner. Zero externally visible change — pure infrastructure improvement. 10-star (dream, DEFERRED): Remove package.json entirely — everything in deno.json imports. Each member deployable independently on Deno Deploy. Not in scope.

_-- Arda Kilicdagi_

### reversibility

Fully reversible via git checkout. deno.json tasks field is backward-compatible. Rollback plan in §14 of plan — restore deleted files, revert edited files, re-run deno install. Two-way door.

_-- Arda Kilicdagi_

### user_impact

Zero user-facing change. No API, UI, or schema modifications. Contributor workflow unchanged — Makefile commands, dev commands, Docker commands all stay identical. Only difference: CI uses deno task instead of direct deno flags.

_-- Arda Kilicdagi_

### verification

Full 20-item checklist at end sufficient. Key items: deno check passes without --unstable-sloppy-imports, deno task --recursive check/tests pass, deno task ci passes, Docker builds, rg unstable-sloppy-imports returns empty, single app_node_modules volume.

_-- Arda Kilicdagi_

### scope_boundary

Must NOT: change app code (routes/services/models/UI), modify DB schema, alter Docker infra services (postgres/mailpit/garage/pgadmin), remove member package.json files, convert npm→jsr imports, touch web/src extension-less imports (Vite handles them).

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

- Must NOT: change app code (routes/services/models/UI), modify DB schema, alter Docker infra services (postgres/mailpit/garage/pgadmin), remove member package.json files, convert npm→jsr imports, touch web/src extension-less imports (Vite handles them).

## Tasks

- [x] task-1: Add .ts extensions to 47 imports in packages/shared/src/ barrel files (6 files: types/index.ts, schemas/index.ts, constants/index.ts, utils/index.ts, index.ts, types/additional-preparation.ts)
Files: packages/shared/src/types/index.ts, packages/shared/src/schemas/index.ts, packages/shared/src/constants/index.ts, packages/shared/src/utils/index.ts, packages/shared/src/index.ts, packages/shared/src/types/additional-preparation.ts
- [x] task-2: Verify deno check apps/api/src/main.ts passes without --unstable-sloppy-imports

Phase 2: Configuration
- [x] task-3: Add nodeModulesDir: auto and 16 tasks to root deno.json
Files: deno.json
- [x] task-4: Add name + 6 tasks to apps/api/deno.json
Files: apps/api/deno.json
- [x] task-5: Add name + 6 tasks to apps/web/deno.json
Files: apps/web/deno.json
- [x] task-6: Add 8 tasks to packages/db/deno.json
Files: packages/db/deno.json
- [x] task-7: Add 4 tasks to packages/shared/deno.json
Files: packages/shared/deno.json
- [x] task-8: Move root package.json devDeps to member package.json files (@std/testing, @std/expect -> api + db; @types/nodemailer -> api)
Files: package.json, apps/api/package.json, packages/db/package.json
- [x] task-9: Remove typescript and turbo from root package.json devDependencies; remove workspace:* deps from member package.json
Files: package.json, apps/api/package.json, packages/db/package.json
- [x] task-10: Verify deno task --recursive check passes
- [x] task-11: Verify deno task --recursive test passes

Phase 3: Turbo Removal
- [x] task-12: Simplify root package.json - remove workspaces, dependencies, devDependencies; rewrite scripts to deno task
Files: package.json
- [x] task-13: Empty scripts in all member package.json files (keep {})
Files: apps/api/package.json, apps/web/package.json, packages/db/package.json, packages/shared/package.json
- [x] task-14: Delete turbo.json
Files: turbo.json
- [x] task-15: Delete .npmrc
Files: .npmrc
- [x] task-16: Delete all .turbo/ directories
- [x] task-17: Delete root node_modules/ and deno.lock
- [x] task-18: Run deno install (regenerates node_modules + deno.lock)
- [x] task-19: Verify deno task ci passes

Phase 4: Docker + Compose
- [x] task-20: Update Dockerfile - remove turbo.json/.npmrc COPY, remove per-pkg node_modules COPY, remove --unstable-sloppy-imports
Files: Dockerfile
- [x] task-21: Update compose.yml - remove 4 per-package node_modules volumes from app and web-dev, remove 4 volume declarations
Files: compose.yml
- [x] task-22: Update .dockerignore - add .turbo/
Files: .dockerignore
- [x] task-23: Rebuild: docker compose build
- [x] task-24: Verify make install succeeds
- [x] task-25: Verify make dev starts both API + web

Phase 5: Makefile + CI
- [x] task-26: Update Makefile - remove all --unstable-sloppy-imports occurrences
Files: Makefile
- [x] task-27: Update .github/workflows/ci.yml - remove --unstable-sloppy-imports, use deno task
Files: .github/workflows/ci.yml
- [x] task-28: Update .github/workflows/pr.yml - same
Files: .github/workflows/pr.yml
- [x] task-29: Update .gitignore - add .turbo/
Files: .gitignore
- [x] task-30: Verify make ci passes
- [x] task-31: Verify make preview works

Phase 6: Documentation
- [x] task-32: Update ADR-001 in docs/decisions.md - remove Turborepo and --unstable-sloppy-imports references
- [x] task-33: Update README.md - remove Turbo from tech stack, update Quick Start
- [x] task-34: Verify rg unstable-sloppy-imports returns empty across repo

Also remove the generic task-1 (deferred dream not in scope), task-2 (duplicate of verification), task-3 (not a tests change), task-4 (covered by Phase 6). Replace Test Strategy with: No new tests needed - this is infra migration, existing tests verify correctness. Replace Performance/Observability/Error Handling/Security with: N/A - no application code changes.

## Verification

- Full 20-item checklist at end sufficient
- Key items: deno check passes without --unstable-sloppy-imports, deno task --recursive check/tests pass, deno task ci passes, Docker builds, rg unstable-sloppy-imports returns empty, single app_node_modules volume.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-15T01:58:10.010Z | - |
