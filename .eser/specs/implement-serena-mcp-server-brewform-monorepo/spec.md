# Spec: implement-serena-mcp-server-brewform-monorepo

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

AI coding tools (Claude Code, OpenCode) currently read BrewForm files blindly without semantic symbol indexing or type-aware search. The monorepo structure (apps/api, apps/web, packages/shared, packages/db) makes cross-package symbol lookups painful — finding all usages of a shared type requires manual grep. The .claude/ directory confirms Claude Code is already in active use. The reference lilt project proves Serena works and the user wants the same capability here.

_-- Arda Kilicdagi_

### ambition

Complete scope: Docker compose serena service with --profile serena, .serena/project.yml with TypeScript/Deno language support + additional_workspace_folders for all 4 mono repo workspaces, .serena/cache/ and project.local.yml gitignored but other .serena/ files tracked in git, Makefile commands (serena-up, serena-stop, serena-logs, serena-index, serena-health), .mcp.json client config, .gitignore updates, .serena/.gitignore, README section, docs/serena-mcp.md, plan_serena.md. NOT in scope: CI health checks, pre-commit hooks, Deno LSP config tuning (use defaults), modifying Dockerfile, adding Serena to make dev/make up.

_-- Arda Kilicdagi_

### reversibility

All decisions are reversible — ports can change, .serena/ is additive config, --context flag is runtime, additional_workspace_folders is just config. No one-way doors. Removing Serena later leaves zero impact on the application.

_-- Arda Kilicdagi_

### user_impact

No end-user impact. This is developer/contributor tooling only. Nothing changes for API consumers or web app users. New contributors need docs to discover make serena-up.

_-- Arda Kilicdagi_

### verification

Manual smoke-test: make serena-up succeeds, make serena-health returns ok, Serena dashboard loads at http://localhost:34283, AI clients can connect via http://localhost:10122/sse, all 4 workspace folders indexed with cross-package symbol resolution working. No automated tests or CI integration needed.

_-- Arda Kilicdagi_

### scope_boundary

Strictly out of scope: CI integration, pre-commit hooks for re-indexing, Deno LSP configuration tuning, modifying the Dockerfile or application build pipeline, adding Serena as a dependency to make dev or make up scripts. Scope is exactly: docker compose service config, .serena/ configuration, Makefile commands, .mcp.json, .gitignore updates, README section, docs/serena-mcp.md, plan_serena.md.

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

- Strictly out of scope: CI integration, pre-commit hooks for re-indexing, Deno LSP configuration tuning, modifying the Dockerfile or application build pipeline, adding Serena as a dependency to make dev or make up scripts
- Scope is exactly: docker compose service config, .serena/ configuration, Makefile commands, .mcp.json, .gitignore updates, README section, docs/serena-mcp.md, plan_serena.md.

## Tasks

- [x] task-1: Create plan_serena.md — comprehensive implementation plan covering Docker compose service config, .serena/ folder structure and project.yml, volume mapping strategy, Makefile commands, verification checklist. Files: plan_serena.md
- [x] task-2: Add serena service to compose.yml — ghcr.io/oraios/serena:latest image, --profile serena, single volume mount .:/workspace/brewform, SERENA_DOCKER=1 env, ports 10122:9121 (SSE) and 34283:24282 (dashboard), --context desktop-app, --project /workspace/brewform. Files: compose.yml
- [x] task-3: Create .serena/project.yml — TypeScript language, additional_workspace_folders for apps/api, apps/web, packages/shared, packages/db, ignore_all_files_in_gitignore:true, ignored_paths for dist/build/.cache. Files: .serena/project.yml
- [x] task-4: Create .serena/.gitignore — ignore cache/ and project.local.yml. Files: .serena/.gitignore
- [x] task-5: Update root .gitignore — add .serena/cache/ and .serena/project.local.yml entries. Files: .gitignore
- [x] task-6: Create .mcp.json — MCP client config for serena SSE connection at http://localhost:10122/sse. Files: .mcp.json
- [x] task-7: Add Makefile serena commands — serena-up, serena-stop, serena-logs, serena-index, serena-health using docker compose --profile serena. Update .PHONY. Files: Makefile
- [x] task-8: Create docs/serena-mcp.md — Serena architecture overview, setup guide, port mapping, connecting AI clients (Claude Code, OpenCode, VS Code/Cursor), Makefile commands reference, troubleshooting, volume mount explanation, monorepo indexing strategy. Files: docs/serena-mcp.md
- [x] task-9: Update README.md — add Serena MCP section with quickstart, available commands table, port info, client connection instructions. Files: README.md
- [x] task-10: Verification — manual smoke-test: make serena-up, make serena-health, dashboard at :34283, all 4 workspaces indexed.

## Verification

- Manual smoke-test: make serena-up succeeds, make serena-health returns ok, Serena dashboard loads at http://localhost:34283, AI clients can connect via http://localhost:10122/sse, all 4 workspace folders indexed with cross-package symbol resolution working
- No automated tests or CI integration needed.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-17T15:43:19.403Z | - |
