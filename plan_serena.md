# Serena MCP Implementation Plan for BrewForm

## Overview

This plan documents the integration of [Serena](https://github.com/oraios/serena) — a semantic code retrieval MCP server — into the BrewForm monorepo. Serena provides AI coding tools (Claude Code, OpenCode, VS Code/Cursor/Windsurf) with IDE-level understanding of the Deno/TypeScript codebase through symbol indexing, semantic search, and structured editing.

## Architecture

```
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────┐
│   AI Client     │────▶│   Serena Container  │────▶│  TypeScript  │
│  (Claude Code,  │     │   (Docker)          │     │  Language    │
│   OpenCode,     │◀────│   SSE :9121         │◀────│  Server      │
│   VS Code)      │     │   Dashboard :24282  │     │  (ts_ls)     │
└─────────────────┘     └─────────────────────┘     └──────────────┘
        │                        │
   localhost:10122          localhost:34283
   (SSE endpoint)           (Web dashboard)
```

## Implementation Checklist

### Files to Create/Modify

| # | File | Action | Purpose |
|---|------|--------|---------|
| 1 | `plan_serena.md` | CREATE | This document — implementation plan |
| 2 | `compose.yml` | MODIFY | Add `serena` service with `--profile serena` |
| 3 | `.serena/project.yml` | CREATE | Serena project configuration (TypeScript, multi-workspace) |
| 4 | `.serena/.gitignore` | CREATE | Ignore cache and local config |
| 5 | `.gitignore` | MODIFY | Add `.serena/cache/` and `.serena/project.local.yml` entries |
| 6 | `.mcp.json` | CREATE | MCP client configuration for Serena SSE endpoint |
| 7 | `Makefile` | MODIFY | Add `serena-up`, `serena-stop`, `serena-logs`, `serena-index`, `serena-health` |
| 8 | `docs/serena-mcp.md` | CREATE | Comprehensive Serena documentation |
| 9 | `README.md` | MODIFY | Add Serena MCP section |

### Docker Compose Service (`compose.yml`)

```yaml
serena:
  image: ghcr.io/oraios/serena:latest
  container_name: brewform-serena
  restart: unless-stopped
  environment:
    - SERENA_DOCKER=1
  ports:
    - "10122:9121"   # SSE endpoint (MCP clients connect here)
    - "34283:24282"  # Web dashboard
  volumes:
    - .:/workspace/brewform
  command: >
    serena start-mcp-server
      --transport sse
      --port 9121
      --host 0.0.0.0
      --context desktop-app
      --project /workspace/brewform
  profiles:
    - serena
```

#### Key Design Decisions

| Decision | Value | Rationale |
|----------|-------|-----------|
| Image | `ghcr.io/oraios/serena:latest` | Official GitHub Container Registry image, always latest |
| Container name | `brewform-serena` | Project-prefixed to avoid conflicts with other projects |
| Profile | `serena` | On-demand only — does NOT start with `make up` or `make dev`. Users start it explicitly via `make serena-up` |
| Transport | SSE | Required for Docker-based MCP servers; stdio only works for local subprocesses |
| Context | `desktop-app` | Broadest tool set, compatible with all MCP clients (Claude Code, OpenCode, VS Code, Cursor, Windsurf) |
| SSE host port | 10122 | Non-standard to avoid conflicts with other projects (lilt uses 10122) |
| Dashboard host port | 34283 | Non-standard to avoid conflicts with other projects (lilt uses 34283) |
| Volume mount | `.:/workspace/brewform` | Single bind mount of entire project root — simplest approach |
| Restart policy | `unless-stopped` | Container survives Docker daemon restarts but stops cleanly on manual stop |

### Serena Project Configuration (`.serena/project.yml`)

```yaml
project_name: "brewform"

languages:
  - typescript

encoding: "utf-8"

ignore_all_files_in_gitignore: true

ignored_paths:
  - "dist"
  - "build"
  - ".cache"
  - "node_modules"
  - "coverage"
  - ".eser"

additional_workspace_folders:
  - apps/api
  - apps/web
  - packages/shared
  - packages/db

ls_specific_settings: {}

read_only: false

excluded_tools: []

included_optional_tools: []
```

#### Key Settings

| Setting | Value | Rationale |
|---------|-------|-----------|
| `project_name` | `brewform` | Matches project identity |
| `languages` | `[typescript]` | Deno is TypeScript-first; Serena uses `ts_ls` (TypeScript Language Server) |
| `additional_workspace_folders` | 4 workspace members | Enables cross-package symbol resolution across the Deno monorepo |
| `ignore_all_files_in_gitignore` | `true` | Respects `.gitignore` for exclusions (dist, coverage, etc.) |
| `ignored_paths` | dist, build, .cache, node_modules, coverage, .eser | Additional paths to exclude from indexing |
| `ls_specific_settings` | `{}` | Use Serena defaults — no custom LSP tuning needed for Deno |

### Serena Memories (`.serena/`)

The `.serena/` directory stores Serena's project memories (indexes, caches, symbol databases):

```
.serena/
├── .gitignore          # Ignores cache/ and project.local.yml
├── project.yml         # Project configuration (tracked in git)
├── cache/              # Index cache (gitignored — regenerated on first run)
└── project.local.yml   # Local overrides (gitignored — developer-specific)
```

- **Tracked in git**: `project.yml`, `.gitignore`
- **Gitignored** (in both `.serena/.gitignore` and root `.gitignore`): `cache/`, `project.local.yml`
- **No Docker volumes** — memories persist as regular files in the git repository, shared across the team

### Makefile Commands

```makefile
# ── Serena MCP ──────────────────────────────────────────────────────────

serena-up:
	docker compose --profile serena up serena -d

serena-stop:
	docker compose --profile serena down

serena-logs:
	docker compose logs -f serena

serena-index:
	docker compose --profile serena exec serena serena project index /workspace/brewform

serena-health:
	@curl -sf http://localhost:10122/sse > /dev/null 2>&1 && echo "✓ Serena is healthy" || echo "✗ Serena is not responding"
```

Updated `.PHONY` line adds: `serena-up serena-stop serena-logs serena-index serena-health`

### MCP Client Config (`.mcp.json`)

```json
{
  "mcpServers": {
    "serena": {
      "type": "sse",
      "url": "http://localhost:10122/sse"
    }
  }
}
```

This file is recognized by OpenCode and other MCP-compatible editors.

### Git Ignore Updates

**Root `.gitignore` additions:**
```gitignore
# Serena MCP
.serena/cache/
.serena/project.local.yml
```

**`.serena/.gitignore` contents:**
```gitignore
/cache
/project.local.yml
```

Both files need these entries because:
- Root `.gitignore` prevents accidental staging of cache files from the project root
- `.serena/.gitignore` is Serena's own convention for the `.serena/` directory

### Documentation (`docs/serena-mcp.md`)

Comprehensive documentation covering:
1. What is Serena and why BrewForm uses it
2. Architecture diagram
3. Volume mount explanation
4. Startup command flags and rationale
5. Port mapping table
6. Project configuration walkthrough
7. Monorepo indexing strategy (additional_workspace_folders)
8. Connecting AI clients (Claude Code, OpenCode, VS Code/Cursor/Windsurf)
9. Makefile commands reference
10. Ignored paths explanation
11. Troubleshooting (project not found, slow start, stale index, dashboard unreachable)
12. Re-indexing after structural changes
13. TypeScript/Deno language server notes

### README Update

Add a "Serena MCP" section after the existing setup instructions:
- Brief description of Serena
- Quickstart: `make serena-up`
- Available commands table
- Ports table
- Connecting AI clients (Claude Code, OpenCode, VS Code)

## Verification Checklist

After implementation, verify:

- [ ] `make serena-up` starts the container successfully
- [ ] `docker compose --profile serena ps` shows serena as running
- [ ] `make serena-health` returns "✓ Serena is healthy"
- [ ] Serena dashboard is accessible at http://localhost:34283
- [ ] SSE endpoint responds at http://localhost:10122/sse
- [ ] `make serena-logs` shows indexing progress for all 4 workspace folders
- [ ] `make serena-index` triggers re-indexing
- [ ] `make serena-stop` stops the container cleanly
- [ ] Container does NOT start with `make up` or `make dev` (profile isolation)
- [ ] `.serena/cache/` and `.serena/project.local.yml` are gitignored
- [ ] `.serena/project.yml` and `.serena/.gitignore` are tracked by git
- [ ] AI clients can connect via the SSE endpoint

## Reference

- Serena GitHub: https://github.com/oraios/serena
- Serena Docker docs: https://github.com/oraios/serena/blob/main/DOCKER.md
- Serena configuration docs: https://github.com/oraios/serena/blob/main/docs/02-usage/050_configuration.md
- Reference implementation (lilt Go project): https://github.com/Ardakilic/lilt/commit/98a347f3877036de4b7d46fea74c289848431d0c

## Out of Scope

- CI integration for Serena health checks
- Pre-commit hooks that trigger re-indexing on structural changes
- Custom Deno LSP configuration tuning (use Serena defaults)
- Modifying the Dockerfile or application build pipeline
- Adding Serena as a dependency to `make dev` or `make up`